import type { TPage, TSessionUser } from '@open-sales/shared'
import { and, eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js'

import type * as schema from '../db/schema'
import type { TFieldChange } from '../db/schema'
import { changeLog, user } from '../db/schema'

/**
 * The person making a request: who they are and what they may do. When an
 * approved AI proposal makes the change, `via` and `proposalId` say so in the
 * change log (see ../proposals).
 */
export type TActor = TSessionUser & {
  via?: 'app' | 'ai_proposal'
  proposalId?: string
}

/** A transaction, or the database itself: anything that runs queries. */
export type TQueries = PgDatabase<PostgresJsQueryResultHKT, typeof schema>

/* Errors the routes turn into answers. Messages are for people. */

export class RecordNotFoundError extends Error {
  constructor(what: string) {
    super(`That ${what} doesn’t exist, or was deleted.`)
  }
}

export class NotAllowedError extends Error {}

export class ChangedSinceError extends Error {
  constructor() {
    super(
      'Someone changed this while you were editing. Your change wasn’t saved; look again and redo it.'
    )
  }
}

/** A unique value someone else already has, like a company's domain. */
export class DuplicateError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

/** A change that makes no sense, like moving a deal to Lost with no reason. */
export class InvalidChangeError extends Error {}

/* Paging: a cursor is the last row's sort key and id, opaque to the app. */

export const encodeCursor = (key: string | null, id: string) =>
  Buffer.from(JSON.stringify([key, id])).toString('base64url')

export const decodeCursor = (
  cursor: string | undefined
): { key: string | null; id: string } | null => {
  if (!cursor) return null
  try {
    const [key, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString())
    if (typeof id !== 'string') return null
    return { key: typeof key === 'string' ? key : null, id }
  } catch {
    return null
  }
}

/** Fetch one more row than asked for; if it came, there's a next page. */
export const toPage = <TRow, TItem>(
  rows: TRow[],
  limit: number,
  toItem: (row: TRow) => TItem,
  keyOf: (row: TRow) => [string | null, string]
): TPage<TItem> => {
  const hasMore = rows.length > limit
  const shown = hasMore ? rows.slice(0, limit) : rows
  const last = shown.at(-1)
  return {
    items: shown.map(toItem),
    nextCursor: hasMore && last ? encodeCursor(...keyOf(last)) : null
  }
}

/** `%` and `_` typed in a search box are letters, not wildcards. */
export const containing = (text: string) =>
  `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`

export const isoOrNull = (date: Date | null) => date?.toISOString() ?? null

/* The change log: every write, with what changed. */

/** The fields whose values differ, as `{ field, from, to }`. */
export const diffFields = (
  before: Record<string, unknown>,
  after: Record<string, unknown>
): TFieldChange[] =>
  Object.keys(after)
    .filter((field) => after[field] !== undefined)
    .filter((field) => (before[field] ?? null) !== (after[field] ?? null))
    .map((field) => ({
      field,
      from: before[field] ?? null,
      to: after[field] ?? null
    }))

export type TLogEntry = Pick<
  typeof changeLog.$inferInsert,
  'recordType' | 'recordId' | 'action'
> & { changes?: TFieldChange[] }

export const logChanges = async (
  tx: TQueries,
  actor: TActor,
  entries: TLogEntry[]
) => {
  if (entries.length === 0) return
  await tx.insert(changeLog).values(
    entries.map((entry) => ({
      ...entry,
      actorId: actor.id,
      via: actor.via ?? ('app' as const),
      proposalId: actor.proposalId ?? null
    }))
  )
}

/** Someone who may own records: an active person on the team. */
export const assertCanOwn = async (tx: TQueries, userId: string) => {
  const [found] = await tx
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, userId), eq(user.status, 'active')))
  if (!found) {
    throw new InvalidChangeError('Choose someone who’s active on the team.')
  }
}

/** Postgres's unique-violation error, through Drizzle's wrapper if there is one. */
export const uniqueViolation = (error: unknown): string | null => {
  const cause =
    error instanceof Error && error.cause instanceof Error ? error.cause : error
  const pgError = cause as { code?: string; constraint_name?: string }
  return pgError?.code === '23505' ? (pgError.constraint_name ?? '') : null
}

/** Record ids are UUIDs; anything else can't be one, so it's "not found". */
export const isRecordId = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
