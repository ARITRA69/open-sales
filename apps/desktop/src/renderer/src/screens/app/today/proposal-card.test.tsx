// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProposalCard } from './proposal-card'
import { makeCard } from './test-data'
import type { TProposalCard } from './use-today'

const NOW = new Date('2026-11-10T09:12:00.000Z')

const renderCard = (card: TProposalCard, selectable = false) => {
  const handlers = {
    onApprove: vi.fn(),
    onDecline: vi.fn(),
    onUndo: vi.fn(),
    onSendToOwner: vi.fn(),
    onSelect: vi.fn()
  }
  render(
    <ProposalCard
      card={card}
      now={NOW}
      onApprove={handlers.onApprove}
      onDecline={handlers.onDecline}
      onSelect={selectable ? handlers.onSelect : undefined}
      onSendToOwner={handlers.onSendToOwner}
      onUndo={handlers.onUndo}
    />
  )
  return handlers
}

const click = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }))

describe('ProposalCard', () => {
  afterEach(cleanup)

  it('shows the record, each old value crossed out beside the new one, and the reason', () => {
    renderCard(makeCard())

    expect(screen.getByRole('group').getAttribute('aria-label')).toBe(
      'Move Platform to Proposal'
    )
    const record = screen.getByRole('link', {
      name: 'Halden Capital · Platform'
    })
    expect(record.getAttribute('href')).toBe('#/deals/d1')

    const crossedOut = [...document.querySelectorAll('s')].map(
      (old) => old.textContent
    )
    expect(crossedOut).toEqual(['Qualified', '$18,000'])
    expect(screen.getByText('Proposal').tagName).toBe('B')
    expect(screen.getByText('$25,000').tagName).toBe('B')
    expect(screen.getByText('Dan asked for pricing by Friday')).toBeTruthy()
    expect(screen.getByText('Claude Code · 12 min ago')).toBeTruthy()
  })

  it('approves as it is', () => {
    const handlers = renderCard(makeCard())
    click('Approve')
    expect(handlers.onApprove).toHaveBeenCalledWith()
  })

  it('lets a value be edited, then approves with only what changed', () => {
    const handlers = renderCard(makeCard())
    click('Edit')

    const value = screen.getByLabelText('Value (USD)') as HTMLInputElement
    expect(value.value).toBe('25000')
    // No list of stages was passed in, so the stage stays as proposed.
    expect((screen.getByLabelText('Stage') as HTMLInputElement).readOnly).toBe(
      true
    )

    fireEvent.change(value, { target: { value: 'lots' } })
    click('Approve')
    expect(screen.getByText('Enter an amount, like 12500')).toBeTruthy()
    expect(handlers.onApprove).not.toHaveBeenCalled()

    fireEvent.change(value, { target: { value: '22,000' } })
    click('Approve')
    expect(handlers.onApprove).toHaveBeenCalledWith({
      changes: [{ field: 'valueMinor', to: 2_200_000 }]
    })
  })

  it('goes back to the proposed values when editing is cancelled', () => {
    const handlers = renderCard(makeCard())
    click('Edit')
    fireEvent.change(screen.getByLabelText('Value (USD)'), {
      target: { value: '1' }
    })
    click('Cancel')
    click('Approve')
    expect(handlers.onApprove).toHaveBeenCalledWith()
  })

  it('declines with an optional reason', () => {
    const handlers = renderCard(makeCard())
    click('Decline')
    expect(handlers.onDecline).not.toHaveBeenCalled()

    fireEvent.change(
      screen.getByLabelText('Why? It helps AI next time (optional)'),
      { target: { value: 'Wrong deal' } }
    )
    click('Decline')
    expect(handlers.onDecline).toHaveBeenCalledWith('Wrong deal')
  })

  it('shows Done with Undo until the time to undo runs out', async () => {
    vi.useFakeTimers()
    try {
      const undoUntil = new Date(Date.now() + 60_000).toISOString()
      const handlers = renderCard(makeCard({ status: 'approved', undoUntil }))

      expect(screen.getByText('Done: Move Platform to Proposal')).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
      click('Undo')
      expect(handlers.onUndo).toHaveBeenCalled()

      await act(() => vi.advanceTimersByTimeAsync(61_000))
      expect(screen.getByText('Done: Move Platform to Proposal')).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('says why an undo didn’t work', () => {
    renderCard(
      makeCard(
        {
          status: 'approved',
          undoUntil: new Date(Date.now() + 60_000).toISOString()
        },
        { problem: 'This was changed again after it was approved.' }
      )
    )
    expect(screen.getByRole('alert').textContent).toBe(
      'This was changed again after it was approved.'
    )
  })

  it('shows what the record says now when it changed since, and asks again', () => {
    const base = makeCard().proposal
    const handlers = renderCard(
      makeCard({
        status: 'out_of_date',
        target: { ...base.target, version: 2 },
        changes: [
          { ...base.changes[0], current: 's3', currentLabel: 'Discovery' },
          base.changes[1]
        ]
      })
    )

    expect(
      screen.getByText(
        'This deal changed after AI proposed this. Nothing was saved.'
      )
    ).toBeTruthy()
    expect(screen.getByText('Discovery').closest('dd')?.textContent).toBe(
      'Now Discovery, not Qualified. AI proposed Proposal.'
    )
    // The untouched field still reads old → new.
    expect(screen.getByText('$18,000').tagName).toBe('S')
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()

    click('Apply anyway')
    expect(handlers.onApprove).toHaveBeenCalledWith({ version: 2 })
    click('Dismiss')
    expect(handlers.onDecline).toHaveBeenCalledWith()
  })

  it('says so when a different field changed since', () => {
    renderCard(makeCard({ status: 'out_of_date' }))
    expect(
      screen.getByText(
        'Something else on this deal changed after AI proposed this. Check it still makes sense.'
      )
    ).toBeTruthy()
  })

  it('offers Send to owner when the server says no permission', () => {
    const handlers = renderCard(
      makeCard(
        {},
        { noPermission: 'Only the deal’s owner can change this deal.' }
      )
    )

    expect(
      screen.getByText(/Only the deal’s owner can change this deal\./)
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    click('Send to owner')
    expect(handlers.onSendToOwner).toHaveBeenCalled()
    click('Dismiss')
    expect(handlers.onDecline).toHaveBeenCalledWith()
  })

  it('goes quiet once it’s with the owner, declined or undone', () => {
    renderCard(
      makeCard({
        canDecide: false,
        approver: { id: 'dan', name: 'Dan Okafor' }
      })
    )
    expect(
      screen.getByText(
        'Sent to Dan Okafor to decide: Move Platform to Proposal'
      )
    ).toBeTruthy()
    cleanup()

    renderCard(makeCard({ status: 'declined' }))
    expect(
      screen.getByText(
        'Declined: Move Platform to Proposal. Nothing was saved.'
      )
    ).toBeTruthy()
    cleanup()

    renderCard(makeCard({ status: 'undone' }))
    expect(
      screen.getByText(
        'Undone: Move Platform to Proposal. The deal is back as it was.'
      )
    ).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('names whoever’s AI suggested it, and where it came from', () => {
    renderCard(
      makeCard({
        requestedBy: { id: 'dan', name: 'Dan Okafor' },
        engine: 'codex',
        sources: [{ type: 'email', id: 'm1', label: 'Email from Tom Becker' }]
      })
    )
    expect(
      screen.getByText(
        'Suggested by Dan Okafor · Codex · Email from Tom Becker · 12 min ago'
      )
    ).toBeTruthy()
  })

  it('shows a new record’s fields with nothing crossed out', () => {
    renderCard(
      makeCard({
        kind: 'create',
        title: 'Add Dan Okafor to Halden Capital',
        target: {
          type: 'person',
          id: null,
          name: 'Dan Okafor',
          companyName: 'Halden Capital',
          currency: null,
          version: null
        },
        changes: [
          {
            field: 'companyId',
            from: null,
            to: 'c1',
            fromLabel: null,
            toLabel: 'Halden Capital'
          },
          {
            field: 'title',
            from: null,
            to: 'CFO',
            fromLabel: null,
            toLabel: null
          }
        ]
      })
    )
    expect(document.querySelector('s')).toBeNull()
    expect(screen.getByText('Job title')).toBeTruthy()
    expect(screen.getByText('CFO').tagName).toBe('B')
    // No page for it yet, so its name isn't a link.
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('has nothing to edit when archiving', () => {
    renderCard(
      makeCard({ kind: 'archive', title: 'Archive Platform', changes: [] })
    )
    expect(
      screen.getByText('The deal moves to the archive. Restore brings it back.')
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })

  it('can be ticked for approving several at once', () => {
    const handlers = renderCard(makeCard(), true)
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Select Move Platform to Proposal' })
    )
    expect(handlers.onSelect).toHaveBeenCalledWith(true)
    cleanup()

    renderCard(makeCard())
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('shows it’s working, and why a try failed', () => {
    renderCard(
      makeCard(
        {},
        { busy: 'approve', problem: 'Choose a stage that’s in use.' }
      )
    )
    expect(
      screen
        .getByRole('button', { name: 'Approve, working on it' })
        .getAttribute('aria-busy')
    ).toBe('true')
    expect(screen.getByRole('alert').textContent).toBe(
      'Choose a stage that’s in use.'
    )
  })
})
