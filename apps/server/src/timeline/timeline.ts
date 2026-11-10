import type {
  TFieldChange,
  TRecordRef,
  TTimeline,
  TTimelineItem,
  TTimelineQuery
} from '@open-sales/shared'
import type { AnyColumn, SQL } from 'drizzle-orm'
import {
  and,
  asc,
  desc,
  eq,
  exists,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  sql
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import type { TDatabase } from '../db/client'
import {
  activity,
  activityPerson,
  changeLog,
  company,
  deal,
  dealStageChange,
  lostReason,
  person,
  stage,
  task,
  user
} from '../db/schema'
import type { TActor } from '../records/common'
import { isRecordId, RecordNotFoundError } from '../records/common'
import { loadActivities } from './activities'
import { sortableMoment } from './common'
import { loadTasks } from './tasks'

// How many upcoming items a first page carries at most.
const UPCOMING_LIMIT = 100

// A deal's stage moves come from `deal_stage_change`, so its change log
// leaves these out rather than saying the same thing twice.
const STAGE_FIELDS = new Set(['stageId', 'status', 'pipelineId'])

/*
 * History is four kinds of row merged by time, newest first. Rows at the
 * very same moment go in this order, then by id, so paging never repeats
 * or skips one.
 */
const RANK = { activity: 0, task: 1, stage: 2, change: 3 } as const

type TKind = keyof typeof RANK

/** One row of the merged stream: just enough to sort and to fetch it. */
type TEntry = { kind: TKind; id: string; key: string }

type TCursor = { key: string; rank: number; id: string }

const encodeCursor = ({ kind, key, id }: TEntry) =>
  Buffer.from(JSON.stringify([key, RANK[kind], id])).toString('base64url')

const decodeCursor = (cursor: string | undefined): TCursor | null => {
  if (!cursor) return null
  try {
    const [key, rank, id] = JSON.parse(
      Buffer.from(cursor, 'base64url').toString()
    )
    const isMoment =
      typeof key === 'string' && !Number.isNaN(new Date(key).getTime())
    return isMoment && typeof rank === 'number' && typeof id === 'string'
      ? { key, rank, id }
      : null
  } catch {
    return null
  }
}

/** Uuids sort as text; the logs' ids are numbers. */
const compareIds = (kind: TKind, a: string, b: string) =>
  kind === 'stage' || kind === 'change'
    ? Number(a) - Number(b)
    : a < b
      ? -1
      : a > b
        ? 1
        : 0

/** Newest first; then by kind; then the higher id. */
const byNewest = (a: TEntry, b: TEntry) => {
  if (a.key !== b.key) return a.key < b.key ? 1 : -1
  if (a.kind !== b.kind) return RANK[a.kind] - RANK[b.kind]
  return compareIds(a.kind, b.id, a.id)
}

/** Rows of one kind that come after the cursor in the merged order. */
const afterCursor = (
  cursor: TCursor | null,
  kind: TKind,
  at: AnyColumn,
  id: AnyColumn
): SQL | undefined => {
  if (!cursor) return undefined
  const moment = sql`${cursor.key}::timestamptz`
  if (RANK[kind] > cursor.rank) return sql`${at} <= ${moment}`
  if (RANK[kind] < cursor.rank) return sql`${at} < ${moment}`
  const cursorId =
    kind === 'stage' || kind === 'change'
      ? sql`${cursor.id}::bigint`
      : sql`${cursor.id}::uuid`
  return sql`(${at} < ${moment} or (${at} = ${moment} and ${id} < ${cursorId}))`
}

const TABLES = { company, person, deal } as const

const fromStage = alias(stage, 'from_stage')
const toStage = alias(stage, 'to_stage')

/** One record's timeline: what's coming up, then what happened. */
export const createTimelineReader = (db: TDatabase) => {
  const assertExists = async (ref: TRecordRef) => {
    const table = TABLES[ref.type]
    const [found] = isRecordId(ref.id)
      ? await db
          .select({ id: table.id })
          .from(table)
          .where(eq(table.id, ref.id))
      : []
    if (!found) throw new RecordNotFoundError(ref.type)
  }

  /* Which rows belong to a record, for each kind. */

  const activitiesOf = (ref: TRecordRef) =>
    and(
      isNull(activity.archivedAt),
      ref.type === 'company'
        ? eq(activity.companyId, ref.id)
        : ref.type === 'deal'
          ? eq(activity.dealId, ref.id)
          : exists(
              db
                .select({ one: sql`1` })
                .from(activityPerson)
                .where(
                  and(
                    eq(activityPerson.activityId, activity.id),
                    eq(activityPerson.personId, ref.id)
                  )
                )
            )
    )

  const tasksOf = (ref: TRecordRef) =>
    and(
      isNull(task.archivedAt),
      ref.type === 'company'
        ? eq(task.companyId, ref.id)
        : ref.type === 'deal'
          ? eq(task.dealId, ref.id)
          : eq(task.personId, ref.id)
    )

  /** Open tasks and anything dated ahead, soonest first; no date last. */
  const readUpcoming = async (ref: TRecordRef, now: Date) => {
    const [tasks, activities] = await Promise.all([
      db
        .select({ id: task.id, at: task.dueOn })
        .from(task)
        .where(and(tasksOf(ref), isNull(task.completedAt)))
        .orderBy(asc(task.dueOn), asc(task.id))
        .limit(UPCOMING_LIMIT),
      db
        .select({ id: activity.id, at: activity.occurredAt })
        .from(activity)
        .where(and(activitiesOf(ref), gt(activity.occurredAt, now)))
        .orderBy(asc(activity.occurredAt), asc(activity.id))
        .limit(UPCOMING_LIMIT)
    ])
    return [
      ...tasks.map(({ id, at }) => ({ kind: 'task' as const, id, at })),
      ...activities.map(({ id, at }) => ({
        kind: 'activity' as const,
        id,
        at: at.toISOString()
      }))
    ]
      .sort((a, b) => {
        if (a.at === b.at) return a.id < b.id ? -1 : 1
        if (a.at === null) return 1
        if (b.at === null) return -1
        // A day ("2026-11-30") sorts before any time on that day.
        return a.at < b.at ? -1 : 1
      })
      .slice(0, UPCOMING_LIMIT)
  }

  /** The next `limit + 1` rows of history after the cursor, merged. */
  const readHistory = async (
    ref: TRecordRef,
    cursor: TCursor | null,
    limit: number,
    now: Date
  ): Promise<TEntry[]> => {
    const take = limit + 1
    const sources: Promise<TEntry[]>[] = [
      db
        .select({ id: activity.id, key: sortableMoment(activity.occurredAt) })
        .from(activity)
        .where(
          and(
            activitiesOf(ref),
            lte(activity.occurredAt, now),
            afterCursor(cursor, 'activity', activity.occurredAt, activity.id)
          )
        )
        .orderBy(desc(activity.occurredAt), desc(activity.id))
        .limit(take)
        .then((rows) =>
          rows.map((row) => ({ kind: 'activity' as const, ...row }))
        ),
      // A finished task sits where it was ticked off.
      db
        .select({ id: task.id, key: sortableMoment(task.completedAt) })
        .from(task)
        .where(
          and(
            tasksOf(ref),
            isNotNull(task.completedAt),
            afterCursor(cursor, 'task', task.completedAt, task.id)
          )
        )
        .orderBy(desc(task.completedAt), desc(task.id))
        .limit(take)
        .then((rows) => rows.map((row) => ({ kind: 'task' as const, ...row }))),
      db
        .select({
          id: changeLog.id,
          key: sortableMoment(changeLog.occurredAt)
        })
        .from(changeLog)
        .where(
          and(
            eq(changeLog.recordType, ref.type),
            eq(changeLog.recordId, ref.id),
            // A deal's first stage row says it was created.
            ref.type === 'deal' ? ne(changeLog.action, 'create') : undefined,
            afterCursor(cursor, 'change', changeLog.occurredAt, changeLog.id)
          )
        )
        .orderBy(desc(changeLog.occurredAt), desc(changeLog.id))
        .limit(take)
        .then((rows) =>
          rows.map(({ id, key }) => ({
            kind: 'change' as const,
            id: String(id),
            key
          }))
        )
    ]
    // Stage moves: the deal's own, or those of a company's deals.
    if (ref.type !== 'person') {
      sources.push(
        db
          .select({
            id: dealStageChange.id,
            key: sortableMoment(dealStageChange.changedAt)
          })
          .from(dealStageChange)
          .innerJoin(deal, eq(deal.id, dealStageChange.dealId))
          .where(
            and(
              ref.type === 'deal'
                ? eq(dealStageChange.dealId, ref.id)
                : eq(deal.companyId, ref.id),
              afterCursor(
                cursor,
                'stage',
                dealStageChange.changedAt,
                dealStageChange.id
              )
            )
          )
          .orderBy(desc(dealStageChange.changedAt), desc(dealStageChange.id))
          .limit(take)
          .then((rows) =>
            rows.map(({ id, key }) => ({
              kind: 'stage' as const,
              id: String(id),
              key
            }))
          )
      )
    }
    return (await Promise.all(sources)).flat().sort(byNewest).slice(0, take)
  }

  /** Field changes, with the ids in them turned into names. */
  const loadChanges = async (ref: TRecordRef, ids: number[]) => {
    if (ids.length === 0) return new Map<string, TTimelineItem>()
    const rows = await db
      .select({ row: changeLog, actorName: user.name })
      .from(changeLog)
      .leftJoin(user, eq(user.id, changeLog.actorId))
      .where(inArray(changeLog.id, ids))

    const idsIn = (field: string) => [
      ...new Set(
        rows.flatMap(({ row }) =>
          row.changes
            .filter((change) => change.field === field)
            .flatMap(({ from, to }) => [from, to])
            .filter((value): value is string => typeof value === 'string')
        )
      )
    ]
    const userIds = idsIn('ownerId')
    const companyIds = idsIn('companyId').filter(isRecordId)
    const reasonIds = idsIn('lostReasonId').filter(isRecordId)
    const [users, companies, reasons] = await Promise.all([
      userIds.length
        ? db
            .select({ id: user.id, name: user.name })
            .from(user)
            .where(inArray(user.id, userIds))
        : [],
      companyIds.length
        ? db
            .select({ id: company.id, name: company.name })
            .from(company)
            .where(inArray(company.id, companyIds))
        : [],
      reasonIds.length
        ? db
            .select({ id: lostReason.id, name: lostReason.label })
            .from(lostReason)
            .where(inArray(lostReason.id, reasonIds))
        : []
    ])
    const names: Record<string, Map<string, string>> = {
      ownerId: new Map(users.map(({ id, name }) => [id, name])),
      companyId: new Map(companies.map(({ id, name }) => [id, name])),
      lostReasonId: new Map(reasons.map(({ id, name }) => [id, name]))
    }
    const nameOf = (field: string, value: unknown) =>
      typeof value === 'string' ? (names[field]?.get(value) ?? value) : value

    return new Map(
      rows.map(({ row, actorName }): [string, TTimelineItem] => {
        const changes: TFieldChange[] = row.changes
          .filter(
            ({ field }) => !(ref.type === 'deal' && STAGE_FIELDS.has(field))
          )
          .map(({ field, from, to }) => ({
            field,
            from: nameOf(field, from),
            to: nameOf(field, to)
          }))
        return [
          String(row.id),
          {
            kind: 'change',
            id: String(row.id),
            at: row.occurredAt.toISOString(),
            upcoming: false,
            actor:
              row.actorId && actorName !== null
                ? { id: row.actorId, name: actorName }
                : null,
            via: row.via,
            action: row.action,
            changes
          }
        ]
      })
    )
  }

  const loadStageMoves = async (ids: number[]) => {
    if (ids.length === 0) return new Map<string, TTimelineItem>()
    const rows = await db
      .select({
        row: dealStageChange,
        dealName: deal.name,
        fromName: fromStage.name,
        toName: toStage.name,
        actorName: user.name
      })
      .from(dealStageChange)
      .innerJoin(deal, eq(deal.id, dealStageChange.dealId))
      .innerJoin(toStage, eq(toStage.id, dealStageChange.toStageId))
      .leftJoin(fromStage, eq(fromStage.id, dealStageChange.fromStageId))
      .leftJoin(user, eq(user.id, dealStageChange.changedById))
      .where(inArray(dealStageChange.id, ids))
    return new Map(
      rows.map(
        ({
          row,
          dealName,
          fromName,
          toName,
          actorName
        }): [string, TTimelineItem] => [
          String(row.id),
          {
            kind: 'stage',
            id: String(row.id),
            at: row.changedAt.toISOString(),
            upcoming: false,
            actor:
              row.changedById && actorName !== null
                ? { id: row.changedById, name: actorName }
                : null,
            deal: { id: row.dealId, name: dealName },
            from:
              row.fromStageId && fromName !== null
                ? { id: row.fromStageId, name: fromName }
                : null,
            to: { id: row.toStageId, name: toName }
          }
        ]
      )
    )
  }

  return {
    /**
     * A page of a record's timeline. The first page starts with what's
     * upcoming; the cursor pages the history after it.
     */
    read: async (
      me: TActor,
      ref: TRecordRef,
      query: TTimelineQuery
    ): Promise<TTimeline> => {
      await assertExists(ref)
      const cursor = decodeCursor(query.cursor)
      const now = new Date()
      const [upcoming, history] = await Promise.all([
        cursor ? [] : readUpcoming(ref, now),
        readHistory(ref, cursor, query.limit, now)
      ])
      const shown = history.slice(0, query.limit)
      const last = shown.at(-1)
      const idsOf = (kind: TKind) =>
        [
          ...upcoming.filter((entry) => entry.kind === kind),
          ...shown.filter((entry) => entry.kind === kind)
        ].map((entry) => entry.id)

      const [activities, tasks, changes, moves] = await Promise.all([
        loadActivities(db, me, idsOf('activity')),
        loadTasks(db, me, idsOf('task')),
        loadChanges(ref, idsOf('change').map(Number)),
        loadStageMoves(idsOf('stage').map(Number))
      ])

      const toItem = (
        { kind, id }: { kind: TKind; id: string },
        isUpcoming: boolean
      ): TTimelineItem | null => {
        if (kind === 'activity') {
          const found = activities.get(id)
          return found
            ? {
                kind,
                id,
                at: found.occurredAt,
                upcoming: isUpcoming,
                activity: found
              }
            : null
        }
        if (kind === 'task') {
          const found = tasks.get(id)
          return found
            ? {
                kind,
                id,
                at: isUpcoming ? found.dueOn : found.completedAt,
                upcoming: isUpcoming,
                task: found
              }
            : null
        }
        const found = (kind === 'change' ? changes : moves).get(id) ?? null
        // An update that only moved the stage is told by the stage row.
        return found?.kind === 'change' &&
          found.action === 'update' &&
          found.changes.length === 0
          ? null
          : found
      }

      return {
        items: [
          ...upcoming.map((entry) => toItem(entry, true)),
          ...shown.map((entry) => toItem(entry, false))
        ].filter((item) => item !== null),
        nextCursor:
          history.length > query.limit && last ? encodeCursor(last) : null
      }
    }
  }
}

export type TTimelineReader = ReturnType<typeof createTimelineReader>
