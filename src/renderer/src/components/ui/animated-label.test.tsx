// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'

import { AnimatedLabel } from './animated-label'

afterEach(cleanup)

it('shows its text at once on first render', () => {
  render(<AnimatedLabel>Copy</AnimatedLabel>)

  expect(screen.getByText('Copy').getAttribute('aria-hidden')).toBeNull()
})

it('swaps to new text and hides the old text from assistive tech', async () => {
  const { rerender } = render(<AnimatedLabel>Copy</AnimatedLabel>)

  rerender(<AnimatedLabel>Copied</AnimatedLabel>)

  expect(screen.getByText('Copied').getAttribute('aria-hidden')).toBeNull()
  const outgoing = screen.queryByText('Copy')
  if (outgoing) expect(outgoing.getAttribute('aria-hidden')).toBe('true')

  await waitFor(() => expect(screen.queryByText('Copy')).toBeNull())
})
