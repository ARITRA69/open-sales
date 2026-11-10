import { describe, expect, it, vi } from 'vitest'

import { ServerProblem } from './server-api'
import { createSettingsApi } from './settings-api'

const SERVER = 'http://localhost:8787'

type TCall = { path: string; method: string; body: unknown; auth: string }

/** Answers every request with one response, and remembers what was asked. */
const fakeFetch = (answer: () => Response) => {
  const calls: TCall[] = []
  const fetchFn = vi.fn(async (input: string | URL | Request, init = {}) => {
    const headers = new Headers(init.headers)
    calls.push({
      path: String(input).replace(`${SERVER}/api/v1`, ''),
      method: init.method ?? 'GET',
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      auth: headers.get('authorization') ?? ''
    })
    return answer()
  }) as unknown as typeof fetch
  return { fetchFn, calls }
}

const PIPELINE = {
  id: 'sales',
  name: 'Sales',
  revision: 'r2',
  stages: [],
  lostReasons: []
}

describe('createSettingsApi', () => {
  it('sends each save to its route as the signed-in person', async () => {
    const { fetchFn, calls } = fakeFetch(() => Response.json(PIPELINE))
    const api = createSettingsApi(fetchFn)

    await api.getPipeline(SERVER, 'token-1')
    await api.saveStages(SERVER, 'token-1', {
      revision: 'r1',
      stages: [],
      removed: []
    })
    await api.saveLostReasons(SERVER, 'token-1', {
      revision: 'r1',
      reasons: [{ label: 'Price' }]
    })

    expect(calls.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'GET /settings/pipeline',
      'PUT /settings/pipeline/stages',
      'PUT /settings/pipeline/lost-reasons'
    ])
    expect(calls.every((call) => call.auth === 'Bearer token-1')).toBe(true)
    expect(calls[2].body).toEqual({
      revision: 'r1',
      reasons: [{ label: 'Price' }]
    })
  })

  it('reads the member and the person out of their answers', async () => {
    const member = {
      id: 'u/2',
      name: 'Dan Okafor',
      email: 'dan@halden.com',
      role: 'manager',
      status: 'active',
      joinedAt: '2026-11-05T09:00:00.000Z'
    }
    const members = fakeFetch(() => Response.json({ member }))
    expect(
      await createSettingsApi(members.fetchFn).updateMember(
        SERVER,
        'token-1',
        'u/2',
        { role: 'manager' }
      )
    ).toEqual(member)
    expect(members.calls[0]).toMatchObject({
      method: 'PATCH',
      path: '/team/members/u%2F2',
      body: { role: 'manager' }
    })

    const user = {
      id: 'u1',
      name: 'Asha K. Menon',
      email: 'asha@halden.com',
      role: 'admin'
    }
    const me = fakeFetch(() => Response.json({ user }))
    expect(
      await createSettingsApi(me.fetchFn).updateMe(SERVER, 'token-1', {
        name: 'Asha K. Menon'
      })
    ).toEqual(user)
  })

  it('keeps the server’s message and code when it refuses', async () => {
    const { fetchFn } = fakeFetch(() =>
      Response.json(
        { error: { code: 'changed_since', message: 'Someone changed this.' } },
        { status: 409 }
      )
    )
    const saving = createSettingsApi(fetchFn).saveStages(SERVER, 'token-1', {
      revision: 'r1',
      stages: []
    })

    await expect(saving).rejects.toBeInstanceOf(ServerProblem)
    await expect(saving).rejects.toMatchObject({
      message: 'Someone changed this.',
      code: 'changed_since'
    })
  })

  it('says so in plain words when the server can’t be reached', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch

    await expect(
      createSettingsApi(fetchFn).getWorkspace(SERVER, 'token-1')
    ).rejects.toThrow(/Couldn’t reach localhost:8787/)
  })
})
