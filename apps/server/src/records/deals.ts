import type {
  TBoard,
  TDeal,
  TDealCreate,
  TDealListQuery,
  TDealUpdate,
  TPage,
  TPipeline
} from '@open-sales/shared'
import {
  canEditCompany,
  canEditDeal,
  canReassign,
  dealCreateSchema,
  dealUpdateSchema
} from '@open-sales/shared'
import type { SQL } from 'drizzle-orm'
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  lt,
  sql
} from 'drizzle-orm'

import type { TDatabase } from '../db/client'
import {
  company,
  deal,
  dealStageChange,
  lostReason,
  pipeline,
  stage,
  user,
  workspace
} from '../db/schema'
import type { TActor, TQueries } from './common'
import {
  assertCanOwn,
  ChangedSinceError,
  containing,
  decodeCursor,
  diffFields,
  InvalidChangeError,
  isoOrNull,
  isRecordId,
  logChanges,
  NotAllowedError,
  RecordNotFoundError,
  toPage
} from './common'

// The board shows this many open deals at most; a small team has far fewer.
const BOARD_LIMIT = 2000

type TDealRow = typeof deal.$inferSelect
type TStageRow = typeof stage.$inferSelect
type TJoined = {
  row: TDealRow
  companyName: string
  companyOwnerId: string
  ownerName: string
}

const toDeal = (
  { row, companyName, companyOwnerId, ownerName }: TJoined,
  me: TActor
): TDeal => ({
  id: row.id,
  name: row.name,
  company: { id: row.companyId, name: companyName },
  owner: { id: row.ownerId, name: ownerName },
  pipelineId: row.pipelineId,
  stageId: row.stageId,
  status: row.status,
  valueMinor: row.valueMinor,
  currency: row.currency,
  closeDate: row.closeDate,
  nextStep: row.nextStep,
  stageEnteredAt: row.stageEnteredAt.toISOString(),
  closedAt: isoOrNull(row.closedAt),
  lostReasonId: row.lostReasonId,
  lostNote: row.lostNote,
  customFields: row.customFields,
  source: row.source,
  lastActivityAt: isoOrNull(row.lastActivityAt),
  version: row.version,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  archivedAt: isoOrNull(row.archivedAt),
  canEdit: canEditDeal(me.role, me.id, {
    ownerId: row.ownerId,
    companyOwnerId
  })
})

const NOT_FOUND = () => new RecordNotFoundError('deal')

const NOT_ALLOWED =
  'Only the deal’s owner, the company’s owner, a manager or an admin can change this deal.'

/** Deals with their company and owner, for every read. */
const selectDeals = (db: TQueries) =>
  db
    .select({
      row: deal,
      companyName: company.name,
      companyOwnerId: company.ownerId,
      ownerName: user.name
    })
    .from(deal)
    .innerJoin(company, eq(company.id, deal.companyId))
    .innerJoin(user, eq(user.id, deal.ownerId))

/** The workspace's currency and today's date where the team is. */
const readWorkspace = async (tx: TQueries) => {
  const [found] = await tx
    .select({ currency: workspace.currency, timeZone: workspace.timeZone })
    .from(workspace)
    .limit(1)
  const settings = found ?? { currency: 'USD', timeZone: 'UTC' }
  // en-CA writes dates as 2026-11-30.
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: settings.timeZone
  }).format(new Date())
  return { ...settings, today }
}

const findStage = async (tx: TQueries, stageId: string | undefined) => {
  if (stageId === undefined) {
    // The first open stage of the default pipeline.
    const [first] = await tx
      .select({ row: stage })
      .from(stage)
      .innerJoin(pipeline, eq(pipeline.id, stage.pipelineId))
      .where(
        and(
          eq(pipeline.isDefault, true),
          eq(stage.kind, 'open'),
          isNull(stage.archivedAt)
        )
      )
      .orderBy(asc(stage.position))
      .limit(1)
    if (!first) throw new InvalidChangeError('Add a pipeline stage first.')
    return first.row
  }
  const [found] = isRecordId(stageId)
    ? await tx
        .select()
        .from(stage)
        .where(and(eq(stage.id, stageId), isNull(stage.archivedAt)))
    : []
  if (!found) throw new InvalidChangeError('Choose a stage that’s in use.')
  return found
}

const assertLostReason = async (tx: TQueries, id: string) => {
  const [found] = isRecordId(id)
    ? await tx
        .select({ id: lostReason.id })
        .from(lostReason)
        .where(and(eq(lostReason.id, id), isNull(lostReason.archivedAt)))
    : []
  if (!found) throw new InvalidChangeError('Choose one of the lost reasons.')
}

type TStageInput = {
  closeDate?: string | null
  lostReasonId?: string | null
  lostNote?: string | null
}

/**
 * What entering a stage changes: the copied status, when it entered, when
 * it closed. Closing sets the close date to today unless one was sent, and
 * a Lost stage needs a reason.
 */
const enterStage = async (
  tx: TQueries,
  target: TStageRow,
  input: TStageInput,
  before: TDealRow | null,
  today: string
) => {
  const isClosing = target.kind !== 'open'
  const wasClosed = before ? before.status !== 'open' : false
  const lostReasonId =
    target.kind === 'lost'
      ? (input.lostReasonId ?? before?.lostReasonId ?? null)
      : null
  if (target.kind === 'lost') {
    if (!lostReasonId) {
      throw new InvalidChangeError('Choose why the deal was lost.')
    }
    await assertLostReason(tx, lostReasonId)
  }
  return {
    pipelineId: target.pipelineId,
    stageId: target.id,
    status: target.kind,
    stageEnteredAt: new Date(),
    closedAt: isClosing ? (wasClosed ? before?.closedAt : new Date()) : null,
    closeDate:
      input.closeDate !== undefined
        ? input.closeDate
        : isClosing && !wasClosed
          ? today
          : (before?.closeDate ?? null),
    lostReasonId,
    lostNote:
      target.kind === 'lost'
        ? input.lostNote !== undefined
          ? input.lostNote
          : (before?.lostNote ?? null)
        : null
  }
}

const lockDeal = async (tx: TQueries, id: string) => {
  const [found] = await tx
    .select({ row: deal, companyOwnerId: company.ownerId })
    .from(deal)
    .innerJoin(company, eq(company.id, deal.companyId))
    .where(eq(deal.id, id))
    .for('update', { of: deal })
  if (!found) throw NOT_FOUND()
  return found
}

const assertMayEdit = (
  me: TActor,
  found: { row: TDealRow; companyOwnerId: string }
) => {
  if (
    !canEditDeal(me.role, me.id, {
      ownerId: found.row.ownerId,
      companyOwnerId: found.companyOwnerId
    })
  ) {
    throw new NotAllowedError(NOT_ALLOWED)
  }
}

export const createDealService = (db: TDatabase) => {
  const getOne = async (me: TActor, id: string): Promise<TDeal> => {
    const [found] = await selectDeals(db).where(eq(deal.id, id))
    if (!found) throw NOT_FOUND()
    return toDeal(found, me)
  }

  return {
    get: getOne,

    /** Newest first, paged by id (ids sort by creation time). */
    list: async (me: TActor, query: TDealListQuery): Promise<TPage<TDeal>> => {
      const after = decodeCursor(query.cursor)
      const conditions: (SQL | undefined)[] = [
        query.archived ? isNotNull(deal.archivedAt) : isNull(deal.archivedAt),
        query.owner === 'me' ? eq(deal.ownerId, me.id) : undefined,
        query.companyId && isRecordId(query.companyId)
          ? eq(deal.companyId, query.companyId)
          : undefined,
        query.status ? eq(deal.status, query.status) : undefined,
        query.q ? ilike(deal.name, containing(query.q)) : undefined,
        after && isRecordId(after.id) ? lt(deal.id, after.id) : undefined
      ]
      if (query.companyId && !isRecordId(query.companyId)) {
        return { items: [], nextCursor: null }
      }
      const rows = await selectDeals(db)
        .where(and(...conditions))
        .orderBy(desc(deal.id))
        .limit(query.limit + 1)
      return toPage(
        rows,
        query.limit,
        (found) => toDeal(found, me),
        ({ row }) => [null, row.id]
      )
    },

    /**
     * On a company the person may change. The owner defaults to the
     * company's; the stage to the default pipeline's first.
     */
    create: async (me: TActor, input: TDealCreate): Promise<TDeal> => {
      const data = dealCreateSchema.parse(input)
      const id = await db.transaction(async (tx) => {
        const [ofCompany] = isRecordId(data.companyId)
          ? await tx
              .select()
              .from(company)
              .where(
                and(eq(company.id, data.companyId), isNull(company.archivedAt))
              )
          : []
        if (!ofCompany) {
          throw new InvalidChangeError('Choose a company that’s still in use.')
        }
        if (!canEditCompany(me.role, me.id, ofCompany.ownerId)) {
          throw new NotAllowedError(
            'Only the company’s owner, a manager or an admin can add deals to it.'
          )
        }
        const ownerId = data.ownerId ?? ofCompany.ownerId
        if (ownerId !== ofCompany.ownerId && !canReassign(me.role)) {
          throw new NotAllowedError(
            'Only managers and admins can give a deal to someone else.'
          )
        }
        await assertCanOwn(tx, ownerId)

        const settings = await readWorkspace(tx)
        const target = await findStage(tx, data.stageId)
        const staged = await enterStage(tx, target, data, null, settings.today)
        const values = {
          name: data.name,
          companyId: ofCompany.id,
          ownerId,
          valueMinor: data.valueMinor ?? null,
          currency: data.currency ?? settings.currency,
          nextStep: data.nextStep ?? null,
          ...staged
        }
        const [created] = await tx.insert(deal).values(values).returning()
        await tx.insert(dealStageChange).values({
          dealId: created.id,
          toStageId: target.id,
          changedById: me.id
        })
        const {
          stageEnteredAt: _entered,
          closedAt: _closed,
          ...logged
        } = values
        await logChanges(tx, me, [
          {
            recordType: 'deal',
            recordId: created.id,
            action: 'create',
            changes: diffFields({}, logged)
          }
        ])
        return created.id
      })
      return getOne(me, id)
    },

    /** Changes what's sent. Changing `stageId` moves the deal. */
    update: async (
      me: TActor,
      id: string,
      input: TDealUpdate
    ): Promise<TDeal> => {
      const { version, ...data } = dealUpdateSchema.parse(input)
      await db.transaction(async (tx) => {
        const found = await lockDeal(tx, id)
        assertMayEdit(me, found)
        const { row } = found
        if (row.archivedAt) {
          throw new InvalidChangeError('Restore this deal to change it.')
        }
        if (row.version !== version) throw new ChangedSinceError()

        if (data.ownerId !== undefined && data.ownerId !== row.ownerId) {
          if (!canReassign(me.role)) {
            throw new NotAllowedError(
              'Only managers and admins can give a deal to someone else.'
            )
          }
          await assertCanOwn(tx, data.ownerId)
        }

        const isMoving =
          data.stageId !== undefined && data.stageId !== row.stageId
        const settings = await readWorkspace(tx)
        let patch: Partial<TDealRow> = {
          name: data.name,
          valueMinor: data.valueMinor,
          currency: data.currency,
          closeDate: data.closeDate,
          nextStep: data.nextStep,
          ownerId: data.ownerId
        }
        if (isMoving) {
          const target = await findStage(tx, data.stageId)
          patch = {
            ...patch,
            ...(await enterStage(tx, target, data, row, settings.today))
          }
        } else if (row.status === 'lost') {
          // Changing the reason on a lost deal.
          if (data.lostReasonId) await assertLostReason(tx, data.lostReasonId)
          if (data.lostReasonId === null) {
            throw new InvalidChangeError('A lost deal needs a reason.')
          }
          patch = {
            ...patch,
            lostReasonId: data.lostReasonId,
            lostNote: data.lostNote
          }
        }

        const {
          stageEnteredAt: _entered,
          closedAt: _closed,
          ...compared
        } = patch
        const changes = diffFields(row, compared)
        if (changes.length === 0) return

        await tx
          .update(deal)
          .set({ ...patch, version: sql`${deal.version} + 1` })
          .where(eq(deal.id, id))
        if (isMoving && patch.stageId) {
          await tx.insert(dealStageChange).values({
            dealId: id,
            fromStageId: row.stageId,
            toStageId: patch.stageId,
            changedById: me.id
          })
        }
        await logChanges(tx, me, [
          { recordType: 'deal', recordId: id, action: 'update', changes }
        ])
      })
      return getOne(me, id)
    },

    archive: async (
      me: TActor,
      id: string,
      version: number
    ): Promise<TDeal> => {
      await db.transaction(async (tx) => {
        const found = await lockDeal(tx, id)
        assertMayEdit(me, found)
        if (found.row.archivedAt) return
        if (found.row.version !== version) throw new ChangedSinceError()
        await tx
          .update(deal)
          .set({ archivedAt: new Date(), version: sql`${deal.version} + 1` })
          .where(eq(deal.id, id))
        await logChanges(tx, me, [
          { recordType: 'deal', recordId: id, action: 'archive' }
        ])
      })
      return getOne(me, id)
    },

    restore: async (
      me: TActor,
      id: string,
      version: number
    ): Promise<TDeal> => {
      await db.transaction(async (tx) => {
        const found = await lockDeal(tx, id)
        assertMayEdit(me, found)
        if (!found.row.archivedAt) return
        if (found.row.version !== version) throw new ChangedSinceError()
        const [ofCompany] = await tx
          .select({ archivedAt: company.archivedAt })
          .from(company)
          .where(eq(company.id, found.row.companyId))
        if (ofCompany?.archivedAt) {
          throw new InvalidChangeError('Restore its company first.')
        }
        await tx
          .update(deal)
          .set({ archivedAt: null, version: sql`${deal.version} + 1` })
          .where(eq(deal.id, id))
        await logChanges(tx, me, [
          { recordType: 'deal', recordId: id, action: 'restore' }
        ])
      })
      return getOne(me, id)
    }
  }
}

export type TDealService = ReturnType<typeof createDealService>

/** The default pipeline: its stages, lost reasons and the board. */
export const createPipelineService = (db: TDatabase) => {
  const getDefault = async () => {
    const [found] = await db
      .select()
      .from(pipeline)
      .where(eq(pipeline.isDefault, true))
    if (!found) throw new RecordNotFoundError('pipeline')
    return found
  }

  return {
    get: async (): Promise<TPipeline> => {
      const found = await getDefault()
      const [stages, reasons, settings] = await Promise.all([
        db
          .select()
          .from(stage)
          .where(and(eq(stage.pipelineId, found.id), isNull(stage.archivedAt)))
          .orderBy(asc(stage.position)),
        db
          .select({ id: lostReason.id, label: lostReason.label })
          .from(lostReason)
          .where(isNull(lostReason.archivedAt))
          .orderBy(asc(lostReason.position)),
        readWorkspace(db)
      ])
      return {
        id: found.id,
        name: found.name,
        currency: settings.currency,
        stages: stages.map((row) => ({
          id: row.id,
          name: row.name,
          position: row.position,
          kind: row.kind,
          winProbability: row.winProbability,
          stalledAfterDays: row.stalledAfterDays,
          goal: row.goal,
          exitCriteria: row.exitCriteria
        })),
        lostReasons: reasons
      }
    },

    /**
     * Open deals by stage, most recently active first. Each column's value
     * adds up deals in the workspace's currency only.
     */
    board: async (me: TActor): Promise<TBoard> => {
      const found = await getDefault()
      const settings = await readWorkspace(db)
      const isOpenHere = and(
        eq(deal.pipelineId, found.id),
        eq(deal.status, 'open'),
        isNull(deal.archivedAt)
      )
      const [stages, totals, rows] = await Promise.all([
        db
          .select({ id: stage.id })
          .from(stage)
          .where(
            and(
              eq(stage.pipelineId, found.id),
              eq(stage.kind, 'open'),
              isNull(stage.archivedAt)
            )
          )
          .orderBy(asc(stage.position)),
        db
          .select({
            stageId: deal.stageId,
            count: count(),
            valueMinor: sql<string>`coalesce(sum(${deal.valueMinor}) filter (where ${deal.currency} = ${settings.currency}), 0)`
          })
          .from(deal)
          .where(isOpenHere)
          .groupBy(deal.stageId),
        selectDeals(db)
          .where(isOpenHere)
          .orderBy(sql`${deal.lastActivityAt} desc nulls last`, asc(deal.id))
          .limit(BOARD_LIMIT)
      ])
      return {
        columns: stages.map(({ id }) => {
          const total = totals.find((t) => t.stageId === id)
          return {
            stageId: id,
            count: total?.count ?? 0,
            valueMinor: Number(total?.valueMinor ?? 0),
            deals: rows
              .filter(({ row }) => row.stageId === id)
              .map((joined) => toDeal(joined, me))
          }
        })
      }
    }
  }
}

export type TPipelineService = ReturnType<typeof createPipelineService>
