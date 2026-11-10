import type {
  TActivity,
  TActivityCreate,
  TActivityUpdate,
  TCallOutcome
} from '@open-sales/shared'
import {
  activityCreateSchema,
  activityUpdateSchema,
  CALL_OUTCOMES,
  canAddToTimeline,
  canEditActivity
} from '@open-sales/shared'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'

import type { TDatabase } from '../db/client'
import {
  activity,
  activityPerson,
  company,
  deal,
  person,
  user
} from '../db/schema'
import type { TActor, TQueries } from '../records/common'
import {
  diffFields,
  InvalidChangeError,
  isoOrNull,
  isRecordId,
  logChanges,
  NotAllowedError,
  RecordNotFoundError
} from '../records/common'
import { fileUnder } from './common'

type TActivityRow = typeof activity.$inferSelect

const NOT_FOUND = () => new RecordNotFoundError('note or call')

const outcomeOf = (row: TActivityRow): TCallOutcome | null =>
  CALL_OUTCOMES.find((outcome) => outcome === row.data.outcome) ?? null

/**
 * Activities by id, with the names their rows only point at. Used for one
 * activity and for a page of a timeline alike: three queries, however many.
 */
export const loadActivities = async (
  db: TQueries,
  me: TActor,
  ids: string[]
): Promise<Map<string, TActivity>> => {
  if (ids.length === 0) return new Map()
  const [rows, people] = await Promise.all([
    db
      .select({
        row: activity,
        companyName: company.name,
        dealName: deal.name,
        authorName: user.name
      })
      .from(activity)
      .leftJoin(company, eq(company.id, activity.companyId))
      .leftJoin(deal, eq(deal.id, activity.dealId))
      .leftJoin(user, eq(user.id, activity.authorId))
      .where(inArray(activity.id, ids)),
    db
      .select({
        activityId: activityPerson.activityId,
        id: person.id,
        name: person.name
      })
      .from(activityPerson)
      .innerJoin(person, eq(person.id, activityPerson.personId))
      .where(inArray(activityPerson.activityId, ids))
      .orderBy(asc(person.name), asc(person.id))
  ])

  return new Map(
    rows.map(({ row, companyName, dealName, authorName }) => [
      row.id,
      {
        id: row.id,
        type: row.type,
        occurredAt: row.occurredAt.toISOString(),
        endsAt: isoOrNull(row.endsAt),
        company:
          row.companyId && companyName !== null
            ? { id: row.companyId, name: companyName }
            : null,
        deal:
          row.dealId && dealName !== null
            ? { id: row.dealId, name: dealName }
            : null,
        author:
          row.authorId && authorName !== null
            ? { id: row.authorId, name: authorName }
            : null,
        source: row.source,
        title: row.title,
        body: row.body,
        outcome: outcomeOf(row),
        people: people
          .filter((involved) => involved.activityId === row.id)
          .map(({ id, name }) => ({ id, name })),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        archivedAt: isoOrNull(row.archivedAt),
        canEdit: canEditActivity(me.role, me.id, row.authorId)
      }
    ])
  )
}

/** The people named, checked: they must work at the activity's company. */
const peopleAt = async (
  tx: TQueries,
  companyId: string,
  personIds: string[]
) => {
  const wanted = [...new Set(personIds)]
  if (wanted.length === 0) return []
  const found = wanted.every(isRecordId)
    ? await tx
        .select({ id: person.id })
        .from(person)
        .where(
          and(
            inArray(person.id, wanted),
            eq(person.companyId, companyId),
            isNull(person.archivedAt)
          )
        )
    : []
  if (found.length !== wanted.length) {
    throw new InvalidChangeError('Choose people who work at this company.')
  }
  return wanted
}

/**
 * Keeps "last activity" current on everything an activity touched, in the
 * same transaction. It isn't an edit, so versions stay as they are. Things
 * dated in the future don't count until they've happened.
 */
const touchLastActivity = async (
  tx: TQueries,
  at: Date,
  filed: { companyId: string | null; dealId: string | null },
  personIds: string[]
) => {
  if (at.getTime() > Date.now()) return
  const moment = sql`${at.toISOString()}::timestamptz`
  if (filed.companyId) {
    await tx
      .update(company)
      .set({
        lastActivityAt: sql`greatest(${company.lastActivityAt}, ${moment})`,
        updatedAt: sql`${company.updatedAt}`
      })
      .where(eq(company.id, filed.companyId))
  }
  if (filed.dealId) {
    await tx
      .update(deal)
      .set({
        lastActivityAt: sql`greatest(${deal.lastActivityAt}, ${moment})`,
        updatedAt: sql`${deal.updatedAt}`
      })
      .where(eq(deal.id, filed.dealId))
  }
  if (personIds.length > 0) {
    await tx
      .update(person)
      .set({
        lastActivityAt: sql`greatest(${person.lastActivityAt}, ${moment})`,
        updatedAt: sql`${person.updatedAt}`
      })
      .where(inArray(person.id, personIds))
  }
}

const lockActivity = async (tx: TQueries, id: string) => {
  const [row] = isRecordId(id)
    ? await tx.select().from(activity).where(eq(activity.id, id)).for('update')
    : []
  if (!row) throw NOT_FOUND()
  return row
}

const assertMayEdit = (me: TActor, row: TActivityRow) => {
  if (!canEditActivity(me.role, me.id, row.authorId)) {
    throw new NotAllowedError(
      'Only whoever wrote this, a manager or an admin can change it.'
    )
  }
}

/** Notes and calls: writing them down, correcting them, taking them back. */
export const createActivityService = (db: TDatabase) => {
  const getOne = async (me: TActor, id: string): Promise<TActivity> => {
    const found = isRecordId(id) ? await loadActivities(db, me, [id]) : null
    const one = found?.get(id)
    if (!one) throw NOT_FOUND()
    return one
  }

  return {
    get: getOne,

    /**
     * Anyone on the team may add a note or a call to any record: writing
     * down what happened isn't changing the account.
     */
    create: async (me: TActor, input: TActivityCreate): Promise<TActivity> => {
      const data = activityCreateSchema.parse(input)
      if (!canAddToTimeline(me.role)) {
        throw new NotAllowedError('You can’t add to this timeline.')
      }

      const id = await db.transaction(async (tx) => {
        const filed = await fileUnder(tx, data.on)
        const occurredAt =
          data.type === 'call' && data.occurredAt
            ? new Date(data.occurredAt)
            : new Date()
        // A note on a person is about them; a call names who was on it.
        const personIds = await peopleAt(tx, filed.companyId, [
          ...(filed.personId ? [filed.personId] : []),
          ...(data.type === 'call' ? data.personIds : [])
        ])

        const [created] = await tx
          .insert(activity)
          .values({
            type: data.type,
            occurredAt,
            companyId: filed.companyId,
            dealId: filed.dealId,
            authorId: me.id,
            body: data.body ?? null,
            data: data.type === 'call' ? { outcome: data.outcome } : {}
          })
          .returning()
        if (personIds.length > 0) {
          await tx.insert(activityPerson).values(
            personIds.map((personId) => ({
              activityId: created.id,
              personId
            }))
          )
        }
        await touchLastActivity(tx, occurredAt, filed, personIds)
        await logChanges(tx, me, [
          {
            recordType: 'activity',
            recordId: created.id,
            action: 'create',
            changes: diffFields(
              {},
              {
                type: data.type,
                companyId: filed.companyId,
                dealId: filed.dealId,
                occurredAt: occurredAt.toISOString(),
                outcome: data.type === 'call' ? data.outcome : null,
                body: data.body ?? null,
                personIds: personIds.join(',') || null
              }
            )
          }
        ])
        return created.id
      })
      return getOne(me, id)
    },

    /** Corrects the text, the time, how a call went, or who was on it. */
    update: async (
      me: TActor,
      id: string,
      input: TActivityUpdate
    ): Promise<TActivity> => {
      const data = activityUpdateSchema.parse(input)
      await db.transaction(async (tx) => {
        const row = await lockActivity(tx, id)
        assertMayEdit(me, row)
        if (row.archivedAt) throw NOT_FOUND()
        const isCall = row.type === 'call'
        if (!isCall && row.type !== 'note') {
          throw new InvalidChangeError(
            'This came from sync and can’t be edited.'
          )
        }
        if (!isCall && data.body !== undefined && !data.body) {
          throw new InvalidChangeError('A note needs some words.')
        }

        const before = await tx
          .select({ personId: activityPerson.personId })
          .from(activityPerson)
          .where(eq(activityPerson.activityId, id))
        const beforeIds = before.map(({ personId }) => personId).sort()
        // Only a call's people can change; a note keeps its subject.
        const personIds =
          isCall && data.personIds !== undefined && row.companyId
            ? (await peopleAt(tx, row.companyId, data.personIds)).sort()
            : beforeIds
        const occurredAt =
          isCall && data.occurredAt ? new Date(data.occurredAt) : row.occurredAt
        const outcome = isCall
          ? (data.outcome ?? outcomeOf(row) ?? 'connected')
          : null

        const changes = diffFields(
          {
            body: row.body,
            occurredAt: row.occurredAt.toISOString(),
            outcome: outcomeOf(row),
            personIds: beforeIds.join(',') || null
          },
          {
            body: data.body,
            occurredAt: occurredAt.toISOString(),
            outcome,
            personIds: personIds.join(',') || null
          }
        )
        if (changes.length === 0) return

        await tx
          .update(activity)
          .set({
            body: data.body === undefined ? row.body : data.body,
            occurredAt,
            data: isCall
              ? { ...row.data, outcome: outcome ?? undefined }
              : row.data
          })
          .where(eq(activity.id, id))
        if (personIds.join() !== beforeIds.join()) {
          await tx
            .delete(activityPerson)
            .where(eq(activityPerson.activityId, id))
          if (personIds.length > 0) {
            await tx
              .insert(activityPerson)
              .values(
                personIds.map((personId) => ({ activityId: id, personId }))
              )
          }
        }
        await touchLastActivity(tx, occurredAt, row, personIds)
        await logChanges(tx, me, [
          { recordType: 'activity', recordId: id, action: 'update', changes }
        ])
      })
      return getOne(me, id)
    },

    /** Takes a note or call off the timeline. Nothing is deleted. */
    archive: async (me: TActor, id: string): Promise<TActivity> => {
      await db.transaction(async (tx) => {
        const row = await lockActivity(tx, id)
        assertMayEdit(me, row)
        if (row.archivedAt) return
        await tx
          .update(activity)
          .set({ archivedAt: new Date() })
          .where(eq(activity.id, id))
        await logChanges(tx, me, [
          { recordType: 'activity', recordId: id, action: 'archive' }
        ])
      })
      return getOne(me, id)
    }
  }
}

export type TActivityService = ReturnType<typeof createActivityService>
