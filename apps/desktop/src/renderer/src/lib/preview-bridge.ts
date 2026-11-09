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
  }
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 400))

/**
 * A pretend server for the browser preview, where there's no Electron bridge.
 * Open the page with `?preview=sign-in` (or choose-server, create-admin,
 * server-unreachable, signed-in) to see that screen and click through.
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
    signOut: async () => PREVIEW_STATES['sign-in']
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
