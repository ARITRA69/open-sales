// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { toIsoDay } from '@/lib/dates'

import { LostDealDialog, WonDealDialog } from './close-deal-dialog'
import { DAN, makeBridge, makeDeal, PIPELINE } from './test-data'

const DEAL = makeDeal({
  id: 'd1',
  name: 'Platform rollout',
  valueMinor: 4_800_000,
  closeDate: '2026-12-15',
  version: 3
})

afterEach(cleanup)

describe('WonDealDialog', () => {
  const renderWon = (deal = DEAL, bridgeOf = makeBridge([deal])) => {
    const handlers = { onClosed: vi.fn(), onCancel: vi.fn() }
    render(
      <WonDealDialog
        {...handlers}
        bridge={bridgeOf.bridge}
        deal={deal}
        pipeline={PIPELINE}
      />
    )
    return { ...handlers, ...bridgeOf }
  }

  it('asks to confirm the final value and the day it closed, starting from today', () => {
    renderWon()
    expect(
      screen.getByRole('dialog', { name: 'Close Platform rollout as won' })
    ).toBeTruthy()
    const value = screen.getByLabelText('Final value (USD)') as HTMLInputElement
    expect(value.value).toBe('48000')
    const closedOn = screen.getByLabelText('Closed on') as HTMLInputElement
    // Today, not the day it was expected to close.
    expect(closedOn.value).toContain(String(new Date().getFullYear()))
    expect(closedOn.value).not.toBe('')
  })

  it('moves the deal to Won with the confirmed value, against the version on screen', async () => {
    const { calls, onClosed } = renderWon()
    fireEvent.change(screen.getByLabelText('Final value (USD)'), {
      target: { value: '45,000' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Mark as won' }))

    await waitFor(() => expect(onClosed).toHaveBeenCalledOnce())
    expect(calls.update).toEqual([
      [
        'deals',
        'd1',
        {
          stageId: 'won',
          valueMinor: 4_500_000,
          closeDate: toIsoDay(new Date()),
          version: 3
        }
      ]
    ])
    expect(onClosed.mock.calls[0][0]).toMatchObject({
      status: 'won',
      valueMinor: 4_500_000
    })
  })

  it('won’t send an amount it can’t read', () => {
    const { calls, onClosed } = renderWon()
    fireEvent.change(screen.getByLabelText('Final value (USD)'), {
      target: { value: 'lots' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Mark as won' }))

    expect(screen.getByRole('alert').textContent).toBe(
      'Enter an amount like 12,500.'
    )
    expect(calls.update).toHaveLength(0)
    expect(onClosed).not.toHaveBeenCalled()
  })

  it('changes nothing when cancelled', () => {
    const { calls, onCancel, onClosed } = renderWon()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onClosed).not.toHaveBeenCalled()
    expect(calls.update).toHaveLength(0)
  })

  it('says when someone changed the deal first, then closes their version', async () => {
    const bridgeOf = makeBridge([
      { ...DEAL, version: 4, valueMinor: 5_000_000 }
    ])
    const update = bridgeOf.bridge.update
    bridgeOf.bridge.update = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        message: 'Someone changed this while you were editing.',
        code: 'changed_since'
      })
      .mockImplementation(update)
    const { onClosed } = renderWon(DEAL, bridgeOf)

    fireEvent.click(screen.getByRole('button', { name: 'Mark as won' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Someone changed this while you were editing.'
    )
    expect(onClosed).not.toHaveBeenCalled()
    // Their value replaces the one on screen.
    await waitFor(() =>
      expect(
        (screen.getByLabelText('Final value (USD)') as HTMLInputElement).value
      ).toBe('50000')
    )

    fireEvent.click(screen.getByRole('button', { name: 'Mark as won' }))
    await waitFor(() => expect(onClosed).toHaveBeenCalledOnce())
    expect(bridgeOf.calls.update[0][2]).toMatchObject({
      stageId: 'won',
      valueMinor: 5_000_000,
      version: 4
    })
  })

  it('shows who owns a deal this person can’t close, quietly, with nothing to send', () => {
    const { onCancel } = renderWon(
      makeDeal({
        id: 'd2',
        name: 'Store pilot',
        owner: DAN,
        canEdit: false
      })
    )
    expect(screen.getByText(/^Owned by Dan Okafor\./)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Mark as won' })).toBeNull()
    expect(screen.queryByLabelText('Final value (USD)')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })
})

describe('LostDealDialog', () => {
  const renderLost = (pipeline = PIPELINE, deal = DEAL) => {
    const bridgeOf = makeBridge([deal])
    const handlers = { onClosed: vi.fn(), onCancel: vi.fn() }
    render(
      <LostDealDialog
        {...handlers}
        bridge={bridgeOf.bridge}
        deal={deal}
        pipeline={pipeline}
      />
    )
    return { ...handlers, ...bridgeOf }
  }

  const pickReason = async (label: string) => {
    fireEvent.click(screen.getByRole('button', { name: 'Why it was lost' }))
    fireEvent.click(await screen.findByRole('option', { name: label }))
  }

  it('needs a reason before it sends anything', () => {
    const { calls, onClosed } = renderLost()
    fireEvent.click(screen.getByRole('button', { name: 'Mark as lost' }))
    expect(screen.getByRole('alert').textContent).toBe(
      'Choose why it was lost.'
    )
    expect(calls.update).toHaveLength(0)
    expect(onClosed).not.toHaveBeenCalled()
  })

  it('offers the workspace’s reasons and sends the one picked, with the note', async () => {
    const { calls, onClosed } = renderLost()
    fireEvent.click(screen.getByRole('button', { name: 'Why it was lost' }))
    expect(
      (await screen.findAllByRole('option')).map((option) => option.textContent)
    ).toEqual(['Price', 'Bad timing'])
    fireEvent.click(screen.getByRole('option', { name: 'Bad timing' }))
    fireEvent.change(screen.getByLabelText('Note (optional)'), {
      target: { value: 'Budget moved to next year' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Mark as lost' }))

    await waitFor(() => expect(onClosed).toHaveBeenCalledOnce())
    expect(calls.update).toEqual([
      [
        'deals',
        'd1',
        {
          stageId: 'lost',
          lostReasonId: 'timing',
          lostNote: 'Budget moved to next year',
          version: 3
        }
      ]
    ])
    expect(onClosed.mock.calls[0][0]).toMatchObject({ status: 'lost' })
  })

  it('clears the reminder once a reason is picked, and the note stays optional', async () => {
    const { calls, onClosed } = renderLost()
    fireEvent.click(screen.getByRole('button', { name: 'Mark as lost' }))
    expect(screen.getByRole('alert')).toBeTruthy()
    await pickReason('Price')
    expect(screen.queryByRole('alert')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Mark as lost' }))
    await waitFor(() => expect(onClosed).toHaveBeenCalledOnce())
    expect(calls.update[0][2]).toMatchObject({
      lostReasonId: 'price',
      lostNote: ''
    })
  })

  it('changes nothing when cancelled', async () => {
    const { calls, onCancel } = renderLost()
    await pickReason('Price')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
    expect(calls.update).toHaveLength(0)
  })

  it('says so when the workspace has no reasons yet', () => {
    renderLost({ ...PIPELINE, lostReasons: [] })
    expect(screen.getByText(/no lost reasons to choose from yet/)).toBeTruthy()
    expect(
      (
        screen.getByRole('button', {
          name: 'Mark as lost'
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true)
    expect(screen.queryByRole('button', { name: 'Why it was lost' })).toBeNull()
  })

  it('shows who owns a deal this person can’t close', () => {
    renderLost(
      PIPELINE,
      makeDeal({ id: 'd2', name: 'Store pilot', owner: DAN, canEdit: false })
    )
    expect(screen.getByText(/^Owned by Dan Okafor\./)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Mark as lost' })).toBeNull()
  })
})
