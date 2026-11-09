// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Button } from './button'

describe('Button', () => {
  afterEach(cleanup)

  it('is a plain button that runs its click handler', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save</Button>)

    const button = screen.getByRole('button', { name: 'Save' })
    fireEvent.click(button)

    expect(button.getAttribute('type')).toBe('button')
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('says it is busy and ignores clicks while loading', () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>
    )

    const button = screen.getByRole('button', { name: 'Save, working on it' })
    fireEvent.click(button)

    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(onClick).not.toHaveBeenCalled()
  })

  it('becomes a link with href, and renders nothing when hidden', () => {
    const { rerender } = render(<Button href="#/deals">All deals</Button>)

    expect(
      screen.getByRole('link', { name: 'All deals' }).getAttribute('href')
    ).toBe('#/deals')

    rerender(<Button hidden>All deals</Button>)
    expect(screen.queryByText('All deals')).toBeNull()
  })

  it('takes its name from aria-label when it only has an icon', () => {
    render(<Button aria-label="Add a deal" />)

    expect(screen.getByRole('button', { name: 'Add a deal' })).toBeTruthy()
  })
})
