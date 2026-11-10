import type { TPlaybook } from '@open-sales/shared'
import { vi } from 'vitest'

import type { TPlaybooksBridge } from './playbooks-bridge'

/** A playbook as the server returns it, for tests. */
export const makePlaybook = (changes: Partial<TPlaybook> = {}): TPlaybook => ({
  id: 'p1',
  name: 'Follow-up after a demo',
  description: 'Recap the demo and set the next step.',
  author: { id: 'u1', name: 'Mo Rahman' },
  status: 'draft',
  publishedAt: null,
  current: {
    id: 'p1-v1',
    number: 1,
    steps: 'Read the demo notes. Draft a recap for the {Plan} plan.',
    blanks: [
      {
        name: 'Plan',
        question: 'Which plan did they pick?',
        options: ['Starter', 'Team']
      }
    ],
    allowedChanges: ['fields', 'email_drafts'],
    createdBy: { id: 'u1', name: 'Mo Rahman' },
    createdAt: '2026-11-09T10:00:00.000Z'
  },
  version: 1,
  createdAt: '2026-11-09T10:00:00.000Z',
  updatedAt: '2026-11-09T10:00:00.000Z',
  archivedAt: null,
  canEdit: true,
  ...changes
})

const answer = async <TData>(data: TData) => ({ ok: true as const, data })

/** A bridge whose calls all work, handing back `saved`; override what matters. */
export const makeBridge = (
  saved: TPlaybook = makePlaybook(),
  overrides: Partial<TPlaybooksBridge> = {}
): TPlaybooksBridge => ({
  list: vi.fn(() => answer({ items: [saved], nextCursor: null })),
  get: vi.fn(() => answer(saved)),
  create: vi.fn(() => answer(saved)),
  update: vi.fn(() => answer({ ...saved, version: saved.version + 1 })),
  setState: vi.fn((_id, action) =>
    answer({
      ...saved,
      version: saved.version + 2,
      status: action === 'publish' ? ('published' as const) : saved.status,
      archivedAt: action === 'archive' ? '2026-11-10T10:00:00.000Z' : null
    })
  ),
  ...overrides
})
