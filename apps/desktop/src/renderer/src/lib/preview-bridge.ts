import type {
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
