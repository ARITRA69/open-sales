import type {
  TCompany,
  TDeal,
  TOwner,
  TPerson,
  TPipeline,
  TStage
} from '@open-sales/shared'

import type {
  TApiResult,
  TOpenSalesBridge,
  TRecordKind
} from '../../../preload/bridge-types'

/*
 * Pretend companies, people and deals for the browser preview
 * (`?preview=signed-in#/pipeline`). It keeps changes in memory, checks
 * versions like the server, and treats the preview person as an admin.
 */

const USERS: TOwner[] = [
  { id: 'preview', name: 'Asha Menon' },
  { id: 'dan', name: 'Dan Okafor' },
  { id: 'lena', name: 'Lena Ortiz' }
]

const stage = (
  id: string,
  name: string,
  position: number,
  kind: TStage['kind'],
  winProbability: number,
  stalledAfterDays: number | null
): TStage => ({
  id,
  name,
  position,
  kind,
  winProbability,
  stalledAfterDays,
  goal: null,
  exitCriteria: null
})

const PIPELINE: TPipeline = {
  id: 'sales',
  name: 'Sales',
  currency: 'USD',
  stages: [
    stage('qualified', 'Qualified', 0, 'open', 10, 14),
    stage('discovery', 'Discovery', 1, 'open', 25, 14),
    stage('proposal', 'Proposal', 2, 'open', 50, 10),
    stage('negotiation', 'Negotiation', 3, 'open', 75, 10),
    stage('won', 'Won', 4, 'won', 100, null),
    stage('lost', 'Lost', 5, 'lost', 0, null)
  ],
  lostReasons: [
    { id: 'price', label: 'Price' },
    { id: 'competitor', label: 'Chose a competitor' },
    { id: 'timing', label: 'Bad timing' }
  ]
}

const daysAgo = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

const base = (id: string, days: number) => ({
  id,
  version: 1,
  customFields: {},
  source: 'manual',
  lastActivityAt: daysAgo(Math.max(0, days - 2)),
  createdAt: daysAgo(days),
  updatedAt: daysAgo(days),
  archivedAt: null,
  canEdit: true
})

const ownerOf = (id: string) => USERS.find((user) => user.id === id) ?? USERS[0]

const company = (
  id: string,
  name: string,
  domain: string,
  industry: string,
  ownerId: string,
  days: number
): TCompany => ({
  ...base(id, days),
  name,
  domain,
  industry,
  description: null,
  owner: ownerOf(ownerId)
})

const COMPANIES: TCompany[] = [
  company(
    'halden',
    'Halden Capital',
    'halden.com',
    'Financial services',
    'preview',
    40
  ),
  company('lumen', 'Lumen Retail', 'lumenretail.com', 'Retail', 'dan', 32),
  company(
    'northwind',
    'Northwind Freight',
    'northwind.io',
    'Logistics',
    'lena',
    21
  ),
  company(
    'orbit',
    'Orbit Health',
    'orbithealth.co',
    'Healthcare',
    'preview',
    12
  ),
  company(
    'pinecrest',
    'Pinecrest Schools',
    'pinecrest.edu',
    'Education',
    'dan',
    6
  )
]

const person = (
  id: string,
  name: string,
  title: string,
  companyId: string,
  days: number
): TPerson => {
  const at = COMPANIES.find((c) => c.id === companyId) ?? COMPANIES[0]
  return {
    ...base(id, days),
    name,
    title,
    email: `${name.split(' ')[0].toLowerCase()}@${at.domain}`,
    phone: null,
    linkedinUrl: null,
    company: { id: at.id, name: at.name }
  }
}

const PEOPLE: TPerson[] = [
  {
    ...person('priya', 'Priya Nair', 'Head of Operations', 'halden', 38),
    phone: '+442079460000'
  },
  {
    ...person('tom', 'Tom Becker', 'CFO', 'halden', 30),
    phone: '+14155550132'
  },
  person('mei', 'Mei Lin', 'VP Merchandising', 'lumen', 25),
  person('sam', 'Sam Adeyemi', 'Fleet Director', 'northwind', 18),
  person('rosa', 'Rosa Diaz', 'IT Lead', 'orbit', 9)
]

const deal = (
  id: string,
  name: string,
  companyId: string,
  stageId: string,
  valueMinor: number | null,
  days: number
): TDeal => {
  const at = COMPANIES.find((c) => c.id === companyId) ?? COMPANIES[0]
  return {
    ...base(id, days),
    name,
    company: { id: at.id, name: at.name },
    owner: at.owner,
    pipelineId: PIPELINE.id,
    stageId,
    status: 'open',
    valueMinor,
    currency: 'USD',
    closeDate: null,
    nextStep: null,
    stageEnteredAt: daysAgo(days),
    closedAt: null,
    lostReasonId: null,
    lostNote: null
  }
}

const DEALS: TDeal[] = [
  deal('d1', 'Platform rollout', 'halden', 'proposal', 4_800_000, 16),
  deal('d2', 'Analytics add-on', 'halden', 'qualified', 1_200_000, 3),
  deal('d3', 'Store pilot', 'lumen', 'discovery', 2_500_000, 8),
  deal('d4', 'Fleet tracking', 'northwind', 'negotiation', 9_000_000, 5),
  deal('d5', 'Clinic scheduling', 'orbit', 'qualified', null, 20),
  deal('d6', 'District licence', 'pinecrest', 'discovery', 1_800_000, 2)
]

const pause = () => new Promise((resolve) => setTimeout(resolve, 300))

const ok = async <TData>(data: TData): Promise<TApiResult<TData>> => {
  await pause()
  return { ok: true, data: structuredClone(data) }
}

const problem = async (
  message: string,
  code?: string
): Promise<{ ok: false; message: string; code?: string }> => {
  await pause()
  return { ok: false, message, code }
}

type TAnyRecord = TCompany | TPerson | TDeal

/** The pretend records bridge, or null outside the preview. */
export const createPreviewRecords = (
  search: string
): TOpenSalesBridge['records'] | null => {
  if (!new URLSearchParams(search).has('preview')) return null

  const store: Record<TRecordKind, TAnyRecord[]> = {
    companies: structuredClone(COMPANIES),
    people: structuredClone(PEOPLE),
    deals: structuredClone(DEALS)
  }

  const touch = <TRecord extends TAnyRecord>(
    record: TRecord,
    changes: Partial<TRecord>
  ) =>
    Object.assign(record, changes, {
      version: record.version + 1,
      updatedAt: new Date().toISOString()
    })

  const findIn = (kind: TRecordKind, id: string) =>
    store[kind].find((record) => record.id === id)

  /** What a create or update says, turned into record fields. */
  const fieldsFrom = (
    kind: TRecordKind,
    input: Record<string, unknown>,
    existing?: TAnyRecord
  ): Partial<TAnyRecord> => {
    const { companyId, ownerId, stageId, version: _version, ...rest } = input
    const fields: Record<string, unknown> = { ...rest }
    for (const [key, value] of Object.entries(fields)) {
      if (value === '') fields[key] = null
    }
    if (typeof companyId === 'string') {
      const at = findIn('companies', companyId) as TCompany | undefined
      if (at) fields.company = { id: at.id, name: at.name }
      if (at && kind === 'deals' && !ownerId && !existing)
        fields.owner = at.owner
    }
    if (typeof ownerId === 'string') fields.owner = ownerOf(ownerId)
    if (typeof stageId === 'string' && kind === 'deals') {
      const target = PIPELINE.stages.find((s) => s.id === stageId)
      const before = existing as TDeal | undefined
      if (target && target.id !== before?.stageId) {
        fields.stageId = target.id
        fields.status = target.kind
        fields.stageEnteredAt = new Date().toISOString()
        fields.closedAt =
          target.kind === 'open' ? null : new Date().toISOString()
        if (target.kind !== 'lost') {
          fields.lostReasonId = null
          fields.lostNote = null
        }
      }
    }
    return fields as Partial<TAnyRecord>
  }

  const records: TOpenSalesBridge['records'] = {
    list: (kind, query = {}) => {
      const q = query.q?.toLowerCase() ?? ''
      const archived = query.archived === 'true'
      const items = store[kind]
        .filter((record) => Boolean(record.archivedAt) === archived)
        .filter((record) => {
          if (query.owner !== 'me') return true
          const owner =
            'owner' in record
              ? record.owner.id
              : (findIn('companies', record.company.id) as TCompany).owner.id
          return owner === 'preview'
        })
        .filter((record) => {
          if (!q) return true
          const email = 'email' in record ? (record.email ?? '') : ''
          return `${record.name} ${email}`.toLowerCase().includes(q)
        })
        .sort((a, b) => a.name.localeCompare(b.name))
      return ok({ items, nextCursor: null }) as never
    },

    get: (kind, id) => {
      const found = findIn(kind, id)
      return (
        found ? ok(found) : problem('That record doesn’t exist.', 'not_found')
      ) as never
    },

    create: (kind, input) => {
      const now = new Date().toISOString()
      const fields = fieldsFrom(kind, input as Record<string, unknown>)
      const first = PIPELINE.stages[0]
      const record = {
        ...base(`new-${Math.random().toString(36).slice(2, 8)}`, 0),
        lastActivityAt: null,
        createdAt: now,
        updatedAt: now,
        ...(kind === 'companies'
          ? { domain: null, industry: null, description: null, owner: USERS[0] }
          : {}),
        ...(kind === 'people'
          ? { title: null, email: null, phone: null, linkedinUrl: null }
          : {}),
        ...(kind === 'deals'
          ? {
              pipelineId: PIPELINE.id,
              stageId: first.id,
              status: 'open',
              currency: PIPELINE.currency,
              valueMinor: null,
              closeDate: null,
              nextStep: null,
              stageEnteredAt: now,
              closedAt: null,
              lostReasonId: null,
              lostNote: null
            }
          : {}),
        ...fields
      } as TAnyRecord
      store[kind].push(record)
      return ok(record) as never
    },

    update: (kind, id, input) => {
      const found = findIn(kind, id)
      if (!found)
        return problem('That record doesn’t exist.', 'not_found') as never
      if (found.version !== input.version) {
        return problem(
          'Someone changed this while you were editing. Your change wasn’t saved; look again and redo it.',
          'changed_since'
        ) as never
      }
      touch(found, fieldsFrom(kind, input as Record<string, unknown>, found))
      return ok(found) as never
    },

    setArchived: (kind, id, action, version) => {
      const found = findIn(kind, id)
      if (!found)
        return problem('That record doesn’t exist.', 'not_found') as never
      if (found.version !== version) {
        return problem('Someone changed this first.', 'changed_since') as never
      }
      touch(found, {
        archivedAt: action === 'archive' ? new Date().toISOString() : null
      })
      return ok(found) as never
    },

    getPipeline: () => ok(PIPELINE),

    getBoard: () => {
      const open = (store.deals as TDeal[]).filter(
        (d) => d.status === 'open' && !d.archivedAt
      )
      return ok({
        columns: PIPELINE.stages
          .filter((s) => s.kind === 'open')
          .map((s) => {
            const inStage = open.filter((d) => d.stageId === s.id)
            return {
              stageId: s.id,
              count: inStage.length,
              valueMinor: inStage.reduce(
                (sum, d) => sum + (d.valueMinor ?? 0),
                0
              ),
              deals: inStage
            }
          })
      })
    },

    listUsers: () => ok(USERS)
  }

  return records
}
