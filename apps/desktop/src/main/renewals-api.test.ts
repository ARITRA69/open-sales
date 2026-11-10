import { describe, expect, it, vi } from 'vitest'

import { createRenewalsApi } from './renewals-api'
import { ServerProblem } from './server-api'

const SERVER = 'http://localhost:8787'

const CONTRACT = {
  id: 'c1',
  version: 1,
  company: { id: 'halden', name: 'Halden Capital' },
  owner: { id: 'u1', name: 'Asha Menon' },
  deal: { id: 'd1', name: 'Platform rollout' },
  renewalDeal: null,
  valueMinor: 3_600_000,
  currency: 'USD',
  startsOn: '2025-12-05',
  renewsOn: '2026-12-05',
  status: 'active',
  endReason: null,
  createdAt: '2026-11-01T09:00:00.000Z',
  updatedAt: '2026-11-01T09:00:00.000Z',
  canEdit: true
}

const answering = (respond: (url: string, init: RequestInit) => Response) => {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchFn = vi.fn(async (input: string | URL | Request, init = {}) => {
    calls.push({ url: String(input), init })
    return respond(String(input), init)
  }) as unknown as typeof fetch
  return { api: createRenewalsApi(fetchFn), calls }
}

describe('renewals api', () => {
  it('lists contracts for a window, as the signed-in person', async () => {
    const { api, calls } = answering(() =>
      Response.json({ items: [CONTRACT], nextCursor: null })
    )
    const page = await api.list(SERVER, 'token-1', {
      view: 'upcoming',
      window: 30,
      cursor: undefined
    })
    expect(page.items[0].company.name).toBe('Halden Capital')
    expect(calls[0].url).toBe(
      `${SERVER}/api/v1/contracts?view=upcoming&window=30`
    )
    expect(new Headers(calls[0].init.headers).get('authorization')).toBe(
      'Bearer token-1'
    )
  })

  it('posts each action to its own address', async () => {
    const { api, calls } = answering(() => Response.json(CONTRACT))
    await api.createContract(SERVER, 't', {
      dealId: 'd1',
      startsOn: '2025-12-05',
      renewsOn: '2026-12-05',
      valueMinor: 3_600_000
    })
    await api.startRenewal(SERVER, 't', 'c1', { version: 1 })
    await api.endContract(SERVER, 't', 'c1', { version: 1, reason: 'Budget' })
    await api.reopenContract(SERVER, 't', 'c1', 2)
    await api.listCandidates(SERVER, 't').catch(() => undefined)

    expect(
      calls.map(({ url, init }) => [
        init.method,
        url.replace(`${SERVER}/api/v1`, '')
      ])
    ).toEqual([
      ['POST', '/contracts'],
      ['POST', '/contracts/c1/start-renewal'],
      ['POST', '/contracts/c1/end'],
      ['POST', '/contracts/c1/reopen'],
      ['GET', '/contracts/candidates']
    ])
    expect(JSON.parse(String(calls[3].init.body))).toEqual({ version: 2 })
  })

  it('passes on the server’s refusal, with its code', async () => {
    const { api } = answering(() =>
      Response.json(
        { error: { code: 'changed_since', message: 'Someone changed this.' } },
        { status: 409 }
      )
    )
    const refused = api.endContract(SERVER, 't', 'c1', {
      version: 1,
      reason: 'Budget'
    })
    await expect(refused).rejects.toBeInstanceOf(ServerProblem)
    await expect(refused).rejects.toMatchObject({
      message: 'Someone changed this.',
      code: 'changed_since'
    })
  })

  it('says so in plain words when the server can’t be reached', async () => {
    const api = createRenewalsApi((async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch)
    await expect(api.list(SERVER, 't')).rejects.toThrow(
      'Couldn’t reach localhost:8787.'
    )
  })
})
