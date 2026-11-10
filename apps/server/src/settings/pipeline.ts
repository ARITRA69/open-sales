import type {
  TLostReasonsSave,
  TPipelineSettings,
  TStagesSaveInput
} from '@open-sales/shared'
import {
  findRepeatedName,
  lostReasonsSaveSchema,
  stagesSaveSchema
} from '@open-sales/shared'
import { and, asc, count, eq, isNull, sql } from 'drizzle-orm'

import type { TDatabase } from '../db/client'
import {
  deal,
  dealStageChange,
  lostReason,
  pipeline,
  stage
} from '../db/schema'
import type { TActor, TLogEntry, TQueries } from '../records/common'
import {
  ChangedSinceError,
  diffFields,
  InvalidChangeError,
  logChanges,
  RecordNotFoundError
} from '../records/common'
import { createDealService } from '../records/deals'
import { assertAdmin } from './common'

const OUT_OF_DATE = 'That list is out of date. Reload and try again.'

/**
 * The default pipeline's row, locked until the transaction ends so saves
 * happen one at a time. Its `updated_at` is the revision: every save moves
 * it, and a save made against an older one is refused.
 */
const lockPipeline = async (tx: TQueries, revision: string) => {
  const [found] = await tx
    .select()
    .from(pipeline)
    .where(eq(pipeline.isDefault, true))
    .for('update')
  if (!found) throw new RecordNotFoundError('pipeline')
  if (found.updatedAt.toISOString() !== revision) throw new ChangedSinceError()
  return found
}

/** Moves the revision on, by at least a millisecond. */
const touchPipeline = (
  tx: TQueries,
  current: { id: string; updatedAt: Date }
) =>
  tx
    .update(pipeline)
    .set({
      updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1))
    })
    .where(eq(pipeline.id, current.id))

/**
 * An admin's edits to the default pipeline: its stages and the lost
 * reasons. Reading them for everyone else stays with /pipeline.
 */
export const createPipelineSettingsService = (db: TDatabase) => {
  const get = async (queries: TQueries = db): Promise<TPipelineSettings> => {
    const [found] = await queries
      .select()
      .from(pipeline)
      .where(eq(pipeline.isDefault, true))
    if (!found) throw new RecordNotFoundError('pipeline')

    const stages = await queries
      .select()
      .from(stage)
      .where(and(eq(stage.pipelineId, found.id), isNull(stage.archivedAt)))
      // The enum's order: open, then won, then lost.
      .orderBy(asc(stage.kind), asc(stage.position))
    const counts = await queries
      .select({ stageId: deal.stageId, total: count() })
      .from(deal)
      .where(and(eq(deal.pipelineId, found.id), isNull(deal.archivedAt)))
      .groupBy(deal.stageId)
    const reasons = await queries
      .select()
      .from(lostReason)
      .orderBy(
        sql`${lostReason.archivedAt} is not null`,
        asc(lostReason.position),
        asc(lostReason.id)
      )

    return {
      id: found.id,
      name: found.name,
      revision: found.updatedAt.toISOString(),
      stages: stages.map((row) => ({
        id: row.id,
        name: row.name,
        position: row.position,
        kind: row.kind,
        winProbability: row.winProbability,
        stalledAfterDays: row.stalledAfterDays,
        goal: row.goal,
        exitCriteria: row.exitCriteria,
        dealCount: counts.find((c) => c.stageId === row.id)?.total ?? 0
      })),
      lostReasons: reasons.map((row) => ({
        id: row.id,
        label: row.label,
        archivedAt: row.archivedAt?.toISOString() ?? null
      }))
    }
  }

  return {
    get: async (me: TActor): Promise<TPipelineSettings> => {
      assertAdmin(me)
      return get()
    },

    /**
     * The whole stage list in one transaction: renames, the new order, new
     * stages, and stages taken away with their deals moved on. Won and Lost
     * stay last and can only be renamed.
     */
    saveStages: async (
      me: TActor,
      input: TStagesSaveInput
    ): Promise<TPipelineSettings> => {
      assertAdmin(me)
      const data = stagesSaveSchema.parse(input)

      return db.transaction(async (tx) => {
        const current = await lockPipeline(tx, data.revision)
        const live = await tx
          .select()
          .from(stage)
          .where(
            and(eq(stage.pipelineId, current.id), isNull(stage.archivedAt))
          )
        const open = live.filter((row) => row.kind === 'open')
        const closed = live.filter((row) => row.kind !== 'open')

        // Every open stage is either kept or removed, once.
        const keptIds = data.stages.flatMap((s) => (s.id ? [s.id] : []))
        const named = [...keptIds, ...data.removed.map((r) => r.id)]
        if (
          new Set(named).size !== named.length ||
          named.length !== open.length ||
          named.some((id) => !open.some((row) => row.id === id))
        ) {
          throw new InvalidChangeError(OUT_OF_DATE)
        }

        const closedNames = { won: data.wonName, lost: data.lostName }
        const repeated = findRepeatedName([
          ...data.stages.map((s) => s.name),
          ...closed.map(
            (row) => closedNames[row.kind as 'won' | 'lost'] ?? row.name
          )
        ])
        if (repeated) {
          throw new InvalidChangeError(
            `Two stages are called “${repeated}”. Give each its own name.`
          )
        }

        const log: TLogEntry[] = []

        // The open stages, in their new order.
        const orderedIds: string[] = []
        for (const [position, wanted] of data.stages.entries()) {
          const { id, ...fields } = wanted
          const values = { ...fields, position }
          const before = open.find((row) => row.id === id)
          if (!before) {
            const [created] = await tx
              .insert(stage)
              .values({ ...values, pipelineId: current.id, kind: 'open' })
              .returning({ id: stage.id })
            orderedIds.push(created.id)
            log.push({
              recordType: 'stage',
              recordId: created.id,
              action: 'create',
              changes: diffFields({}, values)
            })
            continue
          }
          orderedIds.push(before.id)
          const changes = diffFields(before, values)
          if (changes.length === 0) continue
          await tx.update(stage).set(values).where(eq(stage.id, before.id))
          log.push({
            recordType: 'stage',
            recordId: before.id,
            action: 'update',
            changes
          })
        }

        // Stages taken away: their deals move first, then the stage goes.
        // The deal service moves them, so a move here is a move like any
        // other (the stage history and the change log). It runs inside this
        // transaction: its own transactions become savepoints.
        const deals = createDealService(tx as unknown as TDatabase)
        for (const { id, moveDealsTo } of data.removed) {
          const leaving = open.find((row) => row.id === id)!
          if (moveDealsTo !== null && !keptIds.includes(moveDealsTo)) {
            throw new InvalidChangeError(
              `Choose a stage that’s staying for the deals in “${leaving.name}”.`
            )
          }
          const inStage = await tx
            .select({
              id: deal.id,
              version: deal.version,
              archivedAt: deal.archivedAt
            })
            .from(deal)
            .where(eq(deal.stageId, id))
            .for('update')
          const liveDeals = inStage.filter((row) => !row.archivedAt)
          if (liveDeals.length > 0 && moveDealsTo === null) {
            throw new InvalidChangeError(
              `Choose where the deals in “${leaving.name}” should move.`
            )
          }
          for (const row of liveDeals) {
            await deals.update(me, row.id, {
              stageId: moveDealsTo!,
              version: row.version
            })
          }
          // Archived deals can't be edited, but they mustn't be left pointing
          // at a stage that's gone: restoring one would bring it back there.
          const archivedDeals = inStage.filter((row) => row.archivedAt)
          const fallback = moveDealsTo ?? orderedIds[0]
          if (archivedDeals.length > 0) {
            await tx
              .update(deal)
              .set({ stageId: fallback, version: sql`${deal.version} + 1` })
              .where(and(eq(deal.stageId, id)))
            await tx.insert(dealStageChange).values(
              archivedDeals.map((row) => ({
                dealId: row.id,
                fromStageId: id,
                toStageId: fallback,
                changedById: me.id
              }))
            )
            log.push(
              ...archivedDeals.map((row) => ({
                recordType: 'deal' as const,
                recordId: row.id,
                action: 'update' as const,
                changes: [{ field: 'stageId', from: id, to: fallback }]
              }))
            )
          }

          await tx
            .update(stage)
            .set({ archivedAt: new Date() })
            .where(eq(stage.id, id))
          log.push({
            recordType: 'stage',
            recordId: id,
            action: 'archive',
            changes:
              inStage.length > 0
                ? [{ field: 'dealsMovedTo', from: null, to: fallback }]
                : []
          })
        }

        // Won and Lost: always last, in that order.
        for (const row of closed) {
          const values = {
            name: closedNames[row.kind as 'won' | 'lost'] ?? row.name,
            position: data.stages.length + (row.kind === 'won' ? 0 : 1)
          }
          const changes = diffFields(row, values)
          if (changes.length === 0) continue
          await tx.update(stage).set(values).where(eq(stage.id, row.id))
          log.push({
            recordType: 'stage',
            recordId: row.id,
            action: 'update',
            changes
          })
        }

        await logChanges(tx, me, log)
        await touchPipeline(tx, current)
        return get(tx)
      })
    },

    /**
     * The lost reasons to offer, in order. Deals already lost for a reason
     * that's archived keep it.
     */
    saveLostReasons: async (
      me: TActor,
      input: TLostReasonsSave
    ): Promise<TPipelineSettings> => {
      assertAdmin(me)
      const data = lostReasonsSaveSchema.parse(input)

      return db.transaction(async (tx) => {
        const current = await lockPipeline(tx, data.revision)
        const all = await tx.select().from(lostReason)

        const listedIds = data.reasons.flatMap((r) => (r.id ? [r.id] : []))
        if (
          new Set(listedIds).size !== listedIds.length ||
          listedIds.some((id) => !all.some((row) => row.id === id))
        ) {
          throw new InvalidChangeError(OUT_OF_DATE)
        }
        const repeated = findRepeatedName(data.reasons.map((r) => r.label))
        if (repeated) {
          throw new InvalidChangeError(
            `“${repeated}” is on the list twice. Give each reason its own name.`
          )
        }

        const log: TLogEntry[] = []
        for (const [position, wanted] of data.reasons.entries()) {
          const before = all.find((row) => row.id === wanted.id)
          const values = { label: wanted.label, position }
          if (!before) {
            const [created] = await tx
              .insert(lostReason)
              .values(values)
              .returning({ id: lostReason.id })
            log.push({
              recordType: 'lost_reason',
              recordId: created.id,
              action: 'create',
              changes: diffFields({}, values)
            })
            continue
          }
          const changes = diffFields(before, values)
          if (changes.length === 0 && !before.archivedAt) continue
          await tx
            .update(lostReason)
            .set({ ...values, archivedAt: null })
            .where(eq(lostReason.id, before.id))
          if (before.archivedAt) {
            log.push({
              recordType: 'lost_reason',
              recordId: before.id,
              action: 'restore'
            })
          }
          if (changes.length > 0) {
            log.push({
              recordType: 'lost_reason',
              recordId: before.id,
              action: 'update',
              changes
            })
          }
        }

        const leaving = all.filter(
          (row) => !row.archivedAt && !listedIds.includes(row.id)
        )
        for (const row of leaving) {
          await tx
            .update(lostReason)
            .set({ archivedAt: new Date() })
            .where(eq(lostReason.id, row.id))
          log.push({
            recordType: 'lost_reason',
            recordId: row.id,
            action: 'archive'
          })
        }

        await logChanges(tx, me, log)
        await touchPipeline(tx, current)
        return get(tx)
      })
    }
  }
}
