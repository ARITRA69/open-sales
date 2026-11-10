// @vitest-environment happy-dom
import type { TContractCandidate } from '@open-sales/shared'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AddContractDialog } from './add-contract-dialog'

const CANDIDATE: TContractCandidate = {
  deal: { id: 'won-1', name: 'Platform rollout' },
  company: { id: 'halden', name: 'Halden Capital' },
  owner: { id: 'u1', name: 'Asha Menon' },
  valueMinor: 3_600_000,
  currency: 'USD',
  closeDate: '2026-11-01',
  suggestedStartsOn: '2026-11-01',
  suggestedRenewsOn: '2027-11-01',
  canEdit: true
}

const renderDialog = (candidate = CANDIDATE) => {
  const onSubmit = vi.fn()
  render(
    <AddContractDialog
      candidate={candidate}
      onClose={vi.fn()}
      onSubmit={onSubmit}
    />
  )
  return onSubmit
}

const submit = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Add contract' }))

describe('AddContractDialog', () => {
  afterEach(cleanup)

  it('starts from the won deal: its value, and a year from the suggested start', () => {
    const onSubmit = renderDialog()

    const dialog = screen.getByRole('dialog', {
      name: 'Add a contract for Halden Capital'
    })
    expect(dialog.textContent).toContain(
      'From the won deal “Platform rollout”.'
    )
    expect(screen.getByLabelText<HTMLInputElement>('Value (USD)').value).toBe(
      '36000'
    )
    expect(screen.getByRole('button', { name: 'Term' }).textContent).toContain(
      '1 year'
    )

    submit()
    expect(onSubmit).toHaveBeenCalledWith({
      dealId: 'won-1',
      startsOn: '2026-11-01',
      renewsOn: '2027-11-01',
      valueMinor: 3_600_000
    })
  })

  it('moves the renewal date with the start date, keeping the term', () => {
    const onSubmit = renderDialog()
    fireEvent.change(screen.getByLabelText('Start date'), {
      target: { value: '2026-12-15' }
    })
    submit()
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        startsOn: '2026-12-15',
        renewsOn: '2027-12-15'
      })
    )
  })

  it('sets the renewal date from the term picked', async () => {
    const onSubmit = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Term' }))
    fireEvent.click(await screen.findByRole('option', { name: '2 years' }))
    submit()
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ renewsOn: '2028-11-01' })
    )
  })

  it('calls dates that aren’t a usual term “Another length”', () => {
    renderDialog()
    fireEvent.change(screen.getByLabelText('Renewal date'), {
      target: { value: '2027-03-20' }
    })
    expect(screen.getByRole('button', { name: 'Term' }).textContent).toContain(
      'Another length'
    )
  })

  it('says what’s wrong under the field, and saves nothing', () => {
    const onSubmit = renderDialog({ ...CANDIDATE, valueMinor: null })

    submit()
    expect(screen.getByText('Enter the contract’s value')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Value (USD)'), {
      target: { value: 'lots' }
    })
    submit()
    expect(screen.getByText('Enter an amount like 12,500.')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Value (USD)'), {
      target: { value: '12,500' }
    })
    fireEvent.change(screen.getByLabelText('Renewal date'), {
      target: { value: '2026-10-01' }
    })
    submit()
    expect(
      screen.getByText('The renewal date must be after the start date')
    ).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows the server’s refusal', () => {
    render(
      <AddContractDialog
        candidate={CANDIDATE}
        problem="This deal already has a contract."
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    )
    expect(screen.getByRole('alert').textContent).toBe(
      'This deal already has a contract.'
    )
  })
})
