// @vitest-environment happy-dom
import { useState } from 'react'

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { Tabs } from './tabs'
import { ViewToggle, type TViewMode } from './view-toggle'

afterEach(cleanup)

const ControlledTabs = ({
  onChange
}: {
  onChange: (index: number) => void
}) => {
  const [active, setActive] = useState(0)
  return (
    <Tabs
      active={active}
      items={['Timeline', { label: 'Tasks', count: 4 }, 'Files']}
      onChange={(index) => {
        setActive(index)
        onChange(index)
      }}
    />
  )
}

it('selects a tab on press and with the arrow keys', async () => {
  const onChange = vi.fn()
  render(<ControlledTabs onChange={onChange} />)

  const tasks = screen.getByRole('tab', { name: /Tasks/ })
  fireEvent.mouseDown(tasks, { button: 0 })
  expect(tasks.getAttribute('aria-selected')).toBe('true')

  fireEvent.keyDown(tasks, { key: 'ArrowRight' })
  const files = screen.getByRole('tab', { name: 'Files' })
  await waitFor(() => expect(document.activeElement).toBe(files))
  expect(files.getAttribute('aria-selected')).toBe('true')
  expect(onChange).toHaveBeenCalledWith(1)
  expect(onChange).toHaveBeenLastCalledWith(2)
})

it('shows a count beside its label', () => {
  render(<ControlledTabs onChange={vi.fn()} />)

  expect(screen.getByRole('tab', { name: /Tasks/ }).textContent).toContain('4')
})

it('keeps one view chosen in the view toggle', () => {
  const onChange = vi.fn()
  const Toggle = () => {
    const [mode, setMode] = useState<TViewMode>('list')
    return (
      <ViewToggle
        value={mode}
        onChange={(next) => {
          setMode(next)
          onChange(next)
        }}
      />
    )
  }
  render(<Toggle />)

  fireEvent.click(screen.getByRole('radio', { name: 'List' }))
  expect(onChange).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('radio', { name: 'Cards' }))
  expect(onChange).toHaveBeenCalledWith('grid')
})
