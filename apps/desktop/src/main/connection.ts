import type { TSetupRequest, TSignInRequest } from '@open-sales/shared'

import type {
  TConnectionResult,
  TConnectionState
} from '../preload/bridge-types'
import type { TConnectionStore } from './connection-store'
import type { TServerApi } from './server-api'
import { normalizeServerAddress, ServerProblem } from './server-api'

/** Turns a thrown problem into a result the renderer can show. */
const toResult = async (
  run: () => Promise<TConnectionState>
): Promise<TConnectionResult> => {
  try {
    return { ok: true, state: await run() }
  } catch (error) {
    if (error instanceof ServerProblem) {
      return { ok: false, message: error.message }
    }
    console.error(error)
    return { ok: false, message: 'Something went wrong. Try again.' }
  }
}

/**
 * Connecting to a server and signing in, as one state machine. The renderer
 * shows whatever step this returns.
 */
export const createConnection = (api: TServerApi, store: TConnectionStore) => {
  const getState = async (): Promise<TConnectionState> => {
    const serverUrl = await store.readServerUrl()
    if (!serverUrl) return { step: 'choose-server' }

    try {
      const status = await api.getSetupStatus(serverUrl)
      if (status.needsSetup) return { step: 'create-admin', serverUrl }

      const token = await store.readToken()
      const user = token ? await api.getSessionUser(serverUrl, token) : null
      if (!user) {
        // Expired or signed out elsewhere: start again at sign-in.
        if (token) await store.clearToken()
        return {
          step: 'sign-in',
          serverUrl,
          workspaceName: status.workspaceName
        }
      }

      return {
        step: 'signed-in',
        serverUrl,
        workspaceName: status.workspaceName,
        user
      }
    } catch (error) {
      if (!(error instanceof ServerProblem)) throw error
      return { step: 'server-unreachable', serverUrl, message: error.message }
    }
  }

  const chooseServer = (address: string) =>
    toResult(async () => {
      const serverUrl = normalizeServerAddress(address)
      await api.checkServer(serverUrl)
      // A different server means a different account.
      await store.clearToken()
      await store.saveServerUrl(serverUrl)
      return getState()
    })

  const forgetServer = async (): Promise<TConnectionState> => {
    await store.clearAll()
    return { step: 'choose-server' }
  }

  const requireServerUrl = async () => {
    const serverUrl = await store.readServerUrl()
    if (!serverUrl) throw new ServerProblem('Choose a server first.')
    return serverUrl
  }

  const createAdmin = (input: TSetupRequest) =>
    toResult(async () => {
      const serverUrl = await requireServerUrl()
      const { token } = await api.createAdmin(serverUrl, input)
      await store.saveToken(token)
      return getState()
    })

  const signIn = (input: TSignInRequest) =>
    toResult(async () => {
      const serverUrl = await requireServerUrl()
      const { token } = await api.signIn(serverUrl, input)
      await store.saveToken(token)
      return getState()
    })

  const signOut = async (): Promise<TConnectionState> => {
    const serverUrl = await store.readServerUrl()
    const token = await store.readToken()
    // Forget the token here even if the server can't be told.
    await store.clearToken()
    if (serverUrl && token) {
      await api.signOut(serverUrl, token).catch(() => undefined)
    }
    return getState()
  }

  return { getState, chooseServer, forgetServer, createAdmin, signIn, signOut }
}

export type TConnection = ReturnType<typeof createConnection>
