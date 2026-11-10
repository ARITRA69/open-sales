import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PROPOSALS_CHANNELS } from '../preload/bridge-types'
import type { TConnection } from './connection'
import { registerProposalsIpc } from './proposals-ipc'
import { ServerProblem } from './server-api'

const handlers = vi.hoisted(
  () => new Map<string, (...args: unknown[]) => unknown>()
)

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      handlers.set(channel, handler)
  }
}))

const PROPOSAL = {
  id: 'p1',
  kind: 'update',
  status: 'out_of_date',
  title: 'Move Platform to Proposal',
  why: null,
  target: {
    type: 'deal',
    id: 'd1',
    name: 'Platform',
    companyName: 'Halden Capital',
    currency: 'USD',
    version: 2
  },
  changes: [],
  sources: [],
  requestedBy: { id: 'u1', name: 'Asha Menon' },
  approver: { id: 'u1', name: 'Asha Menon' },
  engine: 'claude-code',
  decidedBy: null,
  decidedAt: null,
  declineReason: null,
  undoUntil: null,
  createdAt: '2026-11-10T09:00:00.000Z',
  canDecide: true
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status })

/** Registers the handlers against a pretend session and server. */
const setUp = (answer: () => Promise<Response>) => {
  const fetchFn = vi.fn(answer)
  const connection = {
    withSession: async (
      run: (serverUrl: string, token: string) => Promise<unknown>
    ) => {
      try {
        return { ok: true, data: await run('https://sales.acme.com', 'token') }
      } catch (error) {
        if (error instanceof ServerProblem) {
          return { ok: false, message: error.message, code: error.code }
        }
        throw error
      }
    }
  } as unknown as TConnection
  registerProposalsIpc(connection, fetchFn as unknown as typeof fetch)
  const call = (channel: string, ...args: unknown[]) =>
    handlers.get(channel)?.({}, ...args)
  return { fetchFn, call }
}

describe('proposals ipc', () => {
  beforeEach(() => handlers.clear())

  it('lists what waits, as the signed-in person', async () => {
    const { fetchFn, call } = setUp(async () =>
      json({ items: [PROPOSAL], nextCursor: null, total: 1 })
    )

    const result = await call(PROPOSALS_CHANNELS.list, {
      targetType: 'deal',
      targetId: 'd1'
    })
    expect(result).toMatchObject({ ok: true, data: { total: 1 } })
    const [url, init] = fetchFn.mock.calls[0] as unknown as [
      string,
      RequestInit
    ]
    expect(url).toBe(
      'https://sales.acme.com/api/v1/proposals?targetType=deal&targetId=d1&limit=50'
    )
    expect(init.headers).toMatchObject({ authorization: 'Bearer token' })
  })

  it('approves with edited values and the version seen', async () => {
    const { fetchFn, call } = setUp(async () =>
      json({ ...PROPOSAL, status: 'approved' })
    )

    const result = await call(PROPOSALS_CHANNELS.approve, 'p1', {
      changes: [{ field: 'valueMinor', to: 2_200_000 }],
      version: 2
    })
    expect(result).toMatchObject({ ok: true, data: { status: 'approved' } })
    const [url, init] = fetchFn.mock.calls[0] as unknown as [
      string,
      RequestInit
    ]
    expect(url).toBe('https://sales.acme.com/api/v1/proposals/p1/approve')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({
      changes: [{ field: 'valueMinor', to: 2_200_000 }],
      version: 2
    })
  })

  it('passes on a refusal with the proposal it carries', async () => {
    const { call } = setUp(async () =>
      json(
        {
          error: { code: 'changed_since', message: 'This changed.' },
          proposal: PROPOSAL
        },
        409
      )
    )

    expect(await call(PROPOSALS_CHANNELS.approve, 'p1')).toEqual({
      ok: false,
      message: 'This changed.',
      code: 'changed_since',
      proposal: PROPOSAL
    })
  })

  it('keeps the server’s code for a plain refusal', async () => {
    const { call } = setUp(async () =>
      json(
        { error: { code: 'forbidden', message: 'Only the owner can.' } },
        403
      )
    )
    expect(await call(PROPOSALS_CHANNELS.sendToOwner, 'p1')).toMatchObject({
      ok: false,
      code: 'forbidden',
      message: 'Only the owner can.'
    })
  })

  it('sends a decline’s reason, and undo with nothing', async () => {
    const { fetchFn, call } = setUp(async () => json(PROPOSAL))

    await call(PROPOSALS_CHANNELS.decline, 'p1', ' Wrong deal ')
    await call(PROPOSALS_CHANNELS.undo, 'p1')
    const sent = fetchFn.mock.calls.map((args) => {
      const [url, init] = args as unknown as [string, RequestInit]
      return [url.split('/proposals')[1], JSON.parse(String(init.body))]
    })
    expect(sent).toEqual([
      ['/p1/decline', { reason: 'Wrong deal' }],
      ['/p1/undo', {}]
    ])
  })

  it('refuses what the renderer shouldn’t send, without calling the server', async () => {
    const { fetchFn, call } = setUp(async () => json(PROPOSAL))

    expect(await call(PROPOSALS_CHANNELS.approve, 42)).toMatchObject({
      ok: false
    })
    expect(
      await call(PROPOSALS_CHANNELS.create, { kind: 'update', title: '' })
    ).toMatchObject({ ok: false })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('says so in plain words when the server can’t be reached', async () => {
    const { call } = setUp(async () => {
      throw new TypeError('fetch failed')
    })
    expect(await call(PROPOSALS_CHANNELS.list)).toEqual({
      ok: false,
      message:
        'Couldn’t reach sales.acme.com. Check that the server is running.',
      code: undefined
    })
  })
})
