import type {
  TPage,
  TTask,
  TTaskCreate,
  TTaskListQuery,
  TTaskUpdate
} from '@open-sales/shared'
import {
  canAddToTimeline,
  canEditTask,
  taskCreateSchema,
  taskUpdateSchema
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
  lte,
  sql
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import type { TDatabase } from '../db/client'
import { company, deal, person, task, user } from '../db/schema'
import type { TActor, TQueries } from '../records/common'
import {
  assertCanOwn,
  ChangedSinceError,
  decodeCursor,
  diffFields,
  InvalidChangeError,
  isoOrNull,
  isRecordId,
  logChanges,
  NotAllowedError,
  RecordNotFoundError,
  toPage
} from '../records/common'
import { fileUnder, readToday, sortableMoment } from './common'

type TTaskRow = typeof task.$inferSelect

const NOT_FOUND = () => new RecordNotFoundError('task')

const assignee = alias(user, 'assignee')
const creator = alias(user, 'creator')

/** Tasks with the names their rows only point at, for every read. */
const selectTasks = (db: TQueries) =>
  db
    .select({
      row: task,
      assigneeName: assignee.name,
      creatorName: creator.name,
      companyName: company.name,
      dealName: deal.name,
      personName: person.name,
      // When it was finished, to the microsecond: the cursor for done tasks.
      doneKey: sortableMoment(task.completedAt)
    })
    .from(task)
    .innerJoin(assignee, eq(assignee.id, task.assigneeId))
    .innerJoin(creator, eq(creator.id, task.createdById))
    .leftJoin(company, eq(company.id, task.companyId))
    .leftJoin(deal, eq(deal.id, task.dealId))
    .leftJoin(person, eq(person.id, task.personId))

type TJoined = Awaited<ReturnType<typeof selectTasks>>[number]

const named = (id: string | null, name: string | null) =>
  id && name !== null ? { id, name } : null

const toTask = (
  {
    row,
    assigneeName,
    creatorName,
    companyName,
    dealName,
    personName
  }: TJoined,
  me: TActor
): TTask => ({
  id: row.id,
  title: row.title,
  notes: row.notes,
  dueOn: row.dueOn,
  assignee: { id: row.assigneeId, name: assigneeName },
  createdBy: { id: row.createdById, name: creatorName },
  company: named(row.companyId, companyName),
  deal: named(row.dealId, dealName),
  person: named(row.personId, personName),
  completedAt: isoOrNull(row.completedAt),
  source: row.source,
  version: row.version,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  archivedAt: isoOrNull(row.archivedAt),
  canEdit: canEditTask(me.role, me.id, row)
})

/** Tasks by id, for a page of a timeline. */
export const loadTasks = async (
  db: TQueries,
  me: TActor,
  ids: string[]
): Promise<Map<string, TTask>> => {
  if (ids.length === 0) return new Map()
  const rows = await selectTasks(db).where(inArray(task.id, ids))
  return new Map(rows.map((joined) => [joined.row.id, toTask(joined, me)]))
}

const lockTask = async (tx: TQueries, id: string) => {
  const [row] = isRecordId(id)
    ? await tx.select().from(task).where(eq(task.id, id)).for('update')
    : []
  if (!row) throw NOT_FOUND()
  return row
}

const assertMayEdit = (me: TActor, row: TTaskRow) => {
  if (!canEditTask(me.role, me.id, row)) {
    throw new NotAllowedError(
      'Only whoever it’s for, whoever made it, a manager or an admin can change this task.'
    )
  }
}

/** Follow-ups: what needs doing, by when, for which record. */
export const createTaskService = (db: TDatabase) => {
  const getOne = async (me: TActor, id: string): Promise<TTask> => {
    const [found] = isRecordId(id)
      ? await selectTasks(db).where(eq(task.id, id))
      : []
    if (!found) throw NOT_FOUND()
    return toTask(found, me)
  }

  /** Ticks a task off, or puts it back. */
  const setDone = async (
    me: TActor,
    id: string,
    version: number,
    done: boolean
  ): Promise<TTask> => {
    await db.transaction(async (tx) => {
      const row = await lockTask(tx, id)
      assertMayEdit(me, row)
      if (row.archivedAt) throw NOT_FOUND()
      if (Boolean(row.completedAt) === done) return
      if (row.version !== version) throw new ChangedSinceError()
      const completedAt = done ? new Date() : null
      await tx
        .update(task)
        .set({ completedAt, version: sql`${task.version} + 1` })
        .where(eq(task.id, id))
      await logChanges(tx, me, [
        {
          recordType: 'task',
          recordId: id,
          action: 'update',
          changes: [
            {
              field: 'completedAt',
              from: isoOrNull(row.completedAt),
              to: isoOrNull(completedAt)
            }
          ]
        }
      ])
    })
    return getOne(me, id)
  }

  return {
    get: getOne,

    /**
     * Open tasks soonest first (no date last), or finished ones newest
     * first. `due: 'today'` keeps what's due today or overdue, where the
     * team is.
     */
    list: async (me: TActor, query: TTaskListQuery): Promise<TPage<TTask>> => {
      const after = decodeCursor(query.cursor)
      const isDone = query.status === 'done'
      const afterId = after && isRecordId(after.id) ? after.id : null

      const conditions: (SQL | undefined)[] = [
        isNull(task.archivedAt),
        isDone ? isNotNull(task.completedAt) : isNull(task.completedAt),
        query.assignee === 'me' ? eq(task.assigneeId, me.id) : undefined,
        query.due === 'today' ? lte(task.dueOn, await readToday(db)) : undefined
      ]
      if (after && afterId) {
        const { key } = after
        if (isDone) {
          conditions.push(
            key
              ? sql`(${task.completedAt}, ${task.id}) < (${key}::timestamptz, ${afterId}::uuid)`
              : undefined
          )
        } else {
          // Dated tasks come first, so "after" a dateless one is dateless too.
          conditions.push(
            key
              ? sql`(${task.dueOn} is null or (${task.dueOn}, ${task.id}) > (${key}::date, ${afterId}::uuid))`
              : sql`(${task.dueOn} is null and ${task.id} > ${afterId}::uuid)`
          )
        }
      }

      const rows = await selectTasks(db)
        .where(and(...conditions))
        .orderBy(
          ...(isDone
            ? [desc(task.completedAt), desc(task.id)]
            : [asc(task.dueOn), asc(task.id)])
        )
        .limit(query.limit + 1)
      return toPage(
        rows,
        query.limit,
        (joined) => toTask(joined, me),
        ({ row, doneKey }) => [isDone ? doneKey : row.dueOn, row.id]
      )
    },

    /** Anyone may add a task to any record, for themselves or a teammate. */
    create: async (me: TActor, input: TTaskCreate): Promise<TTask> => {
      const data = taskCreateSchema.parse(input)
      if (!canAddToTimeline(me.role)) {
        throw new NotAllowedError('You can’t add to this timeline.')
      }
      const id = await db.transaction(async (tx) => {
        const filed = data.on
          ? await fileUnder(tx, data.on)
          : { companyId: null, dealId: null, personId: null }
        const assigneeId = data.assigneeId ?? me.id
        await assertCanOwn(tx, assigneeId)
        const values = {
          title: data.title,
          notes: data.notes ?? null,
          dueOn: data.dueOn ?? null,
          assigneeId,
          ...filed
        }
        const [created] = await tx
          .insert(task)
          .values({ ...values, createdById: me.id })
          .returning()
        await logChanges(tx, me, [
          {
            recordType: 'task',
            recordId: created.id,
            action: 'create',
            changes: diffFields({}, values)
          }
        ])
        return created.id
      })
      return getOne(me, id)
    },

    update: async (
      me: TActor,
      id: string,
      input: TTaskUpdate
    ): Promise<TTask> => {
      const { version, ...data } = taskUpdateSchema.parse(input)
      await db.transaction(async (tx) => {
        const row = await lockTask(tx, id)
        assertMayEdit(me, row)
        if (row.archivedAt) throw NOT_FOUND()
        if (row.version !== version) throw new ChangedSinceError()

        const changes = diffFields(row, data)
        if (changes.length === 0) return
        if (
          data.assigneeId !== undefined &&
          data.assigneeId !== row.assigneeId
        ) {
          await assertCanOwn(tx, data.assigneeId)
        }
        if (row.completedAt) {
          throw new InvalidChangeError('Reopen this task to change it.')
        }
        await tx
          .update(task)
          .set({ ...data, version: sql`${task.version} + 1` })
          .where(eq(task.id, id))
        await logChanges(tx, me, [
          { recordType: 'task', recordId: id, action: 'update', changes }
        ])
      })
      return getOne(me, id)
    },

    complete: (me: TActor, id: string, version: number) =>
      setDone(me, id, version, true),

    reopen: (me: TActor, id: string, version: number) =>
      setDone(me, id, version, false),

    /** Takes a task off every list. Nothing is deleted. */
    archive: async (
      me: TActor,
      id: string,
      version: number
    ): Promise<TTask> => {
      await db.transaction(async (tx) => {
        const row = await lockTask(tx, id)
        assertMayEdit(me, row)
        if (row.archivedAt) return
        if (row.version !== version) throw new ChangedSinceError()
        await tx
          .update(task)
          .set({ archivedAt: new Date(), version: sql`${task.version} + 1` })
          .where(eq(task.id, id))
        await logChanges(tx, me, [
          { recordType: 'task', recordId: id, action: 'archive' }
        ])
      })
      return getOne(me, id)
    }
  }
}

export type TTaskService = ReturnType<typeof createTaskService>
