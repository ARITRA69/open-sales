import type {
  TListQuery,
  TPage,
  TPerson,
  TPersonCreate,
  TPersonUpdate
} from '@open-sales/shared'
import {
  canEditPerson,
  personCreateSchema,
  personUpdateSchema
} from '@open-sales/shared'
import type { SQL } from 'drizzle-orm'
import {
  and,
  asc,
  eq,
  ilike,
  isNotNull,
  isNull,
  ne,
  or,
  sql
} from 'drizzle-orm'

import type { TDatabase } from '../db/client'
import { company, dealPerson, person } from '../db/schema'
import type { TActor, TQueries } from './common'
import {
  ChangedSinceError,
  containing,
  decodeCursor,
  diffFields,
  DuplicateError,
  InvalidChangeError,
  isoOrNull,
  isRecordId,
  logChanges,
  NotAllowedError,
  RecordNotFoundError,
  toPage,
  uniqueViolation
} from './common'

type TPersonRow = typeof person.$inferSelect
type TCompanyRef = { id: string; name: string; ownerId: string }

const toPerson = (
  row: TPersonRow,
  ofCompany: TCompanyRef,
  me: TActor
): TPerson => ({
  id: row.id,
  name: row.name,
  title: row.title,
  email: row.email,
  phone: row.phone,
  linkedinUrl: row.linkedinUrl,
  company: { id: ofCompany.id, name: ofCompany.name },
  customFields: row.customFields,
  source: row.source,
  lastActivityAt: isoOrNull(row.lastActivityAt),
  version: row.version,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  archivedAt: isoOrNull(row.archivedAt),
  canEdit: canEditPerson(me.role, me.id, ofCompany.ownerId)
})

const NOT_FOUND = () => new RecordNotFoundError('person')

const companyRef = {
  id: company.id,
  name: company.name,
  ownerId: company.ownerId
}

const NOT_ALLOWED =
  'Only the company’s owner, a manager or an admin can change its people.'

// A record's own people, unpaged: a company has tens, not thousands.
const RELATED_LIMIT = 500

/** The company a person is (or is going) at, if it's live and they may edit it. */
const companyToEdit = async (tx: TQueries, me: TActor, companyId: string) => {
  const [found] = isRecordId(companyId)
    ? await tx
        .select({ ...companyRef, archivedAt: company.archivedAt })
        .from(company)
        .where(eq(company.id, companyId))
    : []
  if (!found || found.archivedAt) {
    throw new InvalidChangeError('Choose a company that’s still in use.')
  }
  if (!canEditPerson(me.role, me.id, found.ownerId)) {
    throw new NotAllowedError(NOT_ALLOWED)
  }
  return found
}

const assertEmailFree = async (
  tx: TQueries,
  email: string | null | undefined,
  exceptId?: string
) => {
  if (!email) return
  const [taken] = await tx
    .select({ name: person.name, companyName: company.name })
    .from(person)
    .innerJoin(company, eq(company.id, person.companyId))
    .where(
      and(
        eq(person.email, email),
        isNull(person.archivedAt),
        exceptId ? ne(person.id, exceptId) : undefined
      )
    )
  if (taken) {
    throw new DuplicateError(
      'email_taken',
      `${taken.name} at ${taken.companyName} already has ${email}.`
    )
  }
}

const mapDuplicate = (error: unknown) =>
  uniqueViolation(error) === 'person_email_idx'
    ? new DuplicateError(
        'email_taken',
        'Someone else already has that email address.'
      )
    : error

const lockPerson = async (tx: TQueries, id: string) => {
  const [found] = await tx
    .select({ row: person, ownerId: company.ownerId })
    .from(person)
    .innerJoin(company, eq(company.id, person.companyId))
    .where(eq(person.id, id))
    .for('update', { of: person })
  if (!found) throw NOT_FOUND()
  return found
}

export const createPersonService = (db: TDatabase) => {
  const getOne = async (me: TActor, id: string): Promise<TPerson> => {
    const [found] = await db
      .select({ row: person, ofCompany: companyRef })
      .from(person)
      .innerJoin(company, eq(company.id, person.companyId))
      .where(eq(person.id, id))
    if (!found) throw NOT_FOUND()
    return toPerson(found.row, found.ofCompany, me)
  }

  return {
    get: getOne,

    /** A–Z, paged by name then id. "Mine" means at companies I own. */
    list: async (me: TActor, query: TListQuery): Promise<TPage<TPerson>> => {
      const after = decodeCursor(query.cursor)
      const conditions: (SQL | undefined)[] = [
        query.archived
          ? isNotNull(person.archivedAt)
          : isNull(person.archivedAt),
        query.owner === 'me' ? eq(company.ownerId, me.id) : undefined,
        query.q
          ? or(
              ilike(person.name, containing(query.q)),
              ilike(person.email, containing(query.q))
            )
          : undefined,
        after
          ? sql`(${person.name}, ${person.id}) > (${after.key}, ${after.id})`
          : undefined
      ]
      const rows = await db
        .select({ row: person, ofCompany: companyRef })
        .from(person)
        .innerJoin(company, eq(company.id, person.companyId))
        .where(and(...conditions))
        .orderBy(asc(person.name), asc(person.id))
        .limit(query.limit + 1)
      return toPage(
        rows,
        query.limit,
        ({ row, ofCompany }) => toPerson(row, ofCompany, me),
        ({ row }) => [row.name, row.id]
      )
    },

    /** Everyone at one company, A–Z: its People tab. */
    listAt: async (me: TActor, companyId: string): Promise<TPerson[]> => {
      if (!isRecordId(companyId)) return []
      const rows = await db
        .select({ row: person, ofCompany: companyRef })
        .from(person)
        .innerJoin(company, eq(company.id, person.companyId))
        .where(and(eq(person.companyId, companyId), isNull(person.archivedAt)))
        .orderBy(asc(person.name), asc(person.id))
        .limit(RELATED_LIMIT)
      return rows.map(({ row, ofCompany }) => toPerson(row, ofCompany, me))
    },

    /** The people linked to a deal, A–Z. */
    listOnDeal: async (me: TActor, dealId: string): Promise<TPerson[]> => {
      if (!isRecordId(dealId)) return []
      const rows = await db
        .select({ row: person, ofCompany: companyRef })
        .from(dealPerson)
        .innerJoin(person, eq(person.id, dealPerson.personId))
        .innerJoin(company, eq(company.id, person.companyId))
        .where(and(eq(dealPerson.dealId, dealId), isNull(person.archivedAt)))
        .orderBy(asc(person.name), asc(person.id))
        .limit(RELATED_LIMIT)
      return rows.map(({ row, ofCompany }) => toPerson(row, ofCompany, me))
    },

    create: async (me: TActor, input: TPersonCreate): Promise<TPerson> => {
      const data = personCreateSchema.parse(input)
      const id = await db
        .transaction(async (tx) => {
          await companyToEdit(tx, me, data.companyId)
          await assertEmailFree(tx, data.email)
          const [created] = await tx.insert(person).values(data).returning()
          await logChanges(tx, me, [
            {
              recordType: 'person',
              recordId: created.id,
              action: 'create',
              changes: diffFields({}, data)
            }
          ])
          return created.id
        })
        .catch((error: unknown) => {
          throw mapDuplicate(error)
        })
      return getOne(me, id)
    },

    /** Moving someone to another company needs rights on both. */
    update: async (
      me: TActor,
      id: string,
      input: TPersonUpdate
    ): Promise<TPerson> => {
      const { version, ...data } = personUpdateSchema.parse(input)
      await db
        .transaction(async (tx) => {
          const { row, ownerId } = await lockPerson(tx, id)
          if (!canEditPerson(me.role, me.id, ownerId)) {
            throw new NotAllowedError(NOT_ALLOWED)
          }
          if (row.archivedAt) {
            throw new InvalidChangeError('Restore this person to change them.')
          }
          if (row.version !== version) throw new ChangedSinceError()

          const changes = diffFields(row, data)
          if (changes.length === 0) return
          if (data.companyId && data.companyId !== row.companyId) {
            await companyToEdit(tx, me, data.companyId)
          }
          if (data.email !== undefined && data.email !== row.email) {
            await assertEmailFree(tx, data.email, id)
          }

          await tx
            .update(person)
            .set({ ...data, version: sql`${person.version} + 1` })
            .where(eq(person.id, id))
          await logChanges(tx, me, [
            { recordType: 'person', recordId: id, action: 'update', changes }
          ])
        })
        .catch((error: unknown) => {
          throw mapDuplicate(error)
        })
      return getOne(me, id)
    },

    archive: async (
      me: TActor,
      id: string,
      version: number
    ): Promise<TPerson> => {
      await db.transaction(async (tx) => {
        const { row, ownerId } = await lockPerson(tx, id)
        if (!canEditPerson(me.role, me.id, ownerId)) {
          throw new NotAllowedError(NOT_ALLOWED)
        }
        if (row.archivedAt) return
        if (row.version !== version) throw new ChangedSinceError()
        await tx
          .update(person)
          .set({ archivedAt: new Date(), version: sql`${person.version} + 1` })
          .where(eq(person.id, id))
        await logChanges(tx, me, [
          { recordType: 'person', recordId: id, action: 'archive' }
        ])
      })
      return getOne(me, id)
    },

    restore: async (
      me: TActor,
      id: string,
      version: number
    ): Promise<TPerson> => {
      await db
        .transaction(async (tx) => {
          const { row, ownerId } = await lockPerson(tx, id)
          if (!canEditPerson(me.role, me.id, ownerId)) {
            throw new NotAllowedError(NOT_ALLOWED)
          }
          if (!row.archivedAt) return
          if (row.version !== version) throw new ChangedSinceError()
          // Their company must be in use: restore it first.
          await companyToEdit(tx, me, row.companyId)
          await assertEmailFree(tx, row.email, id)
          await tx
            .update(person)
            .set({ archivedAt: null, version: sql`${person.version} + 1` })
            .where(eq(person.id, id))
          await logChanges(tx, me, [
            { recordType: 'person', recordId: id, action: 'restore' }
          ])
        })
        .catch((error: unknown) => {
          throw mapDuplicate(error)
        })
      return getOne(me, id)
    }
  }
}

export type TPersonService = ReturnType<typeof createPersonService>
