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
import { Menu, type TMenuItem } from './menu'

const openMenu = (name: string) =>
  fireEvent.keyDown(screen.getByRole('button', { name }), { key: 'Enter' })

describe('Menu', () => {
  afterEach(cleanup)

  it('runs an item, then closes', async () => {
    const onRename = vi.fn()
    render(
      <Menu
        items={[{ label: 'Rename', onSelect: onRename }]}
        label="Deal"
        trigger={<Button>Actions</Button>}
      />
    )

    openMenu('Actions')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }))

    expect(onRename).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })

  it('skips a disabled item', async () => {
    const onDelete = vi.fn()
    render(
      <Menu
        items={[{ label: 'Delete', disabled: true, onSelect: onDelete }]}
        trigger={<Button>Actions</Button>}
      />
    )

    openMenu('Actions')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))

    expect(onDelete).not.toHaveBeenCalled()
  })

  it('keeps open while ticking checkbox items', async () => {
    const CheckMenu = () => {
      const [checked, setChecked] = useState(false)
      const items: TMenuItem[] = [
        { label: 'Trial', checked, onSelect: () => setChecked(!checked) }
      ]
      return <Menu items={items} trigger={<Button>Stage</Button>} />
    }
    render(<CheckMenu />)

    openMenu('Stage')
    const item = await screen.findByRole('menuitemcheckbox', { name: 'Trial' })
    fireEvent.click(item)

    expect(screen.getByRole('menu')).toBeTruthy()
    expect(
      screen
        .getByRole('menuitemcheckbox', { name: 'Trial' })
        .getAttribute('aria-checked')
    ).toBe('true')
  })

  it('marks the chosen one of several', async () => {
    render(
      <Menu
        items={[
          { label: 'Rep', selected: false },
          { label: 'Admin', selected: true }
        ]}
        trigger={<Button>Role</Button>}
      />
    )

    openMenu('Role')

    expect(
      (
        await screen.findByRole('menuitemradio', { name: 'Admin' })
      ).getAttribute('aria-checked')
    ).toBe('true')
  })

  it('gives focus back to its trigger when Escape closes it', async () => {
    render(
      <Menu items={[{ label: 'Rename' }]} trigger={<Button>Actions</Button>} />
    )

    openMenu('Actions')
    fireEvent.keyDown(await screen.findByRole('menu'), { key: 'Escape' })

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Actions' })
      )
    )
  })
})
