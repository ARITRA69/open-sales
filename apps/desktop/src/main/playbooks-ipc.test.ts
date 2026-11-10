import { describe, expect, it, vi } from 'vitest'

// The handlers aren't under test here, only the calls to the server.
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

const { createPlaybooksApi } = await import('./playbooks-ipc')
const { ServerProblem } = await import('./server-api')

const SERVER = 'http://localhost:8787'

const PLAYBOOK = {
  id: 'p1',
  name: 'Meeting prep',
  description: null,
  author: null,
  status: 'published',
  publishedAt: '2026-11-09T10:00:00.000Z',
  current: {
    id: 'v1',
    number: 1,
    steps: 'Read the timeline.',
    blanks: [],
    allowedChanges: ['fields'],
    createdBy: null,
    createdAt: '2026-11-09T10:00:00.000Z'
  },
  version: 1,
  createdAt: '2026-11-09T10:00:00.000Z',
  updatedAt: '2026-11-09T10:00:00.000Z',
  archivedAt: null,
  canEdit: true
}

type TCall = { url: string; init: RequestInit }

const fakeFetch = (respond: (call: TCall) => Response) => {
  const calls: TCall[] = []
  const fetchFn = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const call = { url: String(input), init: init ?? {} }
    calls.push(call)
    return respond(call)
  }) as typeof fetch
  return { calls, fetchFn }
}

describe('createPlaybooksApi', () => {
  it('lists with the filters as a query string, signed in', async () => {
    const { calls, fetchFn } = fakeFetch(() =>
      Response.json({ items: [PLAYBOOK], nextCursor: null })
    )
    const api = createPlaybooksApi(fetchFn)

    const page = await api.list(SERVER, 'token-1', {
      status: 'published',
      q: 'meeting prep',
      cursor: undefined
    })

    expect(page.items[0].name).toBe('Meeting prep')
    expect(calls[0].url).toBe(
      `${SERVER}/api/v1/playbooks?status=published&q=meeting+prep`
    )
    expect(calls[0].init.method).toBe('GET')
    expect(new Headers(calls[0].init.headers).get('authorization')).toBe(
      'Bearer token-1'
    )
  })

  it('creates, edits and publishes at the paths the server serves', async () => {
    const { calls, fetchFn } = fakeFetch(() => Response.json(PLAYBOOK))
    const api = createPlaybooksApi(fetchFn)

    await api.get(SERVER, 't', 'p1')
    await api.create(SERVER, 't', { name: 'Meeting prep' })
    await api.update(SERVER, 't', 'p1', { steps: 'New.', version: 1 })
    await api.setState(SERVER, 't', 'p1', 'publish', 2)

    expect(
      calls.map((call) => [
        call.init.method,
        call.url.replace(`${SERVER}/api/v1`, ''),
        call.init.body ?? null
      ])
    ).toEqual([
      ['GET', '/playbooks/p1', null],
      ['POST', '/playbooks', '{"name":"Meeting prep"}'],
      ['PATCH', '/playbooks/p1', '{"steps":"New.","version":1}'],
      ['POST', '/playbooks/p1/publish', '{"version":2}']
    ])
  })

  it('turns a refusal into a problem with the server’s words and code', async () => {
    const { fetchFn } = fakeFetch(() =>
      Response.json(
        { error: { code: 'changed_since', message: 'Someone changed this.' } },
        { status: 409 }
      )
    )
    const api = createPlaybooksApi(fetchFn)

    const refusal = await api
      .update(SERVER, 't', 'p1', { name: 'X', version: 1 })
      .catch((error: unknown) => error)
    expect(refusal).toBeInstanceOf(ServerProblem)
    expect(refusal).toMatchObject({
      message: 'Someone changed this.',
      code: 'changed_since'
    })
  })

  it('says so in plain words when the server can’t be reached', async () => {
    const api = createPlaybooksApi((async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch)

    await expect(api.get(SERVER, 't', 'p1')).rejects.toThrow(
      'Couldn’t reach localhost:8787'
    )
  })

  it('refuses an answer that isn’t a playbook', async () => {
    const { fetchFn } = fakeFetch(() => Response.json({ id: 'p1' }))
    await expect(
      createPlaybooksApi(fetchFn).get(SERVER, 't', 'p1')
    ).rejects.toThrow()
  })
})
