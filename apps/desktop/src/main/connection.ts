import type {
  TJoinForm,
  TJoinLinkSettings,
  TSetupRequest,
  TSignInRequest
} from '@open-sales/shared'

import type {
  TConnectionResult,
  TConnectionState,
  TTeamResult
} from '../preload/bridge-types'
import type { TConnectionStore } from './connection-store'
import type { TServerApi } from './server-api'
import {
  normalizeServerAddress,
  parseJoinLink,
  ServerProblem
} from './server-api'

const DEAD_LINK =
  'This join link has expired or was reset. Ask your admin for a new one.'

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
  // The join link they opened, until they join. Kept in memory: opening the
  // link again is easy, and it never lands on disk.
  let pendingJoin: { serverUrl: string; joinToken: string } | null = null
  // Their password while they wait for approval, so the app can sign them in
  // the moment an admin says yes. Memory only; after a restart they sign in.
  let waitingSignIn: { email: string; password: string } | null = null

  /** Not signed in: the Join screen, the waiting screen, or plain sign-in. */
  const signedOutState = async (
    serverUrl: string,
    workspaceName: string | null
  ): Promise<TConnectionState> => {
    if (pendingJoin?.serverUrl === serverUrl) {
      return { step: 'join', serverUrl, workspaceName }
    }

    const joinTicket = await store.readJoinTicket()
    if (joinTicket) {
      const status = await api.getJoinRequestStatus(
        serverUrl,
        joinTicket.ticket
      )
      if (status === 'pending' || status === 'declined') {
        return {
          step: 'waiting-approval',
          serverUrl,
          workspaceName,
          email: joinTicket.email,
          declined: status === 'declined'
        }
      }
      // Approved, or the server no longer knows the request.
      await store.clearJoinTicket()
      if (status === 'approved' && waitingSignIn?.email === joinTicket.email) {
        const { token } = await api.signIn(serverUrl, waitingSignIn)
        waitingSignIn = null
        await store.saveToken(token)
        return getState()
      }
    }

    return { step: 'sign-in', serverUrl, workspaceName }
  }

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
        return signedOutState(serverUrl, status.workspaceName)
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

  /**
   * A join link, pasted or opened from the browser. Points the app at its
   * server and shows the Join screen.
   */
  const openJoinLink = (link: string) =>
    toResult(async () => {
      const parsed = parseJoinLink(link)
      if (!parsed) throw new ServerProblem('That isn’t a join link.')

      await api.checkServer(parsed.serverUrl)
      if (!(await api.previewJoin(parsed.serverUrl, parsed.joinToken))) {
        throw new ServerProblem(DEAD_LINK)
      }

      // Already signed in to this server: they're on the team.
      const current = await getState()
      if (
        current.step === 'signed-in' &&
        current.serverUrl === parsed.serverUrl
      ) {
        return current
      }

      await store.clearToken()
      await store.clearJoinTicket()
      await store.saveServerUrl(parsed.serverUrl)
      pendingJoin = { serverUrl: parsed.serverUrl, joinToken: parsed.joinToken }
      return getState()
    })

  const chooseServer = (address: string) =>
    toResult(async () => {
      // The same box takes a join link.
      if (parseJoinLink(address)) {
        const opened = await openJoinLink(address)
        if (!opened.ok) throw new ServerProblem(opened.message)
        return opened.state
      }

      const serverUrl = normalizeServerAddress(address)
      await api.checkServer(serverUrl)
      // A different server means a different account.
      await store.clearToken()
      await store.saveServerUrl(serverUrl)
      return getState()
    })

  const forgetServer = async (): Promise<TConnectionState> => {
    pendingJoin = null
    waitingSignIn = null
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

  const join = (input: TJoinForm) =>
    toResult(async () => {
      if (!pendingJoin) throw new ServerProblem(DEAD_LINK)
      const { serverUrl, joinToken } = pendingJoin
      const joined = await api.join(serverUrl, joinToken, input)
      pendingJoin = null

      if (joined.status === 'active') {
        await store.saveToken(joined.token)
      } else {
        const email = input.email.trim().toLowerCase()
        await store.saveJoinTicket({ ticket: joined.ticket, email })
        waitingSignIn = { email, password: input.password }
      }
      return getState()
    })

  /** Runs an admin action with the saved session; problems become messages. */
  const asAdmin = async <TData>(
    run: (serverUrl: string, token: string) => Promise<TData>
  ): Promise<TTeamResult<TData>> => {
    try {
      const serverUrl = await requireServerUrl()
      const token = await store.readToken()
      if (!token) throw new ServerProblem('Sign in again.')
      return { ok: true, data: await run(serverUrl, token) }
    } catch (error) {
      if (error instanceof ServerProblem) {
        return { ok: false, message: error.message }
      }
      console.error(error)
      return { ok: false, message: 'Something went wrong. Try again.' }
    }
  }

  const team = {
    getJoinLink: () => asAdmin(api.team.getJoinLink),
    createJoinLink: (settings: TJoinLinkSettings) =>
      asAdmin((serverUrl, token) =>
        api.team.createJoinLink(serverUrl, token, settings)
      ),
    updateJoinLink: (settings: TJoinLinkSettings) =>
      asAdmin((serverUrl, token) =>
        api.team.updateJoinLink(serverUrl, token, settings)
      ),
    disableJoinLink: () =>
      asAdmin(async (serverUrl, token) => {
        await api.team.disableJoinLink(serverUrl, token)
        return null
      }),
    listMembers: () => asAdmin(api.team.listMembers),
    decideMember: (memberId: string, decision: 'approve' | 'decline') =>
      asAdmin(async (serverUrl, token) => {
        await api.team.decideMember(serverUrl, token, memberId, decision)
        return null
      })
  }

  return {
    getState,
    chooseServer,
    openJoinLink,
    forgetServer,
    createAdmin,
    signIn,
    signOut,
    join,
    // Leaving the Join or Waiting screen means choosing a server again.
    cancelJoin: forgetServer,
    team
  }
}

export type TConnection = ReturnType<typeof createConnection>
