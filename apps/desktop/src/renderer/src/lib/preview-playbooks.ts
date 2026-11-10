import type {
  Role,
  TOwner,
  TPlaybook,
  TPlaybookBlank,
  TPlaybookChange
} from '@open-sales/shared'
import {
  canSeePlaybook,
  canWritePlaybooks,
  playbookCreateSchema,
  playbookUpdateSchema,
  ROLES,
  STARTER_PLAYBOOKS
} from '@open-sales/shared'

import type {
  TApiResult,
  TOpenSalesBridge
} from '../../../preload/bridge-types'

/*
 * Pretend playbooks for the browser preview (`?preview=signed-in#/playbooks`).
 * It keeps changes in memory and follows the server's rules: versions,
 * drafts, publishing and who may write. The preview person is an admin; add
 * `&role=member` (or `manager`) to see the page as someone else.
 */

const ME: TOwner = { id: 'preview', name: 'Asha Menon' }
const DAN: TOwner = { id: 'dan', name: 'Dan Okafor' }

const daysAgo = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

type TContent = {
  steps: string
  blanks: TPlaybookBlank[]
  allowedChanges: TPlaybookChange[]
}

const playbook = (
  id: string,
  name: string,
  description: string,
  content: TContent,
  author: TOwner | null,
  days: number,
  isPublished: boolean,
  number = 1
): TPlaybook => ({
  id,
  name,
  description,
  author,
  status: isPublished ? 'published' : 'draft',
  publishedAt: isPublished ? daysAgo(days) : null,
  current: {
    id: `${id}-v${number}`,
    number,
    ...content,
    createdBy: author,
    createdAt: daysAgo(days)
  },
  version: number,
  createdAt: daysAgo(days + 3),
  updatedAt: daysAgo(days),
  archivedAt: null,
  canEdit: true
})

const PLAYBOOKS: TPlaybook[] = [
  ...STARTER_PLAYBOOKS.map((starter, index) =>
    playbook(
      `starter-${index + 1}`,
      starter.name,
      starter.description,
      starter,
      null,
      30,
      true
    )
  ),
  playbook(
    'pricing-objection',
    'Answer a pricing objection',
    'A reply that holds the price and offers a way forward.',
    {
      steps: [
        '1. Read the email or note where they pushed back on price, and what we quoted.',
        '2. Say what is behind it: budget, a cheaper competitor, or not seeing the value yet.',
        '3. Draft a reply that holds the price, names two things they said they need that it pays for, and offers {Give}.',
        '4. Propose a task to follow up in three days if they don’t answer.'
      ].join('\n'),
      blanks: [
        {
          name: 'Give',
          question: 'What can we offer instead of a discount?',
          options: [
            'A longer trial',
            'Annual billing',
            'A smaller plan to start'
          ]
        }
      ],
      allowedChanges: ['tasks', 'email_drafts']
    },
    DAN,
    6,
    true,
    3
  ),
  playbook(
    'demo-follow-up',
    'Follow-up after a demo',
    'Recap the demo and set the next step.',
    {
      steps:
        'Read the demo notes. Draft a recap email with the three things they cared about, for the {Plan} plan. Propose the next step and close date.',
      blanks: [
        {
          name: 'Plan',
          question: 'Which plan did they pick?',
          options: ['Starter', 'Team', 'Enterprise']
        }
      ],
      allowedChanges: ['fields', 'email_drafts']
    },
    ME,
    1,
    false
  )
]

const pause = () => new Promise((resolve) => setTimeout(resolve, 250))

const ok = async <TData>(data: TData): Promise<TApiResult<TData>> => {
  await pause()
  return { ok: true, data: structuredClone(data) }
}

const problem = async (
  message: string,
  code?: string
): Promise<TApiResult<never>> => {
  await pause()
  return { ok: false, message, code }
}

const NOT_FOUND = () =>
  problem('That playbook doesn’t exist, or was deleted.', 'not_found')
const NOT_ALLOWED = () =>
  problem(
    'Only managers and admins can write or change playbooks.',
    'forbidden'
  )
const CHANGED_SINCE = () =>
  problem(
    'Someone changed this while you were editing. Your change wasn’t saved; look again and redo it.',
    'changed_since'
  )

/** Who the preview shows the page as: `&role=member`, else nobody special. */
export const previewRole = (search: string): Role | null => {
  const params = new URLSearchParams(search)
  if (!params.has('preview')) return null
  return ROLES.find((role) => role === params.get('role')) ?? null
}

/** The pretend playbooks bridge, or null outside the preview. */
export const createPreviewPlaybooks = (
  search: string
): TOpenSalesBridge['playbooks'] | null => {
  if (!new URLSearchParams(search).has('preview')) return null

  const role = previewRole(search) ?? 'admin'
  const canWrite = canWritePlaybooks(role)
  const store = structuredClone(PLAYBOOKS).map((item) => ({
    ...item,
    canEdit: canWrite
  }))

  const visible = (item: TPlaybook) =>
    canSeePlaybook(role, ME.id, {
      authorId: item.author?.id ?? null,
      isPublished: item.status === 'published'
    })
  const find = (id: string) =>
    store.find((item) => item.id === id && visible(item))

  const touch = (item: TPlaybook, changes: Partial<TPlaybook>) =>
    Object.assign(item, changes, {
      version: item.version + 1,
      updatedAt: new Date().toISOString()
    })

  return {
    list: (query = {}) => {
      const q = query.q?.trim().toLowerCase() ?? ''
      const archived = query.archived === 'true'
      const items = store
        .filter(visible)
        .filter((item) => Boolean(item.archivedAt) === archived)
        .filter(
          (item) =>
            !query.status ||
            query.status === 'any' ||
            item.status === query.status
        )
        .filter((item) =>
          `${item.name} ${item.description ?? ''}`.toLowerCase().includes(q)
        )
        .sort((a, b) => a.name.localeCompare(b.name))
      return ok({ items, nextCursor: null })
    },

    get: (id) => {
      const found = find(id)
      return found ? ok(found) : NOT_FOUND()
    },

    create: (input) => {
      if (!canWrite) return NOT_ALLOWED()
      const parsed = playbookCreateSchema.safeParse(input)
      if (!parsed.success) return problem(parsed.error.issues[0].message)
      const { name, description, steps, blanks, allowedChanges } = parsed.data
      const now = new Date().toISOString()
      const id = `new-${Math.random().toString(36).slice(2, 8)}`
      const created: TPlaybook = {
        id,
        name,
        description: description ?? null,
        author: ME,
        status: 'draft',
        publishedAt: null,
        current: {
          id: `${id}-v1`,
          number: 1,
          steps: steps ?? '',
          blanks: blanks ?? [],
          allowedChanges: allowedChanges ?? [],
          createdBy: ME,
          createdAt: now
        },
        version: 1,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        canEdit: true
      }
      store.push(created)
      return ok(created)
    },

    update: (id, input) => {
      if (!canWrite) return NOT_ALLOWED()
      const found = find(id)
      if (!found) return NOT_FOUND()
      const parsed = playbookUpdateSchema.safeParse(input)
      if (!parsed.success) return problem(parsed.error.issues[0].message)
      const { version, name, description, ...sent } = parsed.data
      if (found.archivedAt) {
        return problem('Restore this playbook to change it.', 'invalid_change')
      }
      if (found.version !== version) return CHANGED_SINCE()

      const before: TContent = {
        steps: found.current.steps,
        blanks: found.current.blanks,
        allowedChanges: found.current.allowedChanges
      }
      const after: TContent = {
        steps: sent.steps ?? before.steps,
        blanks: sent.blanks ?? before.blanks,
        allowedChanges: sent.allowedChanges ?? before.allowedChanges
      }
      if (found.status === 'published' && !after.steps) {
        return problem(
          'A published playbook needs its steps. Unpublish it to empty them.',
          'invalid_change'
        )
      }
      const isNewContent = JSON.stringify(before) !== JSON.stringify(after)
      const isNewName =
        (name !== undefined && name !== found.name) ||
        (description !== undefined && description !== found.description)
      if (!isNewContent && !isNewName) return ok(found)

      const number = found.current.number + (isNewContent ? 1 : 0)
      touch(found, {
        name: name ?? found.name,
        description:
          description === undefined ? found.description : description,
        current: isNewContent
          ? {
              id: `${found.id}-v${number}`,
              number,
              ...after,
              createdBy: ME,
              createdAt: new Date().toISOString()
            }
          : found.current
      })
      return ok(found)
    },

    setState: (id, action, version) => {
      if (!canWrite) return NOT_ALLOWED()
      const found = find(id)
      if (!found) return NOT_FOUND()
      const isAlready = {
        publish: found.status === 'published',
        unpublish: found.status === 'draft',
        archive: found.archivedAt !== null,
        restore: found.archivedAt === null
      }[action]
      if (isAlready) return ok(found)
      if (found.version !== version) return CHANGED_SINCE()

      const now = new Date().toISOString()
      if (action === 'archive' || action === 'restore') {
        touch(found, { archivedAt: action === 'archive' ? now : null })
        return ok(found)
      }
      if (found.archivedAt) {
        return problem('Restore this playbook to change it.', 'invalid_change')
      }
      if (action === 'publish' && !found.current.steps.trim()) {
        return problem(
          'Write the steps before publishing this playbook.',
          'invalid_change'
        )
      }
      touch(
        found,
        action === 'publish'
          ? { status: 'published', publishedAt: now }
          : { status: 'draft', publishedAt: null }
      )
      return ok(found)
    }
  }
}
