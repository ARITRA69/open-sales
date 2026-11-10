import type {
  TContract,
  TContractCandidate,
  TContractCandidateQuery,
  TContractCreate,
  TContractEnd,
  TContractListQuery,
  TPage,
  TRenewalStart
} from '@open-sales/shared'
import {
  addDaysToDay,
  addMonthsToDay,
  canEditContract,
  contractCreateSchema,
  contractEndSchema,
  renewalStartSchema,
  termMonths
} from '@open-sales/shared'
import type { SQL } from 'drizzle-orm'
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import type { TDatabase } from '../db/client'
import {
  changeLog,
  company,
  contract,
  deal,
  lostReason,
  stage,
  user,
  workspace
} from '../db/schema'
import type { TActor, TQueries } from '../records/common'
import {
  ChangedSinceError,
  decodeCursor,
  diffFields,
  DuplicateError,
  InvalidChangeError,
  isRecordId,
  logChanges,
  NotAllowedError,
  RecordNotFoundError,
  toPage
} from '../records/common'
import { createDealService } from '../records/deals'

type TContractRow = typeof contract.$inferSelect

const NOT_FOUND = () => new RecordNotFoundError('contract')

const NOT_ALLOWED =
  'Only the company’s owner, a manager or an admin can change its contracts.'

// A deal's name can be 200 characters; this leaves room for " renewal 2026".
const MAX_COMPANY_IN_NAME = 180

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

// The won deal a contract started from, and the newest deal renewing it.
const sourceDeal = alias(deal, 'source_deal')
const renewalDeal = alias(deal, 'renewal_deal')

/** A contract's newest renewal deal: ids sort by creation time. */
const LATEST_RENEWAL_ID = sql`(select d.id from deal d where d.contract_id = "contract"."id" order by d.id desc limit 1)`

type TJoined = {
  row: TContractRow
  companyName: string
  companyOwnerId: string
  ownerName: string
  dealName: string | null
  renewalDealId: string | null
  renewalDealName: string | null
  renewalDealStatus: 'open' | 'won' | 'lost' | null
}

const toContract = (found: TJoined, me: TActor): TContract => {
  const { row } = found
  return {
    id: row.id,
    version: row.version,
    company: { id: row.companyId, name: found.companyName },
    owner: { id: found.companyOwnerId, name: found.ownerName },
    deal:
      row.dealId && found.dealName !== null
        ? { id: row.dealId, name: found.dealName }
        : null,
    renewalDeal:
      found.renewalDealId && found.renewalDealStatus
        ? {
            id: found.renewalDealId,
            name: found.renewalDealName ?? '',
            status: found.renewalDealStatus
          }
        : null,
    valueMinor: row.valueMinor,
    currency: row.currency,
    startsOn: row.startsOn,
    renewsOn: row.renewsOn,
    status: row.status,
    endReason: row.endReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    canEdit: canEditContract(me.role, me.id, found.companyOwnerId)
  }
}

/** Contracts with their company, its owner and both deals, for every read. */
const selectContracts = (db: TQueries) =>
  db
    .select({
      row: contract,
      companyName: company.name,
      companyOwnerId: company.ownerId,
      ownerName: user.name,
      dealName: sourceDeal.name,
      renewalDealId: renewalDeal.id,
      renewalDealName: renewalDeal.name,
      renewalDealStatus: renewalDeal.status
    })
    .from(contract)
    .innerJoin(company, eq(company.id, contract.companyId))
    .innerJoin(user, eq(user.id, company.ownerId))
    .leftJoin(sourceDeal, eq(sourceDeal.id, contract.dealId))
    .leftJoin(renewalDeal, eq(renewalDeal.id, LATEST_RENEWAL_ID))

/** Today's date where the team is: en-CA writes dates as 2026-11-30. */
const readToday = async (tx: TQueries) => {
  const [found] = await tx
    .select({ timeZone: workspace.timeZone })
    .from(workspace)
    .limit(1)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: found?.timeZone ?? 'UTC'
  }).format(new Date())
}

const lockContract = async (tx: TQueries, id: string) => {
  const [found] = isRecordId(id)
    ? await tx
        .select({
          row: contract,
          companyName: company.name,
          companyOwnerId: company.ownerId,
          companyArchivedAt: company.archivedAt
        })
        .from(contract)
        .innerJoin(company, eq(company.id, contract.companyId))
        .where(eq(contract.id, id))
        .for('update', { of: contract })
    : []
  if (!found) throw NOT_FOUND()
  return found
}

const assertMayEdit = (me: TActor, found: { companyOwnerId: string }) => {
  if (!canEditContract(me.role, me.id, found.companyOwnerId)) {
    throw new NotAllowedError(NOT_ALLOWED)
  }
}

/** Saves a contract's new state, bumps its version and logs what changed. */
const moveContract = async (
  tx: TQueries,
  actor: TActor | null,
  row: TContractRow,
  next: Pick<TContractRow, 'status' | 'endReason'>
) => {
  await tx
    .update(contract)
    .set({ ...next, version: sql`${contract.version} + 1` })
    .where(eq(contract.id, row.id))
  const entry = {
    recordType: 'contract' as const,
    recordId: row.id,
    action: 'update' as const,
    changes: diffFields(row, next)
  }
  if (actor) {
    await logChanges(tx, actor, [entry])
  } else {
    // Nobody asked for this one: it follows a deal someone closed.
    await tx
      .insert(changeLog)
      .values({ ...entry, actorId: null, via: 'system' })
  }
}

/**
 * Brings contracts in line with their renewal deals: a won renewal makes
 * the contract `renewed`, a lost one ends it with the deal's reason, and an
 * archived one puts it back to `active` so it can be started again.
 *
 * The contract list runs this before it reads, so it holds without the deal
 * service knowing about contracts. Called with a deal's id inside that
 * deal's own transaction, it settles just that one straight away.
 */
export const settleRenewals = async (tx: TQueries, dealId?: string) => {
  const waiting = await tx
    .select({
      row: contract,
      dealStatus: renewalDeal.status,
      dealArchivedAt: renewalDeal.archivedAt,
      lostLabel: lostReason.label,
      lostNote: renewalDeal.lostNote
    })
    .from(contract)
    .innerJoin(company, eq(company.id, contract.companyId))
    .innerJoin(renewalDeal, eq(renewalDeal.id, LATEST_RENEWAL_ID))
    .leftJoin(lostReason, eq(lostReason.id, renewalDeal.lostReasonId))
    .where(
      and(
        eq(contract.status, 'renewing'),
        // An archived company's deals are archived with it, and come back.
        isNull(company.archivedAt),
        or(ne(renewalDeal.status, 'open'), isNotNull(renewalDeal.archivedAt)),
        dealId ? eq(renewalDeal.id, dealId) : undefined
      )
    )
    .for('update', { of: contract })

  for (const found of waiting) {
    const next = found.dealArchivedAt
      ? { status: 'active' as const, endReason: null }
      : found.dealStatus === 'won'
        ? { status: 'renewed' as const, endReason: null }
        : {
            status: 'ended' as const,
            endReason:
              [found.lostLabel, found.lostNote].filter(Boolean).join(': ') ||
              'The renewal was lost'
          }
    await moveContract(tx, null, found.row, next)
  }
}

export const createContractService = (db: TDatabase) => {
  const getOne = async (me: TActor, id: string): Promise<TContract> => {
    const [found] = isRecordId(id)
      ? await selectContracts(db).where(eq(contract.id, id))
      : []
    if (!found) throw NOT_FOUND()
    return toContract(found, me)
  }

  return {
    get: async (me: TActor, id: string) => {
      await db.transaction((tx) => settleRenewals(tx))
      return getOne(me, id)
    },

    /**
     * `upcoming`: active and renewing contracts due within the window,
     * overdue ones too, soonest first. `closed`: renewed and ended ones,
     * newest renewal date first. Paged by renewal date, then id.
     */
    list: async (
      me: TActor,
      query: TContractListQuery
    ): Promise<TPage<TContract>> => {
      await db.transaction((tx) => settleRenewals(tx))
      const isUpcoming = query.view === 'upcoming'
      const today = await readToday(db)
      const cursor = decodeCursor(query.cursor)
      const after =
        cursor?.key && ISO_DAY.test(cursor.key) && isRecordId(cursor.id)
          ? { key: cursor.key, id: cursor.id }
          : null
      const conditions: (SQL | undefined)[] = [
        isNull(company.archivedAt),
        inArray(
          contract.status,
          isUpcoming ? ['active', 'renewing'] : ['renewed', 'ended']
        ),
        isUpcoming
          ? lte(contract.renewsOn, addDaysToDay(today, query.window))
          : undefined,
        query.owner === 'me' ? eq(company.ownerId, me.id) : undefined,
        after
          ? isUpcoming
            ? sql`(${contract.renewsOn}, ${contract.id}) > (${after.key}, ${after.id})`
            : sql`(${contract.renewsOn}, ${contract.id}) < (${after.key}, ${after.id})`
          : undefined
      ]
      const rows = await selectContracts(db)
        .where(and(...conditions))
        .orderBy(
          ...(isUpcoming
            ? [asc(contract.renewsOn), asc(contract.id)]
            : [desc(contract.renewsOn), desc(contract.id)])
        )
        .limit(query.limit + 1)
      return toPage(
        rows,
        query.limit,
        (found) => toContract(found, me),
        ({ row }) => [row.renewsOn, row.id]
      )
    },

    /**
     * Won deals nobody has added a contract for, newest first, with dates
     * to start from. A won renewal carries on from the contract it renewed.
     */
    candidates: async (
      me: TActor,
      query: TContractCandidateQuery
    ): Promise<TPage<TContractCandidate>> => {
      const today = await readToday(db)
      const cursor = decodeCursor(query.cursor)
      const renewed = alias(contract, 'renewed_contract')
      const rows = await db
        .select({
          row: deal,
          companyName: company.name,
          companyOwnerId: company.ownerId,
          ownerName: user.name,
          renewedStartsOn: renewed.startsOn,
          renewedRenewsOn: renewed.renewsOn
        })
        .from(deal)
        .innerJoin(company, eq(company.id, deal.companyId))
        .innerJoin(user, eq(user.id, company.ownerId))
        .leftJoin(renewed, eq(renewed.id, deal.contractId))
        .where(
          and(
            eq(deal.status, 'won'),
            isNull(deal.archivedAt),
            isNull(company.archivedAt),
            sql`not exists (select 1 from ${contract} where ${contract.dealId} = ${deal.id})`,
            query.owner === 'me' ? eq(company.ownerId, me.id) : undefined,
            cursor && isRecordId(cursor.id) ? lt(deal.id, cursor.id) : undefined
          )
        )
        .orderBy(desc(deal.id))
        .limit(query.limit + 1)
      return toPage(
        rows,
        query.limit,
        (found) => {
          const { row } = found
          const startsOn = found.renewedRenewsOn ?? row.closeDate ?? today
          const months =
            found.renewedStartsOn && found.renewedRenewsOn
              ? (termMonths(found.renewedStartsOn, found.renewedRenewsOn) ?? 12)
              : 12
          return {
            deal: { id: row.id, name: row.name },
            company: { id: row.companyId, name: found.companyName },
            owner: { id: found.companyOwnerId, name: found.ownerName },
            valueMinor: row.valueMinor,
            currency: row.currency,
            closeDate: row.closeDate,
            suggestedStartsOn: startsOn,
            suggestedRenewsOn: addMonthsToDay(startsOn, months),
            canEdit: canEditContract(me.role, me.id, found.companyOwnerId)
          }
        },
        ({ row }) => [null, row.id]
      )
    },

    /** From a won deal, by someone who may change its company. One each. */
    create: async (me: TActor, input: TContractCreate): Promise<TContract> => {
      const data = contractCreateSchema.parse(input)
      const id = await db.transaction(async (tx) => {
        // Locking the deal makes two people adding its contract take turns.
        const [found] = isRecordId(data.dealId)
          ? await tx
              .select({
                row: deal,
                companyOwnerId: company.ownerId,
                companyArchivedAt: company.archivedAt
              })
              .from(deal)
              .innerJoin(company, eq(company.id, deal.companyId))
              .where(eq(deal.id, data.dealId))
              .for('update', { of: deal })
          : []
        if (!found || found.row.archivedAt || found.companyArchivedAt) {
          throw new InvalidChangeError('Choose a deal that’s still in use.')
        }
        assertMayEdit(me, found)
        if (found.row.status !== 'won') {
          throw new InvalidChangeError('Only a won deal can start a contract.')
        }
        const [existing] = await tx
          .select({ id: contract.id })
          .from(contract)
          .where(eq(contract.dealId, found.row.id))
        if (existing) {
          throw new DuplicateError(
            'contract_exists',
            'This deal already has a contract.'
          )
        }

        const values = {
          companyId: found.row.companyId,
          dealId: found.row.id,
          valueMinor: data.valueMinor,
          currency: data.currency ?? found.row.currency,
          startsOn: data.startsOn,
          renewsOn: data.renewsOn
        }
        const [created] = await tx.insert(contract).values(values).returning()
        await logChanges(tx, me, [
          {
            recordType: 'contract',
            recordId: created.id,
            action: 'create',
            changes: diffFields({}, values)
          }
        ])
        return created.id
      })
      return getOne(me, id)
    },

    /**
     * Makes the renewal deal and marks the contract as renewing. The deal
     * is the company's, named after it, and starts from the contract: its
     * value, its currency, and its renewal date as the close date.
     */
    startRenewal: async (
      me: TActor,
      id: string,
      input: TRenewalStart
    ): Promise<TContract> => {
      const { version, ...data } = renewalStartSchema.parse(input)
      await db.transaction(async (tx) => {
        const found = await lockContract(tx, id)
        assertMayEdit(me, found)
        const { row } = found
        if (found.companyArchivedAt) {
          throw new InvalidChangeError('Restore its company first.')
        }
        if (row.version !== version) throw new ChangedSinceError()
        if (row.status !== 'active') {
          throw new InvalidChangeError(
            row.status === 'renewing'
              ? 'This renewal has already been started.'
              : 'This contract has finished. Reopen it to renew it.'
          )
        }
        if (data.stageId !== undefined) {
          const [target] = isRecordId(data.stageId)
            ? await tx
                .select({ kind: stage.kind })
                .from(stage)
                .where(
                  and(eq(stage.id, data.stageId), isNull(stage.archivedAt))
                )
            : []
          if (target?.kind !== 'open') {
            throw new InvalidChangeError('Start the renewal in an open stage.')
          }
        }

        // The deal service makes the deal, with its own checks, stage
        // history and log entry. Run on this transaction, it's undone with
        // everything else if a later step fails.
        const deals = createDealService(tx as unknown as TDatabase)
        const created = await deals.create(me, {
          companyId: row.companyId,
          name: `${found.companyName.slice(0, MAX_COMPANY_IN_NAME)} renewal ${row.renewsOn.slice(0, 4)}`,
          stageId: data.stageId,
          valueMinor:
            data.valueMinor === undefined ? row.valueMinor : data.valueMinor,
          currency: row.currency,
          closeDate:
            data.closeDate === undefined ? row.renewsOn : data.closeDate
        })
        // It can't yet be told a deal's kind or contract, so set them here.
        await tx
          .update(deal)
          .set({ kind: 'renewal', contractId: row.id })
          .where(eq(deal.id, created.id))
        await logChanges(tx, me, [
          {
            recordType: 'deal',
            recordId: created.id,
            action: 'update',
            changes: [
              { field: 'kind', from: 'new', to: 'renewal' },
              { field: 'contractId', from: null, to: row.id }
            ]
          }
        ])
        await moveContract(tx, me, row, { status: 'renewing', endReason: null })
      })
      return getOne(me, id)
    },

    /** "Won't renew": records why and ends the contract. */
    end: async (
      me: TActor,
      id: string,
      input: TContractEnd
    ): Promise<TContract> => {
      const { version, reason } = contractEndSchema.parse(input)
      await db.transaction(async (tx) => {
        const found = await lockContract(tx, id)
        assertMayEdit(me, found)
        const { row } = found
        if (row.version !== version) throw new ChangedSinceError()
        if (row.status !== 'active') {
          throw new InvalidChangeError(
            row.status === 'renewing'
              ? 'Its renewal is under way. Mark that deal as lost instead.'
              : 'This contract has already finished.'
          )
        }
        await moveContract(tx, me, row, { status: 'ended', endReason: reason })
      })
      return getOne(me, id)
    },

    /** Changing your mind: an ended contract is active again. */
    reopen: async (
      me: TActor,
      id: string,
      version: number
    ): Promise<TContract> => {
      await db.transaction(async (tx) => {
        const found = await lockContract(tx, id)
        assertMayEdit(me, found)
        const { row } = found
        if (row.version !== version) throw new ChangedSinceError()
        if (row.status !== 'ended') {
          throw new InvalidChangeError(
            'Only an ended contract can be reopened.'
          )
        }
        await moveContract(tx, me, row, { status: 'active', endReason: null })
      })
      return getOne(me, id)
    }
  }
}

export type TContractService = ReturnType<typeof createContractService>
