// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TAskScenario } from './ask-types'
import { fillScenario, useAskSession } from './use-ask-session'

const STAGE_SCENARIO: TAskScenario = {
  id: 'catch',
  label: 'Catch me up',
  steps: ['One', 'Two', 'Three'],
  cards: [
    {
      id: 'stage',
      kind: 'stage',
      title: 'Move to Proposal',
      rows: [{ label: 'Stage', from: 'Trial', to: 'Proposal' }]
    }
  ]
}

const renderSession = (
  overrides: Partial<Parameters<typeof useAskSession>[0]> = {}
) =>
  renderHook(() => useAskSession({ scenarios: [STAGE_SCENARIO], ...overrides }))

describe('useAskSession', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('walks through the steps and then shows the answer', () => {
    const { result } = renderSession()

    act(() => result.current.startScenario(STAGE_SCENARIO))
    expect(result.current.turns[0].phase).toBe('run')

    act(() => vi.advanceTimersByTime(800))
    expect(result.current.turns[0].step).toBe(1)

    act(() => vi.advanceTimersByTime(1600))
    expect(result.current.turns[0].phase).toBe('done')
  })

  it('approves with the edited value and calls back', () => {
    const onApprove = vi.fn()
    const { result } = renderSession({ onApprove, liveStage: 'Trial' })

    act(() => result.current.startScenario(STAGE_SCENARIO))
    const turn = result.current.turns[0]
    const askCard = STAGE_SCENARIO.cards![0]

    act(() => result.current.editRow(`${turn.id}:stage`, 0, 'Won'))
    act(() => result.current.approveCard(turn, askCard))

    expect(result.current.cardStatuses[`${turn.id}:stage`]).toBe('approved')
    expect(onApprove.mock.calls[0][0].rows[0].to).toBe('Won')
    expect(onApprove.mock.calls[0][0].engine).toBe('Claude Code')
  })

  it('flags a conflict when the deal moved after AI proposed the change', () => {
    const onApprove = vi.fn()
    const { result } = renderSession({ onApprove, liveStage: 'Proposal' })

    act(() => result.current.startScenario(STAGE_SCENARIO))
    const turn = result.current.turns[0]
    const askCard = STAGE_SCENARIO.cards![0]

    act(() => result.current.approveCard(turn, askCard))
    expect(result.current.cardStatuses[`${turn.id}:stage`]).toBe('conflict')
    expect(onApprove).not.toHaveBeenCalled()

    act(() => result.current.approveCard(turn, askCard, true))
    expect(result.current.cardStatuses[`${turn.id}:stage`]).toBe('approved')
    expect(onApprove).toHaveBeenCalledOnce()
  })

  it('undo calls back only for an approved change', () => {
    const onUndo = vi.fn()
    const { result } = renderSession({ onUndo })

    act(() => result.current.startScenario(STAGE_SCENARIO))
    const turn = result.current.turns[0]
    const askCard = STAGE_SCENARIO.cards![0]

    act(() => result.current.declineCard(`${turn.id}:stage`))
    act(() => result.current.undoCard(turn, askCard))
    expect(onUndo).not.toHaveBeenCalled()

    act(() => result.current.approveCard(turn, askCard))
    act(() => result.current.undoCard(turn, askCard))
    expect(onUndo).toHaveBeenCalledOnce()
    expect(result.current.cardStatuses[`${turn.id}:stage`]).toBe('pending')
  })

  it('stops at the limit, then finishes at a normal pace on the other tool', () => {
    const { result } = renderSession({ problem: 'limit' })

    act(() => result.current.startScenario(STAGE_SCENARIO))
    act(() => vi.advanceTimersByTime(1600))
    expect(result.current.turns[0].phase).toBe('limit')

    act(() => result.current.switchToOtherEngine(result.current.turns[0]))
    expect(result.current.engine).toBe('Codex')
    expect(result.current.turns[0].phase).toBe('run')

    // The first run's timer must not also be ticking.
    act(() => vi.advanceTimersByTime(800))
    expect(result.current.turns[0].step).toBe(2)

    act(() => vi.advanceTimersByTime(800))
    expect(result.current.turns[0].phase).toBe('done')
  })

  it('waits for the notes before running a notes question', () => {
    const notesScenario = { ...STAGE_SCENARIO, askNotes: true }
    const { result } = renderSession()

    act(() => result.current.startScenario(notesScenario))
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current.turns[0].phase).toBe('notes')

    act(() => result.current.runTurn(result.current.turns[0]))
    act(() => vi.advanceTimersByTime(2400))
    expect(result.current.turns[0].phase).toBe('done')
  })

  it('clears every question and stops its timers', () => {
    const { result } = renderSession()

    act(() => result.current.startScenario(STAGE_SCENARIO))
    act(() => result.current.clearTurns())

    expect(result.current.turns).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('fillScenario', () => {
  it('writes the blank answers into the copy and leaves unknown blanks', () => {
    const filledScenario = fillScenario(
      {
        ...STAGE_SCENARIO,
        blanks: [{ key: 'seats', label: 'Seats', options: ['10', '25'] }],
        intro: 'For [seats] seats, starting [month]'
      },
      { seats: '25' }
    )

    expect(filledScenario.intro).toBe('For 25 seats, starting [month]')
  })
})
