import type {
  TCompany,
  TCompanyCreate,
  TCompanyUpdate,
  TListQuery,
  TPage
} from '@open-sales/shared'
import {
  canEditCompany,
  canReassign,
  companyCreateSchema,
  companyUpdateSchema
} from '@open-sales/shared'
import type { SQL } from 'drizzle-orm'
import { and, asc, eq, ilike, isNotNull, isNull, ne, sql } from 'drizzle-orm'

import type { TDatabase } from '../db/client'
import { company, deal, person, user } from '../db/schema'
import type { TActor, TLogEntry, TQueries } from './common'
import {
  assertCanOwn,
  ChangedSinceError,
  containing,
  decodeCursor,
  diffFields,
  DuplicateError,
  InvalidChangeError,
  isoOrNull,
  logChanges,
  NotAllowedError,
  RecordNotFoundError,
  toPage,
  uniqueViolation
} from './common'

type TCompanyRow = typeof company.$inferSelect

const toCompany = (
  row: TCompanyRow,
  ownerName: string,
  me: TActor
): TCompany => ({
  id: row.id,
  name: row.name,
  domain: row.domain,
  industry: row.industry,
  description: row.description,
  owner: { id: row.ownerId, name: ownerName },
  customFields: row.customFields,
  source: row.source,
  lastActivityAt: isoOrNull(row.lastActivityAt),
  version: row.version,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  archivedAt: isoOrNull(row.archivedAt),
  canEdit: canEditCompany(me.role, me.id, row.ownerId)
})

const NOT_FOUND = () => new RecordNotFoundError('company')

/** Someone else's company already uses this domain. */
const assertDomainFree = async (
  tx: TQueries,
  domain: string | null | undefined,
  exceptId?: string
) => {
  if (!domain) return
  const [taken] = await tx
    .select({ name: company.name })
    .from(company)
    .where(
      and(
        eq(company.domain, domain),
        isNull(company.archivedAt),
        exceptId ? ne(company.id, exceptId) : undefined
      )
    )
  if (taken) {
    throw new DuplicateError(
      'domain_taken',
      `${taken.name} already uses ${domain}. Open it instead.`
    )
  }
}

/** Unique domains, when two people save at the same moment. */
const mapDuplicate = (error: unknown) => {
  if (uniqueViolation(error) === 'company_domain_idx') {
    return new DuplicateError(
      'domain_taken',
      'Another company already uses that domain.'
    )
  }
  return error
}

/** Loads a company to change, locked until the transaction ends. */
const lockCompany = async (tx: TQueries, id: string) => {
  const [row] = await tx
    .select()
    .from(company)
    .where(eq(company.id, id))
    .for('update')
  if (!row) throw NOT_FOUND()
  return row
}

const assertMayEdit = (me: TActor, row: TCompanyRow) => {
  if (!canEditCompany(me.role, me.id, row.ownerId)) {
    throw new NotAllowedError(
      'Only the owner, a manager or an admin can change this company.'
    )
  }
}

export const createCompanyService = (db: TDatabase) => {
  const getOne = async (me: TActor, id: string): Promise<TCompany> => {
    const [found] = await db
      .select({ row: company, ownerName: user.name })
      .from(company)
      .innerJoin(user, eq(user.id, company.ownerId))
      .where(eq(company.id, id))
    if (!found) throw NOT_FOUND()
    return toCompany(found.row, found.ownerName, me)
  }

  return {
    get: getOne,

    /** A–Z, mine or everyone's, paged by name then id. */
    list: async (me: TActor, query: TListQuery): Promise<TPage<TCompany>> => {
      const after = decodeCursor(query.cursor)
      const conditions: (SQL | undefined)[] = [
        query.archived
          ? isNotNull(company.archivedAt)
          : isNull(company.archivedAt),
        query.owner === 'me' ? eq(company.ownerId, me.id) : undefined,
        query.q ? ilike(company.name, containing(query.q)) : undefined,
        after
          ? sql`(${company.name}, ${company.id}) > (${after.key}, ${after.id})`
          : undefined
      ]
      const rows = await db
        .select({ row: company, ownerName: user.name })
        .from(company)
        .innerJoin(user, eq(user.id, company.ownerId))
        .where(and(...conditions))
        .orderBy(asc(company.name), asc(company.id))
        .limit(query.limit + 1)
      return toPage(
        rows,
        query.limit,
        ({ row, ownerName }) => toCompany(row, ownerName, me),
        ({ row }) => [row.name, row.id]
      )
    },

    create: async (me: TActor, input: TCompanyCreate): Promise<TCompany> => {
      const data = companyCreateSchema.parse(input)
      const ownerId = data.ownerId ?? me.id
      if (ownerId !== me.id && !canReassign(me.role)) {
        throw new NotAllowedError(
          'Only managers and admins can give a company to someone else.'
        )
      }

      const id = await db
        .transaction(async (tx) => {
          await assertCanOwn(tx, ownerId)
          await assertDomainFree(tx, data.domain)
          const [created] = await tx
            .insert(company)
            .values({ ...data, ownerId })
            .returning()
          await logChanges(tx, me, [
            {
              recordType: 'company',
              recordId: created.id,
              action: 'create',
              changes: diffFields({}, { ...data, ownerId })
            }
          ])
          return created.id
        })
        .catch((error: unknown) => {
          throw mapDuplicate(error)
        })
      return getOne(me, id)
    },

    /**
     * Changes what's sent. A new owner also takes over the open deals the
     * old owner had on this company.
     */
    update: async (
      me: TActor,
      id: string,
      input: TCompanyUpdate
    ): Promise<TCompany> => {
      const { version, ...data } = companyUpdateSchema.parse(input)

      await db
        .transaction(async (tx) => {
          const row = await lockCompany(tx, id)
          assertMayEdit(me, row)
          if (row.archivedAt) {
            throw new InvalidChangeError('Restore this company to change it.')
          }
          if (row.version !== version) throw new ChangedSinceError()

          const changes = diffFields(row, data)
          if (changes.length === 0) return

          const newOwnerId = data.ownerId
          const isNewOwner =
            newOwnerId !== undefined && newOwnerId !== row.ownerId
          if (isNewOwner) {
            if (!canReassign(me.role)) {
              throw new NotAllowedError(
                'Only managers and admins can give a company to someone else.'
              )
            }
            await assertCanOwn(tx, newOwnerId)
          }
          if (data.domain !== undefined && data.domain !== row.domain) {
            await assertDomainFree(tx, data.domain, id)
          }

          await tx
            .update(company)
            .set({ ...data, version: sql`${company.version} + 1` })
            .where(eq(company.id, id))
          const log: TLogEntry[] = [
            { recordType: 'company', recordId: id, action: 'update', changes }
          ]

          if (isNewOwner) {
            const moved = await tx
              .update(deal)
              .set({ ownerId: newOwnerId, version: sql`${deal.version} + 1` })
              .where(
                and(
                  eq(deal.companyId, id),
                  eq(deal.ownerId, row.ownerId),
                  eq(deal.status, 'open'),
                  isNull(deal.archivedAt)
                )
              )
              .returning({ id: deal.id })
            for (const { id: dealId } of moved) {
              log.push({
                recordType: 'deal',
                recordId: dealId,
                action: 'update',
                changes: [
                  { field: 'ownerId', from: row.ownerId, to: newOwnerId }
                ]
              })
            }
          }
          await logChanges(tx, me, log)
        })
        .catch((error: unknown) => {
          throw mapDuplicate(error)
        })
      return getOne(me, id)
    },

    /** Archives the company with its people and open deals, all at once. */
    archive: async (
      me: TActor,
      id: string,
      version: number
    ): Promise<TCompany> => {
      await db.transaction(async (tx) => {
        const row = await lockCompany(tx, id)
        assertMayEdit(me, row)
        if (row.archivedAt) return
        if (row.version !== version) throw new ChangedSinceError()

        // One timestamp, so Restore brings back exactly these rows.
        const archivedAt = new Date()
        await tx
          .update(company)
          .set({ archivedAt, version: sql`${company.version} + 1` })
          .where(eq(company.id, id))
        const people = await tx
          .update(person)
          .set({ archivedAt, version: sql`${person.version} + 1` })
          .where(and(eq(person.companyId, id), isNull(person.archivedAt)))
          .returning({ id: person.id })
        const deals = await tx
          .update(deal)
          .set({ archivedAt, version: sql`${deal.version} + 1` })
          .where(
            and(
              eq(deal.companyId, id),
              eq(deal.status, 'open'),
              isNull(deal.archivedAt)
            )
          )
          .returning({ id: deal.id })
        await logChanges(tx, me, [
          { recordType: 'company', recordId: id, action: 'archive' },
          ...people.map((p) => ({
            recordType: 'person' as const,
            recordId: p.id,
            action: 'archive' as const
          })),
          ...deals.map((d) => ({
            recordType: 'deal' as const,
            recordId: d.id,
            action: 'archive' as const
          }))
        ])
      })
      return getOne(me, id)
    },

    /** Brings back the company and what was archived with it. */
    restore: async (
      me: TActor,
      id: string,
      version: number
    ): Promise<TCompany> => {
      await db
        .transaction(async (tx) => {
          const row = await lockCompany(tx, id)
          assertMayEdit(me, row)
          const { archivedAt } = row
          if (!archivedAt) return
          if (row.version !== version) throw new ChangedSinceError()
          await assertDomainFree(tx, row.domain, id)

          await tx
            .update(company)
            .set({ archivedAt: null, version: sql`${company.version} + 1` })
            .where(eq(company.id, id))
          const people = await tx
            .update(person)
            .set({ archivedAt: null, version: sql`${person.version} + 1` })
            .where(
              and(eq(person.companyId, id), eq(person.archivedAt, archivedAt))
            )
            .returning({ id: person.id })
          const deals = await tx
            .update(deal)
            .set({ archivedAt: null, version: sql`${deal.version} + 1` })
            .where(and(eq(deal.companyId, id), eq(deal.archivedAt, archivedAt)))
            .returning({ id: deal.id })
          await logChanges(tx, me, [
            { recordType: 'company', recordId: id, action: 'restore' },
            ...people.map((p) => ({
              recordType: 'person' as const,
              recordId: p.id,
              action: 'restore' as const
            })),
            ...deals.map((d) => ({
              recordType: 'deal' as const,
              recordId: d.id,
              action: 'restore' as const
            }))
          ])
        })
        .catch((error: unknown) => {
          if (uniqueViolation(error) === 'person_email_idx') {
            throw new DuplicateError(
              'email_taken',
              'One of its people has an email someone else now uses. Change one of them first.'
            )
          }
          throw mapDuplicate(error)
        })
      return getOne(me, id)
    }
  }
}

export type TCompanyService = ReturnType<typeof createCompanyService>
