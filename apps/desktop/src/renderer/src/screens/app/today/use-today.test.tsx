// @vitest-environment happy-dom
import type { TProposal } from '@open-sales/shared'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { TProposalResult } from '../../../../../preload/bridge-types'
import { makeProposal } from './test-data'
import { useToday, type TProposalsBridge } from './use-today'

const ok = (data: TProposal): TProposalResult => ({ ok: true, data })

/** A pretend server holding the proposals still waiting. */
const makeBridge = (waiting: TProposal[]) => {
  const state = { waiting }
  const bridge: TProposalsBridge = {
    list: vi.fn(async () => ({
      ok: true as const,
      data: {
        items: state.waiting,
        nextCursor: null,
        total: state.waiting.length
      }
    })),
    create: vi.fn(async () => ok(makeProposal())),
    approve: vi.fn(async (id) =>
      ok(makeProposal({ id, status: 'approved', undoUntil: '2099-01-01' }))
    ),
    decline: vi.fn(async (id) => ok(makeProposal({ id, status: 'declined' }))),
    undo: vi.fn(async (id) => ok(makeProposal({ id, status: 'undone' }))),
    sendToOwner: vi.fn(async (id) =>
      ok(
        makeProposal({
          id,
          canDecide: false,
          approver: { id: 'dan', name: 'Dan Okafor' }
        })
      )
    )
  }
  return { bridge, state }
}

const start = async (bridge: TProposalsBridge | null) => {
  const hook = renderHook(() => useToday(null, bridge))
  if (bridge)
    await waitFor(() => expect(hook.result.current.state).toBe('ready'))
  return hook
}

describe('useToday', () => {
  afterEach(cleanup)

  it('loads what waits for me and counts it for the sidebar', async () => {
    const { bridge } = makeBridge([
      makeProposal({ id: 'p2', createdAt: '2026-11-10T10:00:00.000Z' }),
      makeProposal({ id: 'p1', createdAt: '2026-11-10T09:00:00.000Z' })
    ])
    const { result } = await start(bridge)

    expect(result.current.cards.map((card) => card.proposal.id)).toEqual([
      'p2',
      'p1'
    ])
    expect(result.current.waitingCount).toBe(2)
  })

  it('stays calm and empty where there’s no server to ask', async () => {
    const { result } = await start(null)
    expect(result.current).toMatchObject({
      isAvailable: false,
      state: 'ready',
      cards: [],
      waitingCount: 0
    })
  })

  it('says so when the list can’t be loaded', async () => {
    const { bridge } = makeBridge([])
    bridge.list = vi.fn(async () => ({
      ok: false as const,
      message: 'Couldn’t reach the server.'
    }))
    const hook = renderHook(() => useToday(null, bridge))
    await waitFor(() => expect(hook.result.current.state).toBe('error'))
    expect(hook.result.current.problem).toBe('Couldn’t reach the server.')
  })

  it('keeps an approved card on screen for Undo, and takes it off the count', async () => {
    const { bridge, state } = makeBridge([
      makeProposal({ id: 'p1' }),
      makeProposal({ id: 'p2' })
    ])
    const { result } = await start(bridge)

    await act(() => result.current.approve('p1', { version: 3 }))
    expect(bridge.approve).toHaveBeenCalledWith('p1', { version: 3 })
    expect(result.current.waitingCount).toBe(1)

    // The server no longer lists it; the Done row stays for this visit.
    state.waiting = [makeProposal({ id: 'p2' })]
    await act(() => result.current.reload())
    expect(
      result.current.cards.map((card) => [
        card.proposal.id,
        card.proposal.status
      ])
    ).toEqual(
      expect.arrayContaining([
        ['p1', 'approved'],
        ['p2', 'pending']
      ])
    )

    await act(() => result.current.undo('p1'))
    expect(
      result.current.cards.find((card) => card.proposal.id === 'p1')?.proposal
        .status
    ).toBe('undone')
  })

  it('drops a card someone decided elsewhere', async () => {
    const { bridge, state } = makeBridge([
      makeProposal({ id: 'p1' }),
      makeProposal({ id: 'p2' })
    ])
    const { result } = await start(bridge)

    state.waiting = [makeProposal({ id: 'p2' })]
    await act(() => result.current.reload())
    expect(result.current.cards.map((card) => card.proposal.id)).toEqual(['p2'])
  })

  it('shows the record’s current values when it changed since', async () => {
    const { bridge } = makeBridge([makeProposal({ id: 'p1' })])
    const fresh = makeProposal({ id: 'p1', status: 'out_of_date' })
    bridge.approve = vi.fn(async () => ({
      ok: false as const,
      message: 'This changed after AI proposed it.',
      code: 'changed_since',
      proposal: fresh
    }))
    const { result } = await start(bridge)

    await act(() => result.current.approve('p1'))
    expect(result.current.cards[0]).toMatchObject({
      proposal: { status: 'out_of_date' },
      busy: null,
      problem: null
    })
    // Still waiting for a decision.
    expect(result.current.waitingCount).toBe(1)
  })

  it('marks a card the person may no longer approve, then sends it on', async () => {
    const { bridge } = makeBridge([makeProposal({ id: 'p1' })])
    bridge.approve = vi.fn(async () => ({
      ok: false as const,
      message: 'Only the deal’s owner can change this deal.',
      code: 'forbidden'
    }))
    const { result } = await start(bridge)

    await act(() => result.current.approve('p1'))
    expect(result.current.cards[0].noPermission).toBe(
      'Only the deal’s owner can change this deal.'
    )

    await act(() => result.current.sendToOwner('p1'))
    expect(result.current.cards[0]).toMatchObject({
      noPermission: null,
      proposal: { canDecide: false, approver: { name: 'Dan Okafor' } }
    })
    expect(result.current.waitingCount).toBe(0)
  })

  it('shows any other refusal on the card and leaves it waiting', async () => {
    const { bridge } = makeBridge([makeProposal({ id: 'p1' })])
    bridge.decline = vi.fn(async () => ({
      ok: false as const,
      message: 'The server didn’t answer in time.'
    }))
    const { result } = await start(bridge)

    await act(() => result.current.decline('p1', 'Wrong deal'))
    expect(bridge.decline).toHaveBeenCalledWith('p1', 'Wrong deal')
    expect(result.current.cards[0]).toMatchObject({
      problem: 'The server didn’t answer in time.',
      proposal: { status: 'pending' }
    })
  })
})
