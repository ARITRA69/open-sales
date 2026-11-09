import { describe, expect, it, vi } from 'vitest'

import { createConnection } from './connection'
import type { TConnectionStore } from './connection-store'
import type { TServerApi } from './server-api'
import { ServerProblem } from './server-api'

const SERVER = 'http://localhost:8787'
const ADMIN = {
  id: 'u1',
  name: 'Asha Menon',
  email: 'asha@example.com',
  role: 'admin' as const
}

const makeStore = (
  saved: { serverUrl?: string; token?: string } = {}
): TConnectionStore => {
  let serverUrl = saved.serverUrl ?? null
  let token = saved.token ?? null
  return {
    readServerUrl: async () => serverUrl,
    saveServerUrl: async (url) => {
      serverUrl = url
    },
    readToken: async () => token,
    saveToken: async (value) => {
      token = value
    },
    clearToken: async () => {
      token = null
    },
    clearAll: async () => {
      token = null
      serverUrl = null
    }
  }
}

const makeApi = (overrides: Partial<TServerApi> = {}): TServerApi => ({
  checkServer: async () => ({ needsSetup: false, workspaceName: 'Halden' }),
  getSetupStatus: async () => ({ needsSetup: false, workspaceName: 'Halden' }),
  createAdmin: async () => ({ token: 'setup-token', user: ADMIN }),
  signIn: async () => ({ token: 'sign-in-token', user: ADMIN }),
  getSessionUser: async (_url, token) =>
    token === 'sign-in-token' || token === 'setup-token' ? ADMIN : null,
  signOut: async () => undefined,
  ...overrides
})

describe('connection', () => {
  it('starts by asking for a server', async () => {
    const connection = createConnection(makeApi(), makeStore())

    await expect(connection.getState()).resolves.toEqual({
      step: 'choose-server'
    })
  })

  it('goes to create-admin on a new server', async () => {
    const api = makeApi({
      checkServer: async () => ({ needsSetup: true, workspaceName: null }),
      getSetupStatus: async () => ({ needsSetup: true, workspaceName: null })
    })
    const connection = createConnection(api, makeStore())

    await expect(connection.chooseServer('localhost:8787')).resolves.toEqual({
      ok: true,
      state: { step: 'create-admin', serverUrl: SERVER }
    })
  })

  it('signs the admin in as soon as setup finishes', async () => {
    const store = makeStore({ serverUrl: SERVER })
    const connection = createConnection(makeApi(), store)

    const result = await connection.createAdmin({
      workspaceName: 'Halden',
      name: ADMIN.name,
      email: ADMIN.email,
      password: 'correct horse'
    })

    expect(result).toMatchObject({ ok: true, state: { step: 'signed-in' } })
    await expect(store.readToken()).resolves.toBe('setup-token')
  })

  it('remembers the session across launches', async () => {
    const store = makeStore({ serverUrl: SERVER, token: 'sign-in-token' })

    await expect(
      createConnection(makeApi(), store).getState()
    ).resolves.toEqual({
      step: 'signed-in',
      serverUrl: SERVER,
      workspaceName: 'Halden',
      user: ADMIN
    })
  })

  it('drops an expired token and asks to sign in again', async () => {
    const store = makeStore({ serverUrl: SERVER, token: 'expired' })

    await expect(
      createConnection(makeApi(), store).getState()
    ).resolves.toMatchObject({ step: 'sign-in', workspaceName: 'Halden' })
    await expect(store.readToken()).resolves.toBeNull()
  })

  it('shows a problem instead of throwing', async () => {
    const api = makeApi({
      signIn: async () => {
        throw new ServerProblem('That email and password don’t match.')
      }
    })
    const connection = createConnection(api, makeStore({ serverUrl: SERVER }))

    await expect(
      connection.signIn({ email: ADMIN.email, password: 'nope' })
    ).resolves.toEqual({
      ok: false,
      message: 'That email and password don’t match.'
    })
  })

  it('reports an unreachable saved server', async () => {
    const api = makeApi({
      getSetupStatus: async () => {
        throw new ServerProblem('Couldn’t reach localhost:8787.')
      }
    })

    await expect(
      createConnection(api, makeStore({ serverUrl: SERVER })).getState()
    ).resolves.toEqual({
      step: 'server-unreachable',
      serverUrl: SERVER,
      message: 'Couldn’t reach localhost:8787.'
    })
  })

  it('signs out locally even if the server is down', async () => {
    const signOut = vi.fn(async () => {
      throw new Error('offline')
    })
    const store = makeStore({ serverUrl: SERVER, token: 'sign-in-token' })
    const state = await createConnection(makeApi({ signOut }), store).signOut()

    expect(state).toMatchObject({ step: 'sign-in' })
    await expect(store.readToken()).resolves.toBeNull()
  })
})
