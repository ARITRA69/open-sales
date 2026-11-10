import type {
  TOwner,
  TProposal,
  TProposalChange,
  TProposalCreate,
  TProposalValue
} from '@open-sales/shared'
import { isWaitingProposal, PROPOSAL_UNDO_MS } from '@open-sales/shared'

import type {
  TOpenSalesBridge,
  TProposalResult,
  TRecordKind
} from '../../../preload/bridge-types'

/*
 * Pretend proposals for the browser preview (`?preview=signed-in#/today`).
 * Approving one changes the pretend records behind Accounts, People and
 * Pipeline, so a deal edited there first shows "Changed since" here, as the
 * server would.
 */

type TRecordsBridge = TOpenSalesBridge['records']
type TProposalsBridge = TOpenSalesBridge['proposals']

const ME: TOwner = { id: 'preview', name: 'Asha Menon' }
const DAN: TOwner = { id: 'dan', name: 'Dan Okafor' }

const KINDS = {
  company: 'companies',
  person: 'people',
  deal: 'deals'
} as const satisfies Record<string, TRecordKind>

type TStored = {
  id: string
  kind: TProposal['kind']
  status: TProposal['status']
  targetType: keyof typeof KINDS
  targetId: string | null
  baseVersion: number | null
  changes: { field: string; from: TProposalValue; to: TProposalValue }[]
  title: string
  why: string | null
  sources: TProposal['sources']
  requestedBy: TOwner
  approver: TOwner
  engine: TProposal['engine']
  decidedBy: TOwner | null
  decidedAt: string | null
  declineReason: string | null
  undoUntil: string | null
  createdAt: string
  // Pretends the record changed hands, so the server refuses the approval.
  refuses?: boolean
}

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60 * 1000).toISOString()

const seed = (
  id: string,
  minutes: number,
  fields: Pick<TStored, 'kind' | 'targetType' | 'targetId' | 'title' | 'why'> &
    Partial<TStored>
): TStored => ({
  id,
  status: 'pending',
  baseVersion: fields.targetId ? 1 : null,
  changes: [],
  sources: [],
  requestedBy: ME,
  approver: ME,
  engine: 'claude-code',
  decidedBy: null,
  decidedAt: null,
  declineReason: null,
  undoUntil: null,
  createdAt: minutesAgo(minutes),
  ...fields
})

const SEEDS: TStored[] = [
  seed('p1', 12, {
    kind: 'update',
    targetType: 'deal',
    targetId: 'd2',
    title: 'Move Analytics add-on to Proposal',
    why: 'Tom asked for pricing for 25 seats by Friday.',
    changes: [
      { field: 'stageId', from: 'qualified', to: 'proposal' },
      { field: 'valueMinor', from: 1_200_000, to: 1_500_000 },
      { field: 'nextStep', from: null, to: 'Send pricing by Friday' }
    ],
    sources: [{ type: 'email', id: 'm-tom-1', label: 'Email from Tom Becker' }]
  }),
  seed('p2', 48, {
    kind: 'create',
    targetType: 'person',
    targetId: null,
    title: 'Add Maya Chen to Orbit Health',
    why: 'She joined Rosa’s thread about scheduling and signs as Head of Clinical Systems.',
    changes: [
      { field: 'companyId', from: null, to: 'orbit' },
      { field: 'name', from: null, to: 'Maya Chen' },
      { field: 'title', from: null, to: 'Head of Clinical Systems' },
      { field: 'email', from: null, to: 'maya@orbithealth.co' }
    ]
  }),
  seed('p3', 95, {
    kind: 'update',
    targetType: 'deal',
    targetId: 'd1',
    // Made against an older version: the deal has moved since.
    baseVersion: 0,
    title: 'Move Platform rollout to Negotiation',
    why: 'Priya sent back the signed security review.',
    changes: [{ field: 'stageId', from: 'discovery', to: 'negotiation' }]
  }),
  seed('p4', 130, {
    kind: 'update',
    targetType: 'deal',
    targetId: 'd5',
    title: 'Set the value of Clinic scheduling',
    why: 'Rosa confirmed 12 clinics at $3,000 each.',
    changes: [{ field: 'valueMinor', from: null, to: 3_600_000 }],
    requestedBy: DAN,
    engine: 'codex'
  }),
  seed('p5', 200, {
    kind: 'update',
    targetType: 'deal',
    targetId: 'd3',
    title: 'Set a close date for Store pilot',
    why: 'Mei wants a decision before the January board meeting.',
    changes: [{ field: 'closeDate', from: null, to: '2027-01-15' }],
    refuses: true
  }),
  seed('p6', 260, {
    kind: 'update',
    targetType: 'company',
    targetId: 'orbit',
    title: 'Describe Orbit Health',
    why: 'From their site and Rosa’s first email.',
    changes: [
      {
        field: 'description',
        from: null,
        to: 'Runs 40 outpatient clinics across the Midwest.'
      }
    ]
  })
]

const pause = () => new Promise((resolve) => setTimeout(resolve, 300))

/** A pretend record's value for a field, as the server stores it. */
const valueOf = (
  record: Record<string, unknown>,
  field: string
): TProposalValue => {
  if (field === 'companyId') {
    const at = record.company as { id: string } | undefined
    return at?.id ?? null
  }
  return (record[field] ?? null) as TProposalValue
}

/** The pretend proposals bridge, or null outside the preview. */
export const createPreviewProposals = (
  search: string,
  records: TRecordsBridge | null
): TProposalsBridge | null => {
  if (!new URLSearchParams(search).has('preview')) return null

  let store = structuredClone(SEEDS)
  let nextId = store.length + 1

  const readTarget = async (stored: TStored) => {
    if (!records || !stored.targetId) return null
    const answer = await records.get(KINDS[stored.targetType], stored.targetId)
    return answer.ok ? (answer.data as Record<string, unknown>) : null
  }

  const describe = async (stored: TStored): Promise<TProposal> => {
    const [target, pipeline, companies] = await Promise.all([
      readTarget(stored),
      records?.getPipeline(),
      records?.list('companies', { limit: 200 })
    ])
    const names: Record<string, Map<string, string>> = {
      stageId: new Map(
        pipeline?.ok ? pipeline.data.stages.map((s) => [s.id, s.name]) : []
      ),
      lostReasonId: new Map(
        pipeline?.ok
          ? pipeline.data.lostReasons.map((r) => [r.id, r.label])
          : []
      ),
      companyId: new Map(
        companies?.ok ? companies.data.items.map((c) => [c.id, c.name]) : []
      )
    }
    const labelOf = (field: string, value: TProposalValue) =>
      typeof value === 'string' ? (names[field]?.get(value) ?? null) : null

    const version = typeof target?.version === 'number' ? target.version : null
    const status =
      stored.status === 'pending' &&
      version !== null &&
      stored.baseVersion !== null &&
      version !== stored.baseVersion
        ? 'out_of_date'
        : stored.status
    const showsCurrent =
      isWaitingProposal(status) && stored.kind === 'update' && target
    const proposed = (field: string) =>
      stored.changes.find((change) => change.field === field)?.to ?? null
    const atCompany = target?.company as { name: string } | undefined

    return {
      id: stored.id,
      kind: stored.kind,
      status,
      title: stored.title,
      why: stored.why,
      target: {
        type: stored.targetType,
        id: stored.targetId,
        name:
          typeof target?.name === 'string'
            ? target.name
            : String(proposed('name') ?? stored.title),
        companyName:
          atCompany?.name ?? labelOf('companyId', proposed('companyId')),
        currency:
          stored.targetType === 'deal'
            ? typeof target?.currency === 'string'
              ? target.currency
              : 'USD'
            : null,
        version
      },
      changes: stored.changes.map((change): TProposalChange => {
        const current = target ? valueOf(target, change.field) : null
        return {
          ...change,
          fromLabel: labelOf(change.field, change.from),
          toLabel: labelOf(change.field, change.to),
          ...(showsCurrent
            ? { current, currentLabel: labelOf(change.field, current) }
            : {})
        }
      }),
      sources: stored.sources,
      requestedBy: stored.requestedBy,
      approver: stored.approver,
      engine: stored.engine,
      decidedBy: stored.decidedBy,
      decidedAt: stored.decidedAt,
      declineReason: stored.declineReason,
      undoUntil: stored.undoUntil,
      createdAt: stored.createdAt,
      canDecide: stored.approver.id === ME.id
    }
  }

  const done = async (stored: TStored): Promise<TProposalResult> => {
    await pause()
    return { ok: true, data: await describe(stored) }
  }

  const refuse = async (
    message: string,
    code: string,
    stored?: TStored
  ): Promise<TProposalResult> => {
    await pause()
    return {
      ok: false,
      message,
      code,
      proposal: stored ? await describe(stored) : undefined
    }
  }

  const find = (id: string) => store.find((stored) => stored.id === id)
  const GONE = 'That proposal doesn’t exist, or was deleted.'

  const valuesOf = (stored: TStored, side: 'from' | 'to') =>
    Object.fromEntries(
      stored.changes.map((change) => [change.field, change[side]])
    )

  return {
    list: async (query = {}) => {
      await pause()
      const waiting = store
        .filter((stored) => isWaitingProposal(stored.status))
        .filter((stored) =>
          query.targetType && query.targetId
            ? stored.targetType === query.targetType &&
              stored.targetId === query.targetId
            : stored.approver.id === ME.id
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return {
        ok: true,
        data: {
          items: await Promise.all(waiting.map(describe)),
          nextCursor: null,
          total: waiting.length
        }
      }
    },

    create: async (input: TProposalCreate) => {
      const targetType = input.targetType as keyof typeof KINDS
      if (!(targetType in KINDS) || input.kind === 'email_draft') {
        return refuse(
          'AI can only propose changes to companies, people and deals for now.',
          'invalid_change'
        )
      }
      const stored = seed(`p${nextId++}`, 0, {
        kind: input.kind,
        targetType,
        targetId: input.targetId ?? null,
        title: input.title,
        why: input.why ?? null,
        engine: input.engine,
        sources: input.sources ?? []
      })
      const target = await readTarget(stored)
      stored.baseVersion =
        typeof target?.version === 'number' ? target.version : null
      stored.changes = (input.changes ?? []).map((change) => ({
        field: change.field,
        from: target ? valueOf(target, change.field) : null,
        to: change.to
      }))
      store = [stored, ...store]
      return done(stored)
    },

    approve: async (id, input = {}) => {
      const stored = find(id)
      if (!stored) return refuse(GONE, 'not_found')
      if (!isWaitingProposal(stored.status)) {
        return refuse('This was already decided.', 'already_decided')
      }
      if (stored.refuses) {
        return refuse(
          'Only the deal’s owner, the company’s owner, a manager or an admin can change this deal.',
          'forbidden'
        )
      }
      for (const edit of input.changes ?? []) {
        const change = stored.changes.find((c) => c.field === edit.field)
        if (change) change.to = edit.to
      }

      if (records) {
        const kind = KINDS[stored.targetType]
        const version = input.version ?? stored.baseVersion ?? 1
        const before = await readTarget(stored)
        const answer =
          stored.kind === 'create'
            ? await records.create(kind, valuesOf(stored, 'to') as never)
            : stored.kind === 'archive'
              ? await records.setArchived(
                  kind,
                  stored.targetId ?? '',
                  'archive',
                  version
                )
              : await records.update(kind, stored.targetId ?? '', {
                  ...valuesOf(stored, 'to'),
                  version
                } as never)
        if (!answer.ok) {
          if (answer.code !== 'changed_since') {
            return refuse(answer.message, answer.code ?? 'invalid_change')
          }
          stored.status = 'out_of_date'
          return refuse(
            'This changed after AI proposed it. Nothing was saved; look at what it says now.',
            'changed_since',
            stored
          )
        }
        const after = answer.data as unknown as Record<string, unknown>
        stored.targetId = String(after.id)
        stored.baseVersion = Number(after.version)
        // What was really saved, so Undo knows what to put back.
        stored.changes = stored.changes.map((change) => ({
          field: change.field,
          from: before ? valueOf(before, change.field) : null,
          to: valueOf(after, change.field)
        }))
      }

      const now = Date.now()
      stored.status = 'approved'
      stored.decidedBy = ME
      stored.decidedAt = new Date(now).toISOString()
      stored.undoUntil = new Date(now + PROPOSAL_UNDO_MS).toISOString()
      return done(stored)
    },

    decline: async (id, reason) => {
      const stored = find(id)
      if (!stored) return refuse(GONE, 'not_found')
      stored.status = 'declined'
      stored.decidedBy = ME
      stored.decidedAt = new Date().toISOString()
      stored.declineReason = reason?.trim() || null
      return done(stored)
    },

    undo: async (id) => {
      const stored = find(id)
      if (!stored) return refuse(GONE, 'not_found')
      if (!stored.undoUntil || Date.now() > Date.parse(stored.undoUntil)) {
        return refuse(
          'It’s too late to undo this here. Open the record and change it back by hand.',
          'undo_expired'
        )
      }
      const target = await readTarget(stored)
      if (records && target && stored.targetId) {
        const kind = KINDS[stored.targetType]
        const version = Number(target.version)
        const answer =
          stored.kind === 'create'
            ? await records.setArchived(
                kind,
                stored.targetId,
                'archive',
                version
              )
            : stored.kind === 'archive'
              ? await records.setArchived(
                  kind,
                  stored.targetId,
                  'restore',
                  version
                )
              : await records.update(kind, stored.targetId, {
                  ...valuesOf(stored, 'from'),
                  version
                } as never)
        if (!answer.ok) return refuse(answer.message, answer.code ?? 'error')
      }
      stored.status = 'undone'
      return done(stored)
    },

    sendToOwner: async (id) => {
      const stored = find(id)
      if (!stored) return refuse(GONE, 'not_found')
      const target = await readTarget(stored)
      stored.approver = (target?.owner as TOwner | undefined) ?? DAN
      stored.refuses = false
      return done(stored)
    }
  }
}

/** A task or promised reply that's due, as Today lists it. */
export type TTodayFollowUp = {
  id: string
  title: string
  // What it's about: "Halden Capital · Platform rollout".
  detail?: string
  // The day it's due, "2026-11-30".
  dueOn?: string
  // The record it belongs to, as a hash link.
  href?: string
}

/** A deal that's sat idle for longer than its stage allows. */
export type TTodayNudge = {
  id: string
  name: string
  companyName: string
  idleDays: number
  stageName?: string
  // Why it's stalled, in AI's words.
  reason?: string
}

const dayFromNow = (days: number) => {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Pretend follow-ups and stalled deals for the same preview. The real ones
 * come with tasks (record pages) and the idle rule (pipeline).
 */
export const createPreviewTodayItems = (
  search: string
): { followUps: TTodayFollowUp[]; nudges: TTodayNudge[] } | null => {
  if (!new URLSearchParams(search).has('preview')) return null
  return {
    followUps: [
      {
        id: 't1',
        title: 'Send pricing to Tom',
        detail: 'Halden Capital · Analytics add-on',
        dueOn: dayFromNow(-1),
        href: '#/deals/d2'
      },
      {
        id: 't2',
        title: 'Reply to Sam about the pilot fleet',
        detail: 'Northwind Freight · Fleet tracking',
        dueOn: dayFromNow(0),
        href: '#/deals/d4'
      }
    ],
    nudges: [
      {
        id: 'd1',
        name: 'Platform rollout',
        companyName: 'Halden Capital',
        idleDays: 16,
        stageName: 'Proposal',
        reason: 'No reply since the proposal went out on 25 October.'
      },
      {
        id: 'd5',
        name: 'Clinic scheduling',
        companyName: 'Orbit Health',
        idleDays: 20,
        stageName: 'Qualified',
        reason: 'Rosa asked for a demo and nobody booked one.'
      }
    ]
  }
}
