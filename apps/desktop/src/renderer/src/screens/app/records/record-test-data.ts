import type {
  TActivity,
  TCompany,
  TDeal,
  TPerson,
  TPipeline,
  TTask,
  TTimelineItem
} from '@open-sales/shared'
import { vi } from 'vitest'

import type { TRecordsBridge } from '@/hooks/use-records'

import type { TTimelineBridge } from './timeline-bridge'

/* Pretend records and bridges for the record pages' tests. */

export const ASHA = { id: 'u-asha', name: 'Asha Menon' }
export const DAN = { id: 'u-dan', name: 'Dan Okafor' }

const base = {
  version: 3,
  customFields: {},
  source: 'manual',
  lastActivityAt: null,
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-01T09:00:00.000Z',
  archivedAt: null,
  canEdit: true
}

export const company = (fields: Partial<TCompany> = {}): TCompany => ({
  ...base,
  id: 'c1',
  name: 'Halden Capital',
  domain: 'halden.com',
  industry: 'Financial services',
  description: null,
  owner: DAN,
  ...fields
})

export const person = (fields: Partial<TPerson> = {}): TPerson => ({
  ...base,
  id: 'p1',
  name: 'Priya Nair',
  title: 'Head of Operations',
  email: 'priya@halden.com',
  phone: null,
  linkedinUrl: null,
  company: { id: 'c1', name: 'Halden Capital' },
  ...fields
})

export const deal = (fields: Partial<TDeal> = {}): TDeal => ({
  ...base,
  id: 'd1',
  name: 'Platform rollout',
  company: { id: 'c1', name: 'Halden Capital' },
  owner: DAN,
  pipelineId: 'sales',
  stageId: 'proposal',
  status: 'open',
  valueMinor: 4_800_000,
  currency: 'USD',
  closeDate: '2026-12-15',
  nextStep: 'Send pricing',
  stageEnteredAt: '2026-11-01T09:00:00.000Z',
  closedAt: null,
  lostReasonId: null,
  lostNote: null,
  ...fields
})

export const PIPELINE: TPipeline = {
  id: 'sales',
  name: 'Sales',
  currency: 'USD',
  stages: [
    {
      id: 'qualified',
      name: 'Qualified',
      position: 0,
      kind: 'open',
      winProbability: 10,
      stalledAfterDays: 14,
      goal: null,
      exitCriteria: null
    },
    {
      id: 'proposal',
      name: 'Proposal',
      position: 1,
      kind: 'open',
      winProbability: 50,
      stalledAfterDays: 10,
      goal: null,
      exitCriteria: null
    }
  ],
  lostReasons: []
}

export const task = (fields: Partial<TTask> = {}): TTask => ({
  id: 't1',
  title: 'Send pricing to Tom',
  notes: null,
  dueOn: '2026-11-20',
  assignee: ASHA,
  createdBy: ASHA,
  company: { id: 'c1', name: 'Halden Capital' },
  deal: null,
  person: null,
  completedAt: null,
  source: 'manual',
  version: 2,
  createdAt: '2026-11-08T09:00:00.000Z',
  updatedAt: '2026-11-08T09:00:00.000Z',
  archivedAt: null,
  canEdit: true,
  ...fields
})

export const activity = (fields: Partial<TActivity> = {}): TActivity => ({
  id: 'a1',
  type: 'note',
  occurredAt: '2026-11-05T10:00:00.000Z',
  endsAt: null,
  company: { id: 'c1', name: 'Halden Capital' },
  deal: null,
  author: ASHA,
  source: 'manual',
  title: null,
  body: 'They renew in January.',
  outcome: null,
  people: [],
  createdAt: '2026-11-05T10:00:00.000Z',
  updatedAt: '2026-11-05T10:00:00.000Z',
  archivedAt: null,
  canEdit: true,
  ...fields
})

/** A timeline as the server sends it: what's upcoming, then history. */
export const ITEMS: TTimelineItem[] = [
  { kind: 'task', id: 't1', at: '2026-11-20', upcoming: true, task: task() },
  {
    kind: 'activity',
    id: 'a2',
    at: '2026-11-09T15:00:00.000Z',
    upcoming: false,
    activity: activity({
      id: 'a2',
      type: 'call',
      occurredAt: '2026-11-09T15:00:00.000Z',
      outcome: 'voicemail',
      people: [{ id: 'p1', name: 'Priya Nair' }],
      body: 'Asked her to call back.'
    })
  },
  {
    kind: 'activity',
    id: 'a1',
    at: '2026-11-05T10:00:00.000Z',
    upcoming: false,
    activity: activity()
  },
  {
    kind: 'stage',
    id: '7',
    at: '2026-11-01T09:00:00.000Z',
    upcoming: false,
    actor: DAN,
    deal: { id: 'd1', name: 'Platform rollout' },
    from: { id: 'qualified', name: 'Qualified' },
    to: { id: 'proposal', name: 'Proposal' }
  },
  {
    kind: 'change',
    id: '4',
    at: '2026-10-20T09:00:00.000Z',
    upcoming: false,
    actor: ASHA,
    via: 'app',
    action: 'update',
    changes: [{ field: 'ownerId', from: 'Asha Menon', to: 'Dan Okafor' }]
  }
]

const ok = async <TData>(data: TData) => ({ ok: true as const, data })

type TRecordsData = {
  company?: TCompany
  person?: TPerson
  deal?: TDeal
  deals?: TDeal[]
}

/** A records bridge that answers with these records, whatever the id. */
export const makeRecords = ({
  company: ofCompany = company(),
  person: ofPerson = person(),
  deal: ofDeal = deal(),
  deals = [ofDeal]
}: TRecordsData = {}): TRecordsBridge => {
  const byKind = { companies: ofCompany, people: ofPerson, deals: ofDeal }
  return {
    list: vi.fn((kind: keyof typeof byKind) =>
      ok({ items: kind === 'deals' ? deals : [byKind[kind]], nextCursor: null })
    ),
    get: vi.fn((kind: keyof typeof byKind) => ok(byKind[kind])),
    create: vi.fn((kind: keyof typeof byKind) => ok(byKind[kind])),
    update: vi.fn((kind: keyof typeof byKind) => ok(byKind[kind])),
    setArchived: vi.fn((kind: keyof typeof byKind) => ok(byKind[kind])),
    getPipeline: vi.fn(() => ok(PIPELINE)),
    getBoard: vi.fn(() => ok({ columns: [] })),
    listUsers: vi.fn(() => ok([ASHA, DAN]))
  } as unknown as TRecordsBridge
}

/** A timeline bridge that serves `items` and says yes to everything. */
export const makeTimeline = (
  items: TTimelineItem[] = ITEMS,
  people: TPerson[] = [person()]
): TTimelineBridge => ({
  read: vi.fn(() => ok({ items, nextCursor: null })),
  createActivity: vi.fn(() => ok(activity())),
  updateActivity: vi.fn(() => ok(activity())),
  archiveActivity: vi.fn(() => ok(activity())),
  listTasks: vi.fn(() => ok({ items: [task()], nextCursor: null })),
  createTask: vi.fn(() => ok(task())),
  updateTask: vi.fn(() => ok(task())),
  setTaskDone: vi.fn(() => ok(task())),
  archiveTask: vi.fn(() => ok(task())),
  listPeople: vi.fn(() => ok(people))
})
