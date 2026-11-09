// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { PickPill } from './pick-pill'

afterEach(cleanup)

it('shows the current choice and says what it picks', () => {
  render(
    <PickPill label="Role for Dan" options={['Rep', 'Admin']} value="Rep" />
  )

  expect(screen.getByRole('button', { name: 'Role for Dan: Rep' })).toBeTruthy()
})

it('shows the label of an option whose value differs', () => {
  render(
    <PickPill
      label="Stage"
      options={[{ label: 'Demo booked', value: 'demo' }]}
      value="demo"
    />
  )

  expect(
    screen.getByRole('button', { name: 'Stage: Demo booked' })
  ).toBeTruthy()
})

it('ticks the current choice and reports a new one', async () => {
  const onChange = vi.fn()
  render(
    <PickPill
      label="Role for Dan"
      options={['Rep', 'Admin']}
      value="Rep"
      onChange={onChange}
    />
  )

  fireEvent.keyDown(screen.getByRole('button', { name: 'Role for Dan: Rep' }), {
    key: 'Enter'
  })

  expect(
    (await screen.findByRole('menuitemradio', { name: 'Rep' })).getAttribute(
      'aria-checked'
    )
  ).toBe('true')

  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Admin' }))
  expect(onChange).toHaveBeenCalledWith('Admin')
})
