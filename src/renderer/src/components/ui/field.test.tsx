// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Field } from './field'

describe('Field', () => {
  afterEach(cleanup)

  it('labels the box and links the error to it', () => {
    render(<Field error="Enter a number." label="Value" />)

    const input = screen.getByLabelText('Value')
    const describedBy = input.getAttribute('aria-describedby') ?? ''

    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById(describedBy)?.textContent).toBe(
      'Enter a number.'
    )
  })

  it('names a search box after its placeholder', () => {
    render(<Field kind="search" placeholder="Search deals" />)

    expect(screen.getByRole('searchbox', { name: 'Search deals' })).toBeTruthy()
  })
})

describe('Field select', () => {
  afterEach(cleanup)

  it('shows the choice, and reports a new one', async () => {
    const onValueChange = vi.fn()
    render(
      <Field
        kind="select"
        label="Stage"
        options={['Trial', { label: 'Proposal sent', value: 'proposal' }]}
        value="Trial"
        onValueChange={onValueChange}
      />
    )

    const trigger = screen.getByRole('button', { name: 'Stage' })
    expect(trigger.textContent).toContain('Trial')

    fireEvent.click(trigger)
    fireEvent.click(
      await screen.findByRole('option', { name: 'Proposal sent' })
    )

    expect(onValueChange).toHaveBeenCalledWith('proposal')
    await waitFor(() => expect(screen.queryByRole('option')).toBeNull())
  })

  it('narrows a searchable list as you type', async () => {
    render(
      <Field
        searchable
        kind="select"
        label="Owner"
        options={['Asha Menon', 'Dan Okafor']}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Owner' }))
    fireEvent.change(await screen.findByLabelText('Search Owner'), {
      target: { value: 'dan' }
    })

    await waitFor(() =>
      expect(screen.queryByRole('option', { name: 'Asha Menon' })).toBeNull()
    )
    expect(screen.getByRole('option', { name: 'Dan Okafor' })).toBeTruthy()
  })

  it("won't open when read-only", () => {
    render(
      <Field
        readOnly
        kind="select"
        label="Owner"
        options={['Asha Menon']}
        value="Asha Menon"
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Owner' }))

    expect(screen.queryByRole('option')).toBeNull()
  })
})
