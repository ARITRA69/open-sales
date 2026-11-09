import { describe, expect, it, vi } from 'vitest'

import {
  createServerApi,
  normalizeServerAddress,
  ServerProblem
} from './server-api'

const SERVER = 'http://localhost:8787'
const ADMIN = {
  id: 'u1',
  name: 'Asha Menon',
  email: 'asha@example.com',
  role: 'admin'
}

// Answers each path with the given response.
const fakeFetch = (routes: Record<string, () => Response>) =>
  vi.fn(async (input: string | URL | Request) => {
    const path = String(input).replace(`${SERVER}/api/v1`, '')
    const route = routes[path]
    if (!route) throw new TypeError('fetch failed')
    return route()
  }) as unknown as typeof fetch

describe('normalizeServerAddress', () => {
  it.each([
    ['localhost:8787', 'http://localhost:8787'],
    ['  sales.acme.com ', 'https://sales.acme.com'],
    ['https://sales.acme.com/api/v1/', 'https://sales.acme.com'],
    ['http://192.168.1.4:8787/', 'http://192.168.1.4:8787'],
    ['https://acme.com/sales/', 'https://acme.com/sales']
  ])('turns %j into %j', (typed, expected) => {
    expect(normalizeServerAddress(typed)).toBe(expected)
  })

  it('asks for an address when the box is empty', () => {
    expect(() => normalizeServerAddress('   ')).toThrow(ServerProblem)
  })

  it('refuses other kinds of address', () => {
    expect(() => normalizeServerAddress('ftp://acme.com')).toThrow(
      /http or https/
    )
  })
})

describe('checkServer', () => {
  it('returns the setup status of a healthy server', async () => {
    const api = createServerApi(
      fakeFetch({
        '/health': () =>
          Response.json({ status: 'ok', database: 'up', version: '0.1.0' }),
        '/setup': () =>
          Response.json({ needsSetup: false, workspaceName: 'Halden' })
      })
    )

    await expect(api.checkServer(SERVER)).resolves.toEqual({
      needsSetup: false,
      workspaceName: 'Halden'
    })
  })

  it('says when an address is not one of our servers', async () => {
    const api = createServerApi(
      fakeFetch({ '/health': () => new Response('<html>', { status: 200 }) })
    )

    await expect(api.checkServer(SERVER)).rejects.toThrow(
      /There’s no .* server at localhost:8787/
    )
  })

  it('says when the server cannot be reached', async () => {
    const api = createServerApi(fakeFetch({}))

    await expect(api.checkServer(SERVER)).rejects.toThrow(
      'Couldn’t reach localhost:8787'
    )
  })

  it('says when the server cannot reach its database', async () => {
    const api = createServerApi(
      fakeFetch({
        '/health': () =>
          Response.json(
            { status: 'degraded', database: 'down', version: '0.1.0' },
            { status: 503 }
          )
      })
    )

    await expect(api.checkServer(SERVER)).rejects.toThrow(/database/)
  })
})

describe('signIn', () => {
  it('prefers the signed token from the set-auth-token header', async () => {
    const api = createServerApi(
      fakeFetch({
        '/auth/sign-in/email': () =>
          Response.json(
            { token: 'raw', user: { ...ADMIN, emailVerified: false } },
            { headers: { 'set-auth-token': 'raw.signature' } }
          )
      })
    )

    await expect(
      api.signIn(SERVER, { email: ADMIN.email, password: 'correct horse' })
    ).resolves.toEqual({ token: 'raw.signature', user: ADMIN })
  })

  it('explains a wrong password in plain words', async () => {
    const api = createServerApi(
      fakeFetch({
        '/auth/sign-in/email': () =>
          Response.json({ code: 'INVALID_EMAIL_OR_PASSWORD' }, { status: 401 })
      })
    )

    await expect(
      api.signIn(SERVER, { email: ADMIN.email, password: 'nope' })
    ).rejects.toThrow('That email and password don’t match.')
  })
})

describe('getSessionUser', () => {
  it('returns null for an expired session', async () => {
    const api = createServerApi(
      fakeFetch({ '/auth/get-session': () => Response.json(null) })
    )

    await expect(api.getSessionUser(SERVER, 'old')).resolves.toBeNull()
  })

  it('sends the token as a bearer header', async () => {
    const fetchFn = fakeFetch({
      '/auth/get-session': () => Response.json({ user: ADMIN })
    })
    await createServerApi(fetchFn).getSessionUser(SERVER, 'token-1')

    const init = vi.mocked(fetchFn).mock.calls[0][1]
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer token-1'
    )
  })
})
