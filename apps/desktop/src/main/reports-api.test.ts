import { describe, expect, it, vi } from 'vitest'

import { createReportsApi } from './reports-api'
import { ServerProblem } from './server-api'

const SERVER = 'http://localhost:8787'

const WON_LOST = {
  range: { from: '2026-10-01', to: '2026-12-31' },
  currency: 'USD',
  deals: [],
  dealsTruncated: false,
  won: { count: 1, totals: [{ currency: 'USD', valueMinor: 100_000 }] },
  lost: { count: 0, totals: [] },
  winRate: 1,
  reasons: []
}

const fakeFetch = (respond: () => Response | Promise<Response>) =>
  vi.fn(async () => respond()) as unknown as typeof fetch

describe('createReportsApi', () => {
  it('asks as the signed-in person, with the filters in the address', async () => {
    const fetchFn = fakeFetch(() => Response.json(WON_LOST))
    const api = createReportsApi(fetchFn)

    await expect(
      api.getWonLost(SERVER, 'token-1', {
        period: 'last_month',
        ownerId: 'u-ravi'
      })
    ).resolves.toEqual(WON_LOST)

    const [url, init] = vi.mocked(fetchFn).mock.calls[0]
    expect(url).toBe(
      `${SERVER}/api/v1/reports/won-lost?period=last_month&ownerId=u-ravi`
    )
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer token-1'
    )
  })

  it('leaves out an owner that isn’t set', async () => {
    const fetchFn = fakeFetch(() => Response.json(WON_LOST))
    await createReportsApi(fetchFn).getWonLost(SERVER, 'token-1', {
      period: 'this_quarter'
    })
    expect(vi.mocked(fetchFn).mock.calls[0][0]).toBe(
      `${SERVER}/api/v1/reports/won-lost?period=this_quarter`
    )
  })

  it('keeps the server’s message and code when it refuses', async () => {
    const api = createReportsApi(
      fakeFetch(() =>
        Response.json(
          {
            error: {
              code: 'forbidden',
              message: 'Only managers and admins see the forecast.'
            }
          },
          { status: 403 }
        )
      )
    )

    const refused = await api
      .getForecast(SERVER, 'token-1', { period: 'next_3_months' })
      .catch((error: unknown) => error)
    expect(refused).toBeInstanceOf(ServerProblem)
    expect(refused).toMatchObject({
      code: 'forbidden',
      message: 'Only managers and admins see the forecast.'
    })
  })

  it('says so in plain words when the server can’t be reached', async () => {
    const api = createReportsApi(
      fakeFetch(() => {
        throw new TypeError('fetch failed')
      })
    )
    await expect(
      api.getPipeline(SERVER, 'token-1', { period: 'this_quarter' })
    ).rejects.toThrow(/Couldn’t reach localhost:8787/)
  })

  it('refuses an answer that isn’t a report', async () => {
    const api = createReportsApi(fakeFetch(() => Response.json({ nope: 1 })))
    await expect(
      api.getPipeline(SERVER, 'token-1', { period: 'this_quarter' })
    ).rejects.toThrow()
  })
})
