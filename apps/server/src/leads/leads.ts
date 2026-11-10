import type {
  TLead,
  TLeadAssign,
  TLeadConvert,
  TLeadConverted,
  TLeadCreate,
  TLeadDisqualify,
  TLeadListQuery,
  TLeadMatch,
  TPage
} from '@open-sales/shared'
import {
  canAddDealOnConvert,
  canAssignLead,
  canChangeAnything,
  canConvertLeadInto,
  canEditCompany,
  canWorkLead,
  companyDomainOfEmail,
  isOpenLead,
  leadAssignSchema,
  leadConvertSchema,
  leadCreateSchema,
  leadDisqualifySchema
} from '@open-sales/shared'
import type { SQL } from 'drizzle-orm'
import { and, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm'
import { z } from 'zod'

import type { TDatabase } from '../db/client'
import { company, deal, dealPerson, lead, person, user } from '../db/schema'
import type { TActor, TQueries } from '../records/common'
import {
  assertCanOwn,
  ChangedSinceError,
  containing,
  decodeCursor,
  diffFields,
  InvalidChangeError,
  isRecordId,
  logChanges,
  NotAllowedError,
  RecordNotFoundError,
  toPage
} from '../records/common'
import { createCompanyService } from '../records/companies'
import { createDealService } from '../records/deals'
import { createPersonService } from '../records/people'
import { findLeadMatch } from './match'

type TLeadRow = typeof lead.$inferSelect

/**
 * What the person was shown before converting is no longer what's there:
 * someone added (or archived) the account in between.
 */
export class MatchChangedError extends Error {
  constructor() {
    super(
      'The accounts changed while you were deciding. Look at what this lead matches now, then convert.'
    )
  }
}

const NOT_FOUND = () => new RecordNotFoundError('lead')

const NOT_YOURS =
  'This lead is with a teammate. Only they, a manager or an admin can work it.'

const toLead = (
  row: TLeadRow,
  ownerName: string | null,
  me: TActor
): TLead => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone,
  companyName: row.companyName,
  title: row.title,
  message: row.message,
  source: row.source,
  status: row.status,
  owner: row.ownerId && ownerName ? { id: row.ownerId, name: ownerName } : null,
  fitNote: row.fitNote,
  disqualifiedReason: row.disqualifiedReason,
  convertedCompanyId: row.convertedCompanyId,
  convertedPersonId: row.convertedPersonId,
  convertedDealId: row.convertedDealId,
  version: row.version,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  canWork: canWorkLead(me.role, me.id, row.ownerId),
  canAssign: canChangeAnything(me.role),
  canTake: canAssignLead(me.role, me.id, row.ownerId, me.id)
})

/** Leads with their owner's name, for every read. */
const selectLeads = (db: TQueries) =>
  db
    .select({
      row: lead,
      ownerName: user.name,
      // Postgres keeps microseconds and JavaScript doesn't, so the paging
      // cursor carries the time as text, exactly as stored.
      arrivedAt: sql<string>`to_char(${lead.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
    })
    .from(lead)
    .leftJoin(user, eq(user.id, lead.ownerId))

/** Loads a lead to change, locked until the transaction ends. */
const lockLead = async (tx: TQueries, id: string) => {
  const [row] = await tx
    .select()
    .from(lead)
    .where(eq(lead.id, id))
    .for('update')
  if (!row) throw NOT_FOUND()
  return row
}

/*
 * The record services open their own transactions; given one, those become
 * savepoints inside it, so everything convert does lands or fails together.
 */
const recordServicesIn = (tx: TQueries) => {
  const db = tx as unknown as TDatabase
  return {
    companies: createCompanyService(db),
    people: createPersonService(db),
    deals: createDealService(db)
  }
}

/**
 * Adding a person checks the company's owner. Converting a lead is the one
 * stated exception (see `canConvertLeadInto`), so that single call runs with
 * a manager's rights. The change log still names the real person.
 */
const asLeadConverter = (me: TActor): TActor => ({ ...me, role: 'manager' })

/** A record service refusing a lead's details, in words for the person. */
const explainInvalid = (error: unknown) =>
  error instanceof z.ZodError
    ? new InvalidChangeError(
        `This lead’s details need fixing first: ${error.issues[0].message}.`
      )
    : error

/** A company's domain column takes "halden.com", not every email domain. */
const usableDomain = (email: string | null) => {
  const domain = companyDomainOfEmail(email)
  return domain && /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(domain)
    ? domain
    : undefined
}

export const createLeadsService = (db: TDatabase) => {
  const getOne = async (me: TActor, id: string): Promise<TLead> => {
    const [found] = await selectLeads(db).where(eq(lead.id, id))
    if (!found) throw NOT_FOUND()
    return toLead(found.row, found.ownerName, me)
  }

  /**
   * One change to a lead: `decide` refuses it or says what to set. Then the
   * version check, the write and the change log, in one transaction.
   */
  const change = async (
    me: TActor,
    id: string,
    version: number,
    decide: (
      row: TLeadRow,
      tx: TQueries
    ) => Promise<Partial<TLeadRow>> | Partial<TLeadRow>
  ): Promise<TLead> => {
    await db.transaction(async (tx) => {
      const row = await lockLead(tx, id)
      const patch = await decide(row, tx)
      if (row.version !== version) throw new ChangedSinceError()
      const changes = diffFields(row, patch)
      if (changes.length === 0) return
      await tx
        .update(lead)
        .set({ ...patch, version: sql`${lead.version} + 1` })
        .where(eq(lead.id, id))
      await logChanges(tx, me, [
        { recordType: 'lead', recordId: id, action: 'update', changes }
      ])
    })
    return getOne(me, id)
  }

  const assertMayWork = (me: TActor, row: TLeadRow) => {
    if (!canWorkLead(me.role, me.id, row.ownerId)) {
      throw new NotAllowedError(NOT_YOURS)
    }
  }

  return {
    get: getOne,

    /** Newest first, paged by when it arrived and then id. */
    list: async (me: TActor, query: TLeadListQuery): Promise<TPage<TLead>> => {
      const cursor = decodeCursor(query.cursor)
      const after =
        cursor?.key && isRecordId(cursor.id)
          ? { key: cursor.key, id: cursor.id }
          : null
      const conditions: (SQL | undefined)[] = [
        query.status === 'any'
          ? undefined
          : query.status === 'open'
            ? inArray(lead.status, ['new', 'qualified'])
            : eq(lead.status, query.status),
        query.owner === 'me'
          ? eq(lead.ownerId, me.id)
          : query.owner === 'none'
            ? isNull(lead.ownerId)
            : undefined,
        query.q
          ? or(
              ilike(lead.name, containing(query.q)),
              ilike(lead.email, containing(query.q)),
              ilike(lead.companyName, containing(query.q))
            )
          : undefined,
        after
          ? sql`(${lead.createdAt}, ${lead.id}) < (${after.key}::timestamptz, ${after.id}::uuid)`
          : undefined
      ]
      const rows = await selectLeads(db)
        .where(and(...conditions))
        .orderBy(desc(lead.createdAt), desc(lead.id))
        .limit(query.limit + 1)
      return toPage(
        rows,
        query.limit,
        ({ row, ownerName }) => toLead(row, ownerName, me),
        ({ row, arrivedAt }) => [arrivedAt, row.id]
      )
    },

    /**
     * A lead typed in by hand. It's the person's own unless they say
     * otherwise; only managers and admins may name someone else.
     */
    create: async (me: TActor, input: TLeadCreate): Promise<TLead> => {
      const { ownerId: chosen, ...data } = leadCreateSchema.parse(input)
      const ownerId = chosen === undefined ? me.id : chosen
      if (
        ownerId !== null &&
        ownerId !== me.id &&
        !canChangeAnything(me.role)
      ) {
        throw new NotAllowedError(
          'Only managers and admins can give a lead to someone else.'
        )
      }
      const id = await db.transaction(async (tx) => {
        if (ownerId) await assertCanOwn(tx, ownerId)
        const values = { ...data, ownerId, source: 'manual' }
        const [created] = await tx.insert(lead).values(values).returning()
        await logChanges(tx, me, [
          {
            recordType: 'lead',
            recordId: created.id,
            action: 'create',
            changes: diffFields({}, values)
          }
        ])
        return created.id
      })
      return getOne(me, id)
    },

    /** Gives a lead to a teammate, or (null) back to nobody. */
    assign: async (
      me: TActor,
      id: string,
      input: TLeadAssign
    ): Promise<TLead> => {
      const { version, ownerId } = leadAssignSchema.parse(input)
      return change(me, id, version, async (row, tx) => {
        if (ownerId === row.ownerId) return {}
        if (!canAssignLead(me.role, me.id, row.ownerId, ownerId)) {
          throw new NotAllowedError(
            row.ownerId === null
              ? 'You can take a lead nobody has. Only managers and admins can give one to someone else.'
              : 'Only managers and admins can give a lead to someone else.'
          )
        }
        if (row.status === 'converted') {
          throw new InvalidChangeError(
            'This lead was converted. Its account has an owner now.'
          )
        }
        if (ownerId) await assertCanOwn(tx, ownerId)
        return { ownerId }
      })
    },

    qualify: (me: TActor, id: string, version: number): Promise<TLead> =>
      change(me, id, version, (row) => {
        assertMayWork(me, row)
        if (row.status === 'qualified') return {}
        if (row.status !== 'new') {
          throw new InvalidChangeError(
            row.status === 'converted'
              ? 'This lead was already converted.'
              : 'Reopen this lead to qualify it.'
          )
        }
        return { status: 'qualified' }
      }),

    disqualify: async (
      me: TActor,
      id: string,
      input: TLeadDisqualify
    ): Promise<TLead> => {
      const { version, reason } = leadDisqualifySchema.parse(input)
      return change(me, id, version, (row) => {
        assertMayWork(me, row)
        if (row.status === 'converted') {
          throw new InvalidChangeError('This lead was already converted.')
        }
        return { status: 'disqualified', disqualifiedReason: reason }
      })
    },

    /** Brings a disqualified lead back to the inbox. */
    reopen: (me: TActor, id: string, version: number): Promise<TLead> =>
      change(me, id, version, (row) => {
        assertMayWork(me, row)
        if (isOpenLead(row.status)) return {}
        if (row.status === 'converted') {
          throw new InvalidChangeError('This lead was already converted.')
        }
        return { status: 'new', disqualifiedReason: null }
      }),

    /** What converting would do, to show before the person confirms. */
    match: async (
      me: TActor,
      id: string,
      companyName?: string
    ): Promise<TLeadMatch> => {
      const [row] = await db.select().from(lead).where(eq(lead.id, id))
      if (!row) throw NOT_FOUND()
      const found = await findLeadMatch(db, row, companyName)
      return {
        ...found,
        canAddDeal: canAddDealOnConvert(
          me.role,
          me.id,
          found.company?.owner.id ?? null
        )
      }
    },

    /**
     * Turns a lead into an account, a person and (if asked) a deal, all or
     * nothing. An account that's already there keeps its owner and just
     * gains the person; otherwise the new account belongs to whoever
     * converts.
     */
    convert: async (
      me: TActor,
      id: string,
      input: TLeadConvert
    ): Promise<TLeadConverted> => {
      const data = leadConvertSchema.parse(input)

      const made = await db
        .transaction(async (tx) => {
          const row = await lockLead(tx, id)
          assertMayWork(me, row)
          if (!isOpenLead(row.status)) {
            throw new InvalidChangeError(
              row.status === 'converted'
                ? 'This lead was already converted.'
                : 'Reopen this lead to convert it.'
            )
          }
          if (row.version !== data.version) throw new ChangedSinceError()

          const match = await findLeadMatch(tx, row, data.companyName)
          if ((match.company?.id ?? null) !== data.companyId) {
            throw new MatchChangedError()
          }
          const existingOwnerId = match.company?.owner.id ?? null
          // The exception to "members change only companies they own": the
          // account's owner doesn't decide whether a lead may join it.
          if (
            !canConvertLeadInto(me.role, me.id, row.ownerId, existingOwnerId)
          ) {
            throw new NotAllowedError(NOT_YOURS)
          }
          if (
            data.deal &&
            !canAddDealOnConvert(me.role, me.id, existingOwnerId)
          ) {
            throw new NotAllowedError(
              `Only ${match.company?.owner.name ?? 'its owner'}, a manager or an admin can add deals to ${match.company?.name ?? 'that account'}.`
            )
          }

          const records = recordServicesIn(tx)

          const ofCompany = match.company
            ? { ...match.company, isNew: false }
            : await (async () => {
                const name = data.companyName || row.companyName
                if (!name) {
                  throw new InvalidChangeError(
                    'Say which company they work at.'
                  )
                }
                const created = await records.companies.create(me, {
                  name,
                  domain: usableDomain(row.email)
                })
                await tx
                  .update(company)
                  .set({ source: 'lead' })
                  .where(eq(company.id, created.id))
                return {
                  id: created.id,
                  name: created.name,
                  owner: created.owner,
                  isNew: true
                }
              })()

          const asPerson = match.person
            ? { ...match.person, isNew: false }
            : await (async () => {
                const mayAdd = canEditCompany(
                  me.role,
                  me.id,
                  ofCompany.owner.id
                )
                const created = await records.people.create(
                  mayAdd ? me : asLeadConverter(me),
                  {
                    companyId: ofCompany.id,
                    name: row.name,
                    title: row.title,
                    email: row.email,
                    phone: row.phone
                  }
                )
                await tx
                  .update(person)
                  .set({ source: 'lead' })
                  .where(eq(person.id, created.id))
                return { id: created.id, name: created.name, isNew: true }
              })()

          const asDeal = data.deal
            ? await (async (wanted) => {
                // The deal starts with the account's owner, like any deal.
                const created = await records.deals.create(me, {
                  companyId: ofCompany.id,
                  name: wanted.name,
                  valueMinor: wanted.valueMinor
                })
                await tx
                  .update(deal)
                  .set({ source: 'lead' })
                  .where(eq(deal.id, created.id))
                // The lead is the deal's first contact.
                await tx
                  .insert(dealPerson)
                  .values({ dealId: created.id, personId: asPerson.id })
                  .onConflictDoNothing()
                return { id: created.id, name: created.name }
              })(data.deal)
            : null

          const patch = {
            status: 'converted' as const,
            // Nobody had it: it's the converter's now.
            ownerId: row.ownerId ?? me.id,
            convertedCompanyId: ofCompany.id,
            convertedPersonId: asPerson.id,
            convertedDealId: asDeal?.id ?? null
          }
          await tx
            .update(lead)
            .set({ ...patch, version: sql`${lead.version} + 1` })
            .where(eq(lead.id, id))
          await logChanges(tx, me, [
            {
              recordType: 'lead',
              recordId: id,
              action: 'update',
              changes: diffFields(row, patch)
            }
          ])

          return {
            company: {
              id: ofCompany.id,
              name: ofCompany.name,
              owner: ofCompany.owner,
              isNew: ofCompany.isNew
            },
            person: asPerson,
            deal: asDeal
          }
        })
        .catch((error: unknown) => {
          throw explainInvalid(error)
        })

      return { lead: await getOne(me, id), ...made }
    }
  }
}

export type TLeadsService = ReturnType<typeof createLeadsService>
