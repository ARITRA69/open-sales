// @vitest-environment happy-dom
import { useState } from 'react'

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Button } from './button'
import { ConfirmDialog, Dialog } from './dialog'

describe('Dialog', () => {
  afterEach(cleanup)

  it('shows its title, description and footer', () => {
    render(
      <Dialog
        open
        description="Saved to the account."
        footer={<Button>Save</Button>}
        title="Edit contact"
      >
        <p>Body</p>
      </Dialog>
    )

    const dialog = screen.getByRole('dialog', { name: 'Edit contact' })
    expect(dialog.textContent).toContain('Saved to the account.')
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
  })

  it('returns focus to the button that opened it', async () => {
    const Opener = () => {
      const [isOpen, setIsOpen] = useState(false)
      return (
        <>
          <Button onClick={() => setIsOpen(true)}>Edit</Button>
          <Dialog open={isOpen} title="Edit contact" onOpenChange={setIsOpen}>
            <Button onClick={() => setIsOpen(false)}>Done</Button>
          </Dialog>
        </>
      )
    }
    render(<Opener />)

    const opener = screen.getByRole('button', { name: 'Edit' })
    opener.focus()
    fireEvent.click(opener)
    fireEvent.click(await screen.findByRole('button', { name: 'Done' }))

    await waitFor(() => expect(document.activeElement).toBe(opener))
  })
})

describe('ConfirmDialog', () => {
  afterEach(cleanup)

  it('confirms or cancels', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <ConfirmDialog
        open
        body="This can't be undone."
        confirmLabel="Delete"
        title="Delete 3 deals?"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('shows the action is running and blocks a second press', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        busy
        open
        body="Removing them now."
        confirmLabel="Delete"
        title="Delete 3 deals?"
        onConfirm={onConfirm}
      />
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Delete, working on it' })
    )

    expect(onConfirm).not.toHaveBeenCalled()
  })
})
