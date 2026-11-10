import type { TJoinLink, TMember } from '@open-sales/shared'

import type {
  TAiToolsStatus,
  TConnectionState,
  TOpenSalesBridge
} from '../../../preload/bridge-types'

const SERVER_URL = 'http://localhost:8787'
const PREVIEW_USER = {
  id: 'preview',
  name: 'Asha Menon',
  email: 'asha@example.com',
  role: 'admin' as const
}

const PREVIEW_STATES: Record<string, TConnectionState> = {
  'choose-server': { step: 'choose-server' },
  'server-unreachable': {
    step: 'server-unreachable',
    serverUrl: SERVER_URL,
    message: 'localhost:8787 didn’t answer. Check that the server is running.'
  },
  'create-admin': { step: 'create-admin', serverUrl: SERVER_URL },
  'sign-in': {
    step: 'sign-in',
    serverUrl: SERVER_URL,
    workspaceName: 'Halden Capital'
  },
  'signed-in': {
    step: 'signed-in',
    serverUrl: SERVER_URL,
    workspaceName: 'Halden Capital',
    user: PREVIEW_USER
  },
  join: {
    step: 'join',
    serverUrl: SERVER_URL,
    workspaceName: 'Halden Capital'
  },
  'waiting-approval': {
    step: 'waiting-approval',
    serverUrl: SERVER_URL,
    workspaceName: 'Halden Capital',
    email: 'ravi@gmail.com',
    declined: false
  }
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 400))

/**
 * A pretend server for the browser preview, where there's no Electron bridge.
 * Open the page with `?preview=sign-in` (or choose-server, create-admin,
 * server-unreachable, join, waiting-approval, signed-in) to see that screen
 * and click through.
 */
export const createPreviewBridge = (
  search: string
): TOpenSalesBridge['connection'] | null => {
  const step = new URLSearchParams(search).get('preview')
  const start = step ? PREVIEW_STATES[step] : undefined
  if (!start) return null

  const signedIn = PREVIEW_STATES['signed-in']
  const ok = async (state: TConnectionState) => {
    await pause()
    return { ok: true as const, state }
  }

  return {
    getState: async () => start,
    chooseServer: () => ok(PREVIEW_STATES['sign-in']),
    forgetServer: async () => PREVIEW_STATES['choose-server'],
    createAdmin: () => ok(signedIn),
    signIn: () => ok(signedIn),
    signOut: async () => PREVIEW_STATES['sign-in'],
    // Pretends the email isn't at the trusted domain, so they wait.
    join: () => ok(PREVIEW_STATES['waiting-approval']),
    cancelJoin: async () => PREVIEW_STATES['choose-server'],
    onStateChange: () => () => undefined
  }
}

const CLAUDE = { id: 'claude-code' as const, name: 'Claude Code' }
const CODEX = { id: 'codex' as const, name: 'Codex' }

const PREVIEW_AI_TOOLS: Record<string, TAiToolsStatus> = {
  // The default: Claude Code ready, Codex not installed.
  one: {
    tools: [
      { ...CLAUDE, state: 'ready', version: '2.1.311 (Claude Code)' },
      { ...CODEX, state: 'not-installed' }
    ]
  },
  both: {
    tools: [
      { ...CLAUDE, state: 'ready', version: '2.1.311 (Claude Code)' },
      { ...CODEX, state: 'ready', version: 'codex-cli 0.166.0' }
    ]
  },
  'sign-in': {
    tools: [
      { ...CLAUDE, state: 'needs-sign-in', version: '2.1.311 (Claude Code)' },
      { ...CODEX, state: 'not-installed' }
    ]
  },
  none: {
    tools: [
      { ...CLAUDE, state: 'not-installed' },
      { ...CODEX, state: 'not-installed' }
    ]
  }
}

/**
 * Pretend AI tools for the same preview. `&ai=both`, `&ai=sign-in` or
 * `&ai=none` picks another state; the default is Claude Code ready only.
 */
export const createPreviewAiTools = (
  search: string
): TOpenSalesBridge['aiTools'] | null => {
  const params = new URLSearchParams(search)
  if (!params.has('preview')) return null
  const status =
    PREVIEW_AI_TOOLS[params.get('ai') ?? 'one'] ?? PREVIEW_AI_TOOLS.one
  return { getStatus: async () => status }
}

/** A pretend team for the same preview: a live link and one person waiting. */
export const createPreviewTeam = (
  search: string
): TOpenSalesBridge['team'] | null => {
  if (!new URLSearchParams(search).has('preview')) return null

  let joinLink: TJoinLink | null = {
    url: `${SERVER_URL}/join/Xk2mPq8vR4tLw9nB`,
    allowedDomain: 'halden.com',
    role: 'member',
    createdAt: '2026-11-09T10:00:00.000Z'
  }
  let members: TMember[] = [
    {
      id: 'ravi',
      name: 'Ravi Shah',
      email: 'ravi@gmail.com',
      role: 'member',
      status: 'pending',
      joinedAt: '2026-11-09T11:00:00.000Z'
    },
    { ...PREVIEW_USER, status: 'active', joinedAt: '2026-11-01T09:00:00.000Z' },
    {
      id: 'dan',
      name: 'Dan Okafor',
      email: 'dan@halden.com',
      role: 'member',
      status: 'active',
      joinedAt: '2026-11-05T09:00:00.000Z'
    }
  ]
  const done = async <TData>(data: TData) => {
    await pause()
    return { ok: true as const, data }
  }

  return {
    getJoinLink: () => done(joinLink),
    createJoinLink: ({ allowedDomain }) => {
      joinLink = {
        url: `${SERVER_URL}/join/${Math.random().toString(36).slice(2, 18)}`,
        allowedDomain,
        role: 'member',
        createdAt: new Date().toISOString()
      }
      return done(joinLink)
    },
    updateJoinLink: ({ allowedDomain }) => {
      joinLink = joinLink ? { ...joinLink, allowedDomain } : null
      return done(joinLink)
    },
    disableJoinLink: () => {
      joinLink = null
      return done(null)
    },
    listMembers: () => done(members),
    decideMember: (memberId, decision) => {
      members = members.map((member) =>
        member.id === memberId
          ? {
              ...member,
              status: decision === 'approve' ? 'active' : 'declined'
            }
          : member
      )
      return done(null)
    }
  }
}

// Pretend leads, for #/leads in the preview.
export { createPreviewLeads } from './preview-leads'
