import type {
  TPage,
  TPlaybook,
  TPlaybookAction,
  TPlaybookBlank,
  TPlaybookChange,
  TPlaybookCreate,
  TPlaybookListQuery,
  TPlaybookUpdate
} from '@open-sales/shared'
import {
  canSeePlaybook,
  canWritePlaybooks,
  PLAYBOOK_CHANGES,
  playbookCreateSchema,
  playbookUpdateSchema
} from '@open-sales/shared'
import type { SQL } from 'drizzle-orm'
import { and, asc, eq, ilike, isNotNull, isNull, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import type { TDatabase } from '../db/client'
import type { TFieldChange } from '../db/schema'
import { playbook, playbookVersion, user } from '../db/schema'
import type { TActor, TQueries } from '../records/common'
import {
  ChangedSinceError,
  containing,
  decodeCursor,
  diffFields,
  InvalidChangeError,
  isoOrNull,
  logChanges,
  NotAllowedError,
  RecordNotFoundError,
  toPage
} from '../records/common'

type TPlaybookRow = typeof playbook.$inferSelect
type TVersionRow = typeof playbookVersion.$inferSelect

// Two people from `user`: who wrote the playbook, and who saved this version.
const author = alias(user, 'author')
const editor = alias(user, 'editor')

type TFound = {
  row: TPlaybookRow
  current: TVersionRow
  authorName: string | null
  editorName: string | null
}

/**
 * Only the fixed set ever leaves the server, whatever a row holds: a value
 * written into the database by hand can't give a playbook more.
 */
const knownChanges = (stored: string[]): TPlaybookChange[] =>
  PLAYBOOK_CHANGES.filter((change) => stored.includes(change))

/**
 * Blanks as the API writes them. Postgres hands jsonb keys back in its own
 * order, which would make an unchanged blank look changed.
 */
const tidyBlanks = (stored: TPlaybookBlank[]): TPlaybookBlank[] =>
  stored.map(({ name, question, options }) => ({ name, question, options }))

const toPlaybook = (
  { row, current, authorName, editorName }: TFound,
  me: TActor
): TPlaybook => ({
  id: row.id,
  name: row.name,
  description: row.description,
  author:
    row.authorId && authorName ? { id: row.authorId, name: authorName } : null,
  status: row.publishedAt ? 'published' : 'draft',
  publishedAt: isoOrNull(row.publishedAt),
  current: {
    id: current.id,
    number: current.version,
    steps: current.steps,
    blanks: tidyBlanks(current.blanks),
    allowedChanges: knownChanges(current.allowedChanges),
    createdBy:
      current.createdById && editorName
        ? { id: current.createdById, name: editorName }
        : null,
    createdAt: current.createdAt.toISOString()
  },
  version: row.version,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  archivedAt: isoOrNull(row.archivedAt),
  canEdit: canWritePlaybooks(me.role)
})

const NOT_FOUND = () => new RecordNotFoundError('playbook')

const assertMayWrite = (me: TActor) => {
  if (!canWritePlaybooks(me.role)) {
    throw new NotAllowedError(
      'Only managers and admins can write or change playbooks.'
    )
  }
}

/** Loads a playbook to change, locked until the transaction ends. */
const lockPlaybook = async (tx: TQueries, id: string) => {
  const [row] = await tx
    .select()
    .from(playbook)
    .where(eq(playbook.id, id))
    .for('update')
  if (!row) throw NOT_FOUND()
  return row
}

const currentVersionOf = async (tx: TQueries, row: TPlaybookRow) => {
  const [current] = row.currentVersionId
    ? await tx
        .select()
        .from(playbookVersion)
        .where(eq(playbookVersion.id, row.currentVersionId))
    : []
  if (!current) throw NOT_FOUND()
  return current
}

const NEEDS_STEPS = 'Write the steps before publishing this playbook.'

const sameJson = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b)

/** What the AI is told: the part of a playbook that's versioned. */
type TContent = {
  steps: string
  blanks: TPlaybookBlank[]
  allowedChanges: TPlaybookChange[]
}

const diffContent = (before: TContent, after: TContent): TFieldChange[] =>
  (['steps', 'blanks', 'allowedChanges'] as const)
    .filter((field) => !sameJson(before[field], after[field]))
    .map((field) => ({ field, from: before[field], to: after[field] }))

export const createPlaybookService = (db: TDatabase) => {
  const select = () =>
    db
      .select({
        row: playbook,
        current: playbookVersion,
        authorName: author.name,
        editorName: editor.name
      })
      .from(playbook)
      .innerJoin(
        playbookVersion,
        eq(playbookVersion.id, playbook.currentVersionId)
      )
      .leftJoin(author, eq(author.id, playbook.authorId))
      .leftJoin(editor, eq(editor.id, playbookVersion.createdById))

  const getOne = async (me: TActor, id: string): Promise<TPlaybook> => {
    const [found] = await select().where(eq(playbook.id, id))
    // A draft someone may not see looks the same as one that isn't there.
    if (
      !found ||
      !canSeePlaybook(me.role, me.id, {
        authorId: found.row.authorId,
        isPublished: found.row.publishedAt !== null
      })
    ) {
      throw NOT_FOUND()
    }
    return toPlaybook(found, me)
  }

  return {
    get: getOne,

    /**
     * The library, A–Z. Managers and admins see drafts too; everyone else
     * gets published playbooks, plus any draft they wrote themselves.
     */
    list: async (
      me: TActor,
      query: TPlaybookListQuery
    ): Promise<TPage<TPlaybook>> => {
      const after = decodeCursor(query.cursor)
      const conditions: (SQL | undefined)[] = [
        query.archived
          ? isNotNull(playbook.archivedAt)
          : isNull(playbook.archivedAt),
        canWritePlaybooks(me.role)
          ? undefined
          : or(isNotNull(playbook.publishedAt), eq(playbook.authorId, me.id)),
        query.status === 'published'
          ? isNotNull(playbook.publishedAt)
          : undefined,
        query.status === 'draft' ? isNull(playbook.publishedAt) : undefined,
        query.q
          ? or(
              ilike(playbook.name, containing(query.q)),
              ilike(playbook.description, containing(query.q))
            )
          : undefined,
        after
          ? sql`(${playbook.name}, ${playbook.id}) > (${after.key}, ${after.id})`
          : undefined
      ]
      const rows = await select()
        .where(and(...conditions))
        .orderBy(asc(playbook.name), asc(playbook.id))
        .limit(query.limit + 1)
      return toPage(
        rows,
        query.limit,
        (found) => toPlaybook(found, me),
        ({ row }) => [row.name, row.id]
      )
    },

    /** A new draft, with its first version. */
    create: async (me: TActor, input: TPlaybookCreate): Promise<TPlaybook> => {
      assertMayWrite(me)
      const data = playbookCreateSchema.parse(input)
      const content: TContent = {
        steps: data.steps ?? '',
        blanks: data.blanks ?? [],
        allowedChanges: data.allowedChanges ?? []
      }

      const id = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(playbook)
          .values({
            name: data.name,
            description: data.description ?? null,
            authorId: me.id
          })
          .returning({ id: playbook.id })
        const [first] = await tx
          .insert(playbookVersion)
          .values({
            playbookId: created.id,
            version: 1,
            ...content,
            createdById: me.id
          })
          .returning({ id: playbookVersion.id })
        await tx
          .update(playbook)
          // Making it is one write, so it starts at version 1.
          .set({ currentVersionId: first.id, version: 1 })
          .where(eq(playbook.id, created.id))
        await logChanges(tx, me, [
          {
            recordType: 'playbook',
            recordId: created.id,
            action: 'create',
            changes: [
              ...diffFields(
                {},
                { name: data.name, description: data.description ?? null }
              ),
              ...diffContent(
                { steps: '', blanks: [], allowedChanges: [] },
                content
              )
            ]
          }
        ])
        return created.id
      })
      return getOne(me, id)
    },

    /**
     * Changes what's sent. A change to the steps, the blanks or what it may
     * change is saved as a new numbered version; the old ones stay as they
     * were. A new name or description changes the playbook itself.
     */
    update: async (
      me: TActor,
      id: string,
      input: TPlaybookUpdate
    ): Promise<TPlaybook> => {
      assertMayWrite(me)
      const { version, name, description, ...sent } =
        playbookUpdateSchema.parse(input)

      await db.transaction(async (tx) => {
        const row = await lockPlaybook(tx, id)
        if (row.archivedAt) {
          throw new InvalidChangeError('Restore this playbook to change it.')
        }
        if (row.version !== version) throw new ChangedSinceError()

        const current = await currentVersionOf(tx, row)
        const before: TContent = {
          steps: current.steps,
          blanks: tidyBlanks(current.blanks),
          allowedChanges: knownChanges(current.allowedChanges)
        }
        const after: TContent = {
          steps: sent.steps ?? before.steps,
          blanks: sent.blanks ?? before.blanks,
          allowedChanges: sent.allowedChanges ?? before.allowedChanges
        }
        if (row.publishedAt && !after.steps) {
          throw new InvalidChangeError(
            'A published playbook needs its steps. Unpublish it to empty them.'
          )
        }

        const changes = [
          ...diffFields(row, { name, description }),
          ...diffContent(before, after)
        ]
        if (changes.length === 0) return

        let currentVersionId = row.currentVersionId
        if (diffContent(before, after).length > 0) {
          const [next] = await tx
            .insert(playbookVersion)
            .values({
              playbookId: id,
              version: current.version + 1,
              ...after,
              createdById: me.id
            })
            .returning({ id: playbookVersion.id })
          currentVersionId = next.id
        }
        await tx
          .update(playbook)
          .set({
            name,
            description,
            currentVersionId,
            version: sql`${playbook.version} + 1`
          })
          .where(eq(playbook.id, id))
        await logChanges(tx, me, [
          { recordType: 'playbook', recordId: id, action: 'update', changes }
        ])
      })
      return getOne(me, id)
    },

    /**
     * Publish shows it to the team; unpublish takes it back to a draft.
     * Archive hides it from the library; restore brings it back as it was.
     */
    setState: async (
      me: TActor,
      id: string,
      action: TPlaybookAction,
      version: number
    ): Promise<TPlaybook> => {
      assertMayWrite(me)

      await db.transaction(async (tx) => {
        const row = await lockPlaybook(tx, id)
        const isPublished = row.publishedAt !== null
        const isArchived = row.archivedAt !== null
        // Asking for how it already is changes nothing, whatever the version.
        const isAlready = {
          publish: isPublished,
          unpublish: !isPublished,
          archive: isArchived,
          restore: !isArchived
        }[action]
        if (isAlready) return
        if (row.version !== version) throw new ChangedSinceError()

        const now = new Date()
        const bump = { version: sql`${playbook.version} + 1` }

        if (action === 'publish' || action === 'unpublish') {
          if (isArchived) {
            throw new InvalidChangeError('Restore this playbook to change it.')
          }
          if (action === 'publish') {
            const current = await currentVersionOf(tx, row)
            if (!current.steps.trim()) throw new InvalidChangeError(NEEDS_STEPS)
          }
          const publishedAt = action === 'publish' ? now : null
          await tx
            .update(playbook)
            .set({ publishedAt, ...bump })
            .where(eq(playbook.id, id))
          await logChanges(tx, me, [
            {
              recordType: 'playbook',
              recordId: id,
              action: 'update',
              changes: [
                {
                  field: 'publishedAt',
                  from: isoOrNull(row.publishedAt),
                  to: isoOrNull(publishedAt)
                }
              ]
            }
          ])
          return
        }

        await tx
          .update(playbook)
          .set({ archivedAt: action === 'archive' ? now : null, ...bump })
          .where(eq(playbook.id, id))
        await logChanges(tx, me, [
          { recordType: 'playbook', recordId: id, action }
        ])
      })
      return getOne(me, id)
    }
  }
}

export type TPlaybookService = ReturnType<typeof createPlaybookService>
