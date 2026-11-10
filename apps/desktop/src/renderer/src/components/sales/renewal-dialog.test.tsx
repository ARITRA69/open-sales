// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RenewalDialog, type TRenewalItem } from './renewal-dialog'

const ITEM: TRenewalItem = {
  account: 'Meridian Foods',
  value: 36000,
  endDate: '2026-12-05',
  owner: 'Asha Menon'
}

const STAGES = [
  { label: 'Qualified', value: 'stage-1' },
  { label: 'Proposal', value: 'stage-2' }
]

describe('RenewalDialog', () => {
  afterEach(cleanup)

  describe('start', () => {
    it('is filled in from the contract, with the app’s own stages', () => {
      const onDone = vi.fn()
      render(
        <RenewalDialog
          item={{
            ...ITEM,
            currency: 'EUR',
            term: '5 Dec 2025 to 5 Dec 2026 (1 year)'
          }}
          mode="start"
          stages={STAGES}
          onClose={vi.fn()}
          onDone={onDone}
        />
      )

      const dialog = screen.getByRole('dialog', {
        name: 'Start the renewal for Meridian Foods?'
      })
      expect(dialog.textContent).toContain(
        'Their contract runs 5 Dec 2025 to 5 Dec 2026 (1 year).'
      )
      expect(screen.getByLabelText<HTMLInputElement>('Value (EUR)').value).toBe(
        '36,000'
      )
      expect(screen.getByLabelText<HTMLInputElement>('Owner').readOnly).toBe(
        true
      )
      expect(
        screen.getByRole('button', { name: 'Stage' }).textContent
      ).toContain('Qualified')

      fireEvent.change(screen.getByLabelText('Close date'), {
        target: { value: '2026-11-20' }
      })
      fireEvent.click(screen.getByRole('button', { name: 'Start renewal' }))

      expect(onDone).toHaveBeenCalledWith({
        mode: 'start',
        value: '36,000',
        closeDate: '2026-11-20',
        stage: 'stage-1'
      })
    })

    it('keeps the sample it was designed with when nothing else is given', () => {
      render(
        <RenewalDialog
          item={ITEM}
          mode="start"
          onClose={vi.fn()}
          onDone={vi.fn()}
        />
      )

      expect(screen.getByLabelText<HTMLInputElement>('Value').value).toBe(
        '$36,000'
      )
      expect(
        screen.getByRole('button', { name: 'Stage' }).textContent
      ).toContain('Proposal')
    })

    it('shows why it didn’t save, and waits while it does', () => {
      const onDone = vi.fn()
      render(
        <RenewalDialog
          busy
          item={ITEM}
          mode="start"
          problem="Someone changed this while you were editing."
          onClose={vi.fn()}
          onDone={onDone}
        />
      )

      expect(screen.getByRole('alert').textContent).toBe(
        'Someone changed this while you were editing.'
      )
      const start = screen.getByRole('button', {
        name: 'Start renewal, working on it'
      })
      expect(start.getAttribute('aria-busy')).toBe('true')
      fireEvent.click(start)
      expect(onDone).not.toHaveBeenCalled()
    })

    it('closes without saving', () => {
      const onClose = vi.fn()
      render(
        <RenewalDialog
          item={ITEM}
          mode="start"
          onClose={onClose}
          onDone={vi.fn()}
        />
      )
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(onClose).toHaveBeenCalled()
    })
  })

  describe('won’t renew', () => {
    const renderWont = (onDone = vi.fn()) => {
      render(
        <RenewalDialog
          item={ITEM}
          mode="wont"
          onClose={vi.fn()}
          onDone={onDone}
        />
      )
      return onDone
    }

    it('needs a reason picked first', () => {
      const onDone = renderWont()
      const confirm = screen.getByRole('button', {
        name: "Mark as won't renew"
      })
      expect(confirm.hasAttribute('disabled')).toBe(true)

      const choice = screen.getByRole('button', { name: 'Stopped using it' })
      fireEvent.click(choice)
      expect(choice.getAttribute('aria-pressed')).toBe('true')
      fireEvent.click(confirm)

      expect(onDone).toHaveBeenCalledWith({
        mode: 'wont',
        reason: 'Stopped using it'
      })
    })

    it('takes a reason in the person’s own words', () => {
      const onDone = renderWont()
      const confirm = screen.getByRole('button', {
        name: "Mark as won't renew"
      })

      fireEvent.click(screen.getByRole('button', { name: 'Something else' }))
      // Picking it isn't a reason yet.
      expect(confirm.hasAttribute('disabled')).toBe(true)

      fireEvent.change(screen.getByLabelText('The reason'), {
        target: { value: '  Moving in-house ' }
      })
      fireEvent.click(confirm)

      expect(onDone).toHaveBeenCalledWith({
        mode: 'wont',
        reason: 'Moving in-house'
      })
    })

    it('offers the reasons it’s given', () => {
      render(
        <RenewalDialog
          item={ITEM}
          mode="wont"
          reasons={['Price']}
          onClose={vi.fn()}
          onDone={vi.fn()}
        />
      )
      expect(screen.getByRole('button', { name: 'Price' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'No budget' })).toBeNull()
      expect(
        screen.getByRole('button', { name: 'Something else' })
      ).toBeTruthy()
    })
  })
})
