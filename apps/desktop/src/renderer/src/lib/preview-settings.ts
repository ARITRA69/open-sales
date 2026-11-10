import type {
  TMember,
  TPipelineSettings,
  TSessionUser,
  TSettingsStage,
  TWorkspaceSettings
} from '@open-sales/shared'
import {
  findRepeatedName,
  lostReasonsSaveSchema,
  stagesSaveSchema
} from '@open-sales/shared'

import type {
  TApiResult,
  TOpenSalesBridge
} from '../../../preload/bridge-types'

/*
 * Pretend settings for the browser preview (`?preview=signed-in#/settings`):
 * a workspace, the pipeline's stages with deals in them, lost reasons, and
 * the team from preview-bridge.ts. It keeps changes in memory and refuses
 * what the server refuses: an old revision, a stage removed with nowhere
 * for its deals, the last admin stepping down.
 */

const PREVIEW_USER: TSessionUser = {
  id: 'preview',
  name: 'Asha Menon',
  email: 'asha@example.com',
  role: 'admin'
}

/* The team lives in preview-bridge.ts; it shares it here so a role changed
   in Settings shows in its list. */
type TSharedMembers = {
  read: () => TMember[]
  write: (next: TMember[]) => void
}
let sharedMembers: TSharedMembers | null = null

export const sharePreviewMembers = (
  read: TSharedMembers['read'],
  write: TSharedMembers['write']
) => {
  sharedMembers = { read, write }
}

const stage = (
  id: string,
  name: string,
  position: number,
  kind: TSettingsStage['kind'],
  winProbability: number,
  stalledAfterDays: number | null,
  dealCount: number,
  goal: string | null = null,
  exitCriteria: string | null = null
): TSettingsStage => ({
  id,
  name,
  position,
  kind,
  winProbability,
  stalledAfterDays,
  goal,
  exitCriteria,
  dealCount
})

const PIPELINE: TPipelineSettings = {
  id: 'sales',
  name: 'Sales',
  revision: '1',
  stages: [
    stage(
      'qualified',
      'Qualified',
      0,
      'open',
      10,
      14,
      3,
      'Confirm they have the problem we solve and someone who can buy.',
      'A call is booked with someone who can decide or sponsor.'
    ),
    stage(
      'discovery',
      'Discovery',
      1,
      'open',
      25,
      14,
      2,
      'Learn their needs, budget, timeline and who decides.',
      'Needs, budget and timeline are known, and they want a proposal.'
    ),
    stage(
      'proposal',
      'Proposal',
      2,
      'open',
      50,
      10,
      4,
      'Send a proposal that fits what they told us.',
      'Pricing is sent and they have responded to it.'
    ),
    stage('negotiation', 'Negotiation', 3, 'open', 75, 10, 0),
    stage('won', 'Won', 4, 'won', 100, null, 6),
    stage('lost', 'Lost', 5, 'lost', 0, null, 2)
  ],
  lostReasons: [
    { id: 'price', label: 'Price', archivedAt: null },
    { id: 'competitor', label: 'Chose a competitor', archivedAt: null },
    { id: 'budget', label: 'No budget', archivedAt: null },
    { id: 'timing', label: 'Bad timing', archivedAt: null },
    { id: 'other', label: 'Other', archivedAt: null },
    {
      id: 'no-decision',
      label: 'No decision',
      archivedAt: '2026-10-02T09:00:00.000Z'
    }
  ]
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 300))

const done = async <TData>(data: TData): Promise<TApiResult<TData>> => {
  await pause()
  return { ok: true, data: structuredClone(data) }
}

const refuse = async (
  message: string,
  code = 'invalid_change'
): Promise<TApiResult<never>> => {
  await pause()
  return { ok: false, message, code }
}

const CHANGED_SINCE =
  'Someone changed this while you were editing. Your change wasn’t saved; look again and redo it.'

/** The pretend settings bridge, or null outside the preview. */
export const createPreviewSettings = (
  search: string
): TOpenSalesBridge['settings'] | null => {
  if (!new URLSearchParams(search).has('preview')) return null

  let workspace: TWorkspaceSettings = {
    name: 'Halden Capital',
    currency: 'USD',
    timeZone: 'Europe/London'
  }
  let me = PREVIEW_USER
  let pipeline = structuredClone(PIPELINE)
  let nextId = 1
  const bump = () => {
    pipeline = { ...pipeline, revision: String(Number(pipeline.revision) + 1) }
  }

  return {
    getWorkspace: () => done(workspace),
    updateWorkspace: (changes) => {
      workspace = { ...workspace, ...changes }
      return done(workspace)
    },
    updateMe: ({ name }) => {
      me = { ...me, name: name.trim() }
      return done(me)
    },
    getPipeline: () => done(pipeline),

    saveStages: (input) => {
      const parsed = stagesSaveSchema.safeParse(input)
      if (!parsed.success) return refuse(parsed.error.issues[0].message)
      const data = parsed.data
      if (data.revision !== pipeline.revision) {
        return refuse(CHANGED_SINCE, 'changed_since')
      }
      const closed = pipeline.stages.filter((s) => s.kind !== 'open')
      const wonName = data.wonName ?? closed[0].name
      const lostName = data.lostName ?? closed[1].name
      const repeated = findRepeatedName([
        ...data.stages.map((s) => s.name),
        wonName,
        lostName
      ])
      if (repeated) {
        return refuse(
          `Two stages are called “${repeated}”. Give each its own name.`
        )
      }
      const open: TSettingsStage[] = data.stages.map((wanted, position) => ({
        ...wanted,
        id: wanted.id ?? `new-stage-${nextId++}`,
        position,
        kind: 'open',
        dealCount:
          pipeline.stages.find((s) => s.id === wanted.id)?.dealCount ?? 0
      }))
      for (const { id, moveDealsTo } of data.removed) {
        const leaving = pipeline.stages.find((s) => s.id === id)
        if (!leaving?.dealCount) continue
        const target = open.find((s) => s.id === moveDealsTo)
        if (!target) {
          return refuse(
            `Choose where the deals in “${leaving.name}” should move.`
          )
        }
        target.dealCount += leaving.dealCount
      }
      pipeline = {
        ...pipeline,
        stages: [
          ...open,
          { ...closed[0], name: wonName, position: open.length },
          { ...closed[1], name: lostName, position: open.length + 1 }
        ]
      }
      bump()
      return done(pipeline)
    },

    saveLostReasons: (input) => {
      const parsed = lostReasonsSaveSchema.safeParse(input)
      if (!parsed.success) return refuse(parsed.error.issues[0].message)
      const data = parsed.data
      if (data.revision !== pipeline.revision) {
        return refuse(CHANGED_SINCE, 'changed_since')
      }
      const repeated = findRepeatedName(data.reasons.map((r) => r.label))
      if (repeated) {
        return refuse(
          `“${repeated}” is on the list twice. Give each reason its own name.`
        )
      }
      const listed = data.reasons.map((reason) => ({
        id: reason.id ?? `new-reason-${nextId++}`,
        label: reason.label,
        archivedAt: null
      }))
      const archived = pipeline.lostReasons
        .filter((reason) => !listed.some((kept) => kept.id === reason.id))
        .map((reason) => ({
          ...reason,
          archivedAt: reason.archivedAt ?? new Date().toISOString()
        }))
      pipeline = { ...pipeline, lostReasons: [...listed, ...archived] }
      bump()
      return done(pipeline)
    },

    updateMember: (memberId, changes) => {
      const members = sharedMembers?.read() ?? []
      const found = members.find((member) => member.id === memberId)
      if (!found) {
        return refuse('That person doesn’t exist, or was deleted.', 'not_found')
      }
      if (changes.status === 'deactivated' && found.id === me.id) {
        return refuse(
          'You can’t deactivate your own account. Ask another admin.'
        )
      }
      const after: TMember = { ...found, ...changes }
      const isActiveAdmin = (member: TMember) =>
        member.role === 'admin' && member.status === 'active'
      const othersWhoAre = members.filter(
        (member) => member.id !== found.id && isActiveAdmin(member)
      )
      if (
        isActiveAdmin(found) &&
        !isActiveAdmin(after) &&
        othersWhoAre.length === 0
      ) {
        return refuse(
          'The workspace needs at least one admin. Make someone else an admin first.'
        )
      }
      sharedMembers?.write(
        members.map((member) => (member.id === found.id ? after : member))
      )
      return done(after)
    }
  }
}
