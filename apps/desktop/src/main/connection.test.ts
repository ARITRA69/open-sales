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
  saved: {
    serverUrl?: string
    token?: string
    joinTicket?: { ticket: string; email: string }
  } = {}
): TConnectionStore => {
  let serverUrl = saved.serverUrl ?? null
  let token = saved.token ?? null
  let joinTicket = saved.joinTicket ?? null
  return {
    readJoinTicket: async () => joinTicket,
    saveJoinTicket: async (value) => {
      joinTicket = value
    },
    clearJoinTicket: async () => {
      joinTicket = null
    },
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
      joinTicket = null
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
  previewJoin: async (_url, joinToken) =>
    joinToken === JOIN_TOKEN ? { workspaceName: 'Halden' } : null,
  join: async () => ({ status: 'pending', ticket: 'ticket-1' }),
  getJoinRequestStatus: async () => 'pending',
  team: {
    getJoinLink: async () => null,
    createJoinLink: async () => null,
    updateJoinLink: async () => null,
    disableJoinLink: async () => undefined,
    listMembers: async () => [],
    decideMember: async () => undefined
  },
  records: {
    list: async () => ({ items: [], nextCursor: null }),
    get: async () => {
      throw new ServerProblem('Not here.', 'not_found')
    },
    create: async () => {
      throw new ServerProblem('Not here.', 'not_found')
    },
    update: async () => {
      throw new ServerProblem('Someone changed this.', 'changed_since')
    },
    setArchived: async () => {
      throw new ServerProblem('Not here.', 'not_found')
    },
    getPipeline: async () => {
      throw new ServerProblem('Not here.', 'not_found')
    },
    getBoard: async () => ({ columns: [] }),
    listUsers: async () => []
  },
  ...overrides
})

const JOIN_TOKEN = 'abcdefgh12345678'
const JOIN_LINK = `${SERVER}/join/${JOIN_TOKEN}`
const RAVI = {
  name: 'Ravi Shah',
  email: 'Ravi@Gmail.com',
  password: 'correct horse'
}

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

  describe('joining with the team link', () => {
    it('takes a pasted join link in the server box', async () => {
      const store = makeStore()
      const connection = createConnection(makeApi(), store)

      await expect(connection.chooseServer(JOIN_LINK)).resolves.toEqual({
        ok: true,
        state: { step: 'join', serverUrl: SERVER, workspaceName: 'Halden' }
      })
      await expect(store.readServerUrl()).resolves.toBe(SERVER)
    })

    it('opens the app’s own link from the join page', async () => {
      const connection = createConnection(makeApi(), makeStore())
      const appLink = `open-sales://join?link=${encodeURIComponent(JOIN_LINK)}`

      const result = await connection.openJoinLink(appLink)
      expect(result.ok && result.state.step).toBe('join')
    })

    it('says so when the link is dead', async () => {
      const connection = createConnection(makeApi(), makeStore())

      const result = await connection.chooseServer(
        `${SERVER}/join/oldoldoldold`
      )
      expect(result).toEqual({
        ok: false,
        message:
          'This join link has expired or was reset. Ask your admin for a new one.'
      })
    })

    it('signs them straight in when the domain is trusted', async () => {
      const store = makeStore()
      const api = makeApi({
        join: async () => ({
          status: 'active',
          token: 'sign-in-token',
          user: ADMIN
        })
      })
      const connection = createConnection(api, store)
      await connection.chooseServer(JOIN_LINK)

      const result = await connection.join(RAVI)
      expect(result.ok && result.state.step).toBe('signed-in')
      await expect(store.readToken()).resolves.toBe('sign-in-token')
    })

    it('waits for approval, then signs in by itself once approved', async () => {
      const store = makeStore()
      let requestStatus: 'pending' | 'approved' = 'pending'
      const signIn = vi.fn(async () => ({
        token: 'sign-in-token',
        user: ADMIN
      }))
      const api = makeApi({
        getJoinRequestStatus: async () => requestStatus,
        signIn
      })
      const connection = createConnection(api, store)
      await connection.chooseServer(JOIN_LINK)

      await expect(connection.join(RAVI)).resolves.toEqual({
        ok: true,
        state: {
          step: 'waiting-approval',
          serverUrl: SERVER,
          workspaceName: 'Halden',
          email: 'ravi@gmail.com',
          declined: false
        }
      })

      requestStatus = 'approved'
      const state = await connection.getState()
      expect(state.step).toBe('signed-in')
      expect(signIn).toHaveBeenCalledWith(SERVER, {
        email: 'ravi@gmail.com',
        password: RAVI.password
      })
      await expect(store.readJoinTicket()).resolves.toBeNull()
    })

    it('after a restart, sends an approved person to sign in', async () => {
      const store = makeStore({
        serverUrl: SERVER,
        joinTicket: { ticket: 'ticket-1', email: 'ravi@gmail.com' }
      })
      const api = makeApi({ getJoinRequestStatus: async () => 'approved' })

      await expect(createConnection(api, store).getState()).resolves.toEqual({
        step: 'sign-in',
        serverUrl: SERVER,
        workspaceName: 'Halden'
      })
    })

    it('shows when an admin declined', async () => {
      const store = makeStore({
        serverUrl: SERVER,
        joinTicket: { ticket: 'ticket-1', email: 'ravi@gmail.com' }
      })
      const api = makeApi({ getJoinRequestStatus: async () => 'declined' })

      const state = await createConnection(api, store).getState()
      expect(state.step === 'waiting-approval' && state.declined).toBe(true)
    })
  })

  describe('records', () => {
    const signedIn = () =>
      createConnection(
        makeApi(),
        makeStore({ serverUrl: SERVER, token: 'sign-in-token' })
      )

    it('passes the server’s answer through', async () => {
      await expect(signedIn().records.list('companies')).resolves.toEqual({
        ok: true,
        data: { items: [], nextCursor: null }
      })
    })

    it('keeps the server’s code, so screens can react to it', async () => {
      const result = await signedIn().records.update('companies', 'c1', {
        name: 'Halden',
        version: 1
      })
      expect(result).toEqual({
        ok: false,
        message: 'Someone changed this.',
        code: 'changed_since'
      })
    })

    it('asks to sign in again without a token', async () => {
      const connection = createConnection(
        makeApi(),
        makeStore({ serverUrl: SERVER })
      )
      await expect(connection.records.getBoard()).resolves.toMatchObject({
        ok: false,
        message: 'Sign in again.'
      })
    })
  })
})
