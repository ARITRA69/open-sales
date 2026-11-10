// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Calendar } from './calendar'
import { DateField } from './date-field'

const dayButton = (day: string) =>
  document.querySelector<HTMLElement>(`[data-day="${day}"]`)

describe('DateField', () => {
  afterEach(cleanup)

  it('shows the saved date in words', () => {
    render(<DateField label="Close" value="2026-11-30" onChange={vi.fn()} />)

    const input = screen.getByLabelText<HTMLInputElement>('Close')
    expect(input.value).toContain('2026')
    expect(input.value).toContain('30')
    expect(input.value).not.toBe('2026-11-30')
  })

  it('picks a day from the calendar and closes', async () => {
    const onChange = vi.fn()
    render(<DateField label="Close" value="2026-11-10" onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open the calendar' }))
    await waitFor(() => expect(dayButton('2026-11-10')).toBeTruthy())
    fireEvent.click(dayButton('2026-11-24')!)

    expect(onChange).toHaveBeenCalledWith('2026-11-24')
    await waitFor(() => expect(dayButton('2026-11-24')).toBeNull())
  })

  it('saves a typed date as soon as it reads as one', () => {
    const onChange = vi.fn()
    render(<DateField label="Close" value="" onChange={onChange} />)
    const input = screen.getByLabelText('Close')

    fireEvent.change(input, { target: { value: '2027-01' } })
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '2027-01-05' } })
    expect(onChange).toHaveBeenCalledWith('2027-01-05')

    fireEvent.change(input, { target: { value: '' } })
    expect(onChange).toHaveBeenLastCalledWith('')
  })

  it('clears from the calendar', async () => {
    const onChange = vi.fn()
    render(
      <DateField
        defaultOpen
        label="Close"
        value="2026-11-10"
        onChange={onChange}
      />
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Clear' }))

    expect(onChange).toHaveBeenCalledWith('')
  })

  it("won't open when read-only", () => {
    render(
      <DateField readOnly label="Close" value="2026-11-10" onChange={vi.fn()} />
    )

    fireEvent.click(screen.getByLabelText('Close'))

    expect(
      screen.queryByRole('button', { name: 'Open the calendar' })
    ).toBeNull()
    expect(dayButton('2026-11-10')).toBeNull()
  })
})

describe('Calendar', () => {
  afterEach(cleanup)

  const TODAY = new Date(2026, 10, 10)

  it('turns the page with the arrows', () => {
    render(<Calendar today={TODAY} value="" weekStart={0} onChange={vi.fn()} />)
    expect(dayButton('2026-11-15')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(dayButton('2026-12-25')).toBeTruthy()
    expect(dayButton('2026-11-15')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(dayButton('2026-10-15')).toBeTruthy()
  })

  it('walks the days with the keyboard, across months', async () => {
    render(
      <Calendar
        today={TODAY}
        value="2026-11-30"
        weekStart={0}
        onChange={vi.fn()}
      />
    )

    fireEvent.keyDown(dayButton('2026-11-30')!, { key: 'ArrowRight' })
    await waitFor(() =>
      expect(document.activeElement).toBe(dayButton('2026-12-01'))
    )
    // December is on show now, so its last days are too.
    expect(dayButton('2026-12-31')).toBeTruthy()

    fireEvent.keyDown(dayButton('2026-12-01')!, { key: 'PageDown' })
    await waitFor(() =>
      expect(document.activeElement).toBe(dayButton('2027-01-01'))
    )
  })

  it('jumps to a month from the list of months', () => {
    render(<Calendar today={TODAY} value="" weekStart={0} onChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { expanded: false }))
    fireEvent.click(screen.getByRole('button', { name: 'Next year' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: new Date(2027, 2, 1).toLocaleDateString(undefined, {
          month: 'long',
          year: 'numeric'
        })
      })
    )

    expect(dayButton('2027-03-15')).toBeTruthy()
  })

  it('marks today, and picks it', () => {
    const onChange = vi.fn()
    render(
      <Calendar today={TODAY} value="" weekStart={0} onChange={onChange} />
    )

    expect(dayButton('2026-11-10')?.getAttribute('aria-current')).toBe('date')

    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    expect(onChange).toHaveBeenCalledWith('2026-11-10')
  })
})
