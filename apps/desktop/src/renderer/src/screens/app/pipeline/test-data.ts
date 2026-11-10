import type {
  TCompany,
  TDeal,
  TOwner,
  TPerson,
  TPipeline,
  TSessionUser,
  TStage
} from '@open-sales/shared'

import type { TRecordsBridge } from '@/hooks/use-records'

import type { TApiResult } from '../../../../../preload/bridge-types'

/* Pretend people, stages and deals for this folder's tests. */

export const ASHA: TOwner = { id: 'asha', name: 'Asha Menon' }
export const DAN: TOwner = { id: 'dan', name: 'Dan Okafor' }

export const sessionUser = (
  owner: TOwner,
  role: TSessionUser['role']
): TSessionUser => ({
  ...owner,
  email: `${owner.id}@halden.com`,
  role
})

const stage = (
  id: string,
  name: string,
  position: number,
  kind: TStage['kind'],
  stalledAfterDays: number | null
): TStage => ({
  id,
  name,
  position,
  kind,
  winProbability: 50,
  stalledAfterDays,
  goal: null,
  exitCriteria: null
})

export const PIPELINE: TPipeline = {
  id: 'sales',
  name: 'Sales',
  currency: 'USD',
  stages: [
    stage('qualified', 'Qualified', 0, 'open', 14),
    stage('proposal', 'Proposal', 1, 'open', 10),
    stage('won', 'Won', 2, 'won', null),
    stage('lost', 'Lost', 3, 'lost', null)
  ],
  lostReasons: [
    { id: 'price', label: 'Price' },
    { id: 'timing', label: 'Bad timing' }
  ]
}

const DAY_MS = 24 * 60 * 60 * 1000

export const daysAgo = (days: number) =>
  new Date(Date.now() - days * DAY_MS).toISOString()

export const makeDeal = (fields: Partial<TDeal> & { id: string }): TDeal => ({
  name: `Deal ${fields.id}`,
  company: { id: 'halden', name: 'Halden Capital' },
  owner: ASHA,
  pipelineId: PIPELINE.id,
  stageId: 'qualified',
  status: 'open',
  valueMinor: 1_000_000,
  currency: 'USD',
  closeDate: null,
  nextStep: null,
  stageEnteredAt: daysAgo(1),
  closedAt: null,
  lostReasonId: null,
  lostNote: null,
  version: 1,
  customFields: {},
  source: 'manual',
  lastActivityAt: null,
  createdAt: daysAgo(30),
  updatedAt: daysAgo(1),
  archivedAt: null,
  canEdit: true,
  ...fields
})

const record = (id: string) => ({
  id,
  version: 1,
  customFields: {},
  source: 'manual',
  lastActivityAt: null,
  createdAt: daysAgo(30),
  updatedAt: daysAgo(1),
  archivedAt: null,
  canEdit: true
})

export const HALDEN: TCompany = {
  ...record('halden'),
  name: 'Halden Capital',
  domain: 'halden.com',
  industry: null,
  description: null,
  owner: ASHA
}

export const LUMEN: TCompany = {
  ...record('lumen'),
  name: 'Lumen Retail',
  domain: 'lumenretail.com',
  industry: null,
  description: null,
  owner: DAN
}

const person = (id: string, name: string, at: TCompany): TPerson => ({
  ...record(id),
  name,
  title: null,
  email: null,
  phone: null,
  linkedinUrl: null,
  company: { id: at.id, name: at.name }
})

export const PEOPLE: TPerson[] = [
  person('priya', 'Priya Nair', HALDEN),
  person('tom', 'Tom Becker', HALDEN),
  person('mei', 'Mei Lin', LUMEN)
]

const ok = async <TData>(data: TData): Promise<TApiResult<TData>> => ({
  ok: true,
  data
})

/**
 * A records bridge over a list of deals kept in memory. Updates apply like
 * the server's: the stage sets the status and the version moves on.
 */
export const makeBridge = (deals: TDeal[], users: TOwner[] = [ASHA, DAN]) => {
  const store = deals.map((deal) => ({ ...deal }))
  const calls: { update: unknown[][]; create: unknown[][] } = {
    update: [],
    create: []
  }

  const bridge = {
    list: async (kind: string) =>
      ok({
        items:
          kind === 'companies'
            ? [HALDEN, LUMEN]
            : kind === 'people'
              ? PEOPLE
              : store,
        nextCursor: null
      }),
    get: async (_kind: string, id: string) =>
      ok(store.find((deal) => deal.id === id)),
    create: async (kind: string, input: Record<string, unknown>) => {
      calls.create.push([kind, input])
      const created = makeDeal({
        id: `new-${store.length}`,
        name: String(input.name),
        stageId: String(input.stageId ?? 'qualified'),
        valueMinor: (input.valueMinor as number | null) ?? null
      })
      store.push(created)
      return ok(created)
    },
    update: async (
      kind: string,
      id: string,
      input: Record<string, unknown>
    ) => {
      calls.update.push([kind, id, input])
      const found = store.find((deal) => deal.id === id)
      if (!found) return { ok: false, message: 'Not there.', code: 'not_found' }
      const { version: _version, ...changes } = input
      const target = PIPELINE.stages.find((s) => s.id === changes.stageId)
      Object.assign(found, changes, {
        version: found.version + 1,
        ...(target ? { status: target.kind } : {})
      })
      return ok({ ...found })
    },
    setArchived: async () => ({ ok: false, message: 'Not in this test.' }),
    getPipeline: async () => ok(PIPELINE),
    getBoard: async () =>
      ok({
        columns: PIPELINE.stages
          .filter((s) => s.kind === 'open')
          .map((s) => {
            const inStage = store.filter(
              (deal) => deal.status === 'open' && deal.stageId === s.id
            )
            return {
              stageId: s.id,
              count: inStage.length,
              valueMinor: 0,
              deals: inStage.map((deal) => ({ ...deal }))
            }
          })
      }),
    listUsers: async () => ok(users)
  } as unknown as TRecordsBridge

  return { bridge, calls, store }
}
