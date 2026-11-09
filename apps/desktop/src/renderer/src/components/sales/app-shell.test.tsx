// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AppShell } from './app-shell'

const renderShell = () =>
  render(
    <AppShell sidebar={<nav>Menu</nav>} title="Pipeline">
      Page
    </AppShell>
  )

describe('AppShell', () => {
  beforeEach(() => localStorage.clear())
  afterEach(cleanup)

  it('shows the page name in the top bar', () => {
    renderShell()

    expect(screen.getByText('Pipeline').closest('header')).not.toBeNull()
  })

  it('closes and reopens the sidebar from its button', () => {
    renderShell()
    const slot = screen.getByTestId('sidebar-slot')

    expect(slot.hasAttribute('inert')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Close sidebar' }))
    expect(slot.hasAttribute('inert')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Open sidebar' }))
    expect(slot.hasAttribute('inert')).toBe(false)
  })

  it('toggles with the keyboard shortcut', () => {
    renderShell()

    fireEvent.keyDown(window, { key: 'b', metaKey: true })

    expect(screen.getByRole('button', { name: 'Open sidebar' })).toBeTruthy()
  })

  it('remembers a closed sidebar next time', () => {
    const { unmount } = renderShell()

    fireEvent.click(screen.getByRole('button', { name: 'Close sidebar' }))
    unmount()
    renderShell()

    expect(screen.getByRole('button', { name: 'Open sidebar' })).toBeTruthy()
  })
})
