// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FilterMenu, FilterToolbar, type TFilter } from './filter-menu'

const STAGE_OPTIONS = [
  { label: 'Trial', count: 5 },
  { label: 'Proposal', count: 3 }
]

describe('FilterMenu', () => {
  afterEach(cleanup)

  it('names the filter, then the one choice, then how many', () => {
    const { rerender } = render(
      <FilterMenu
        name="Stage"
        options={STAGE_OPTIONS}
        picked={[]}
        onPickedChange={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: 'Stage' })).toBeTruthy()

    rerender(
      <FilterMenu
        name="Stage"
        options={STAGE_OPTIONS}
        picked={['Trial']}
        onPickedChange={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: 'Stage: Trial' })).toBeTruthy()

    rerender(
      <FilterMenu
        name="Stage"
        options={STAGE_OPTIONS}
        picked={['Trial', 'Proposal']}
        onPickedChange={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: 'Stage: 2' })).toBeTruthy()
  })

  it('adds and removes choices, showing their counts', async () => {
    const onPickedChange = vi.fn()
    render(
      <FilterMenu
        name="Stage"
        options={STAGE_OPTIONS}
        picked={['Trial']}
        onPickedChange={onPickedChange}
      />
    )

    fireEvent.keyDown(screen.getByRole('button', { name: 'Stage: Trial' }), {
      key: 'Enter'
    })
    const proposal = await screen.findByRole('menuitemcheckbox', {
      name: /Proposal/
    })
    expect(proposal.textContent).toContain('3')

    fireEvent.click(proposal)
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Trial/ }))

    expect(onPickedChange).toHaveBeenNthCalledWith(1, ['Trial', 'Proposal'])
    expect(onPickedChange).toHaveBeenNthCalledWith(2, [])
  })
})

describe('FilterToolbar', () => {
  afterEach(cleanup)

  const filters: TFilter[] = [
    { key: 'stage', name: 'Stage', options: STAGE_OPTIONS }
  ]

  const renderToolbar = (query = '', picked: Record<string, string[]> = {}) => {
    const handlers = {
      onQueryChange: vi.fn(),
      onPickedChange: vi.fn(),
      onClear: vi.fn()
    }
    render(
      <FilterToolbar
        {...handlers}
        countLabel="2 of 8 deals"
        filters={filters}
        label="Filter deals"
        picked={picked}
        query={query}
        searchPlaceholder="Search deals"
      />
    )
    return handlers
  }

  it('offers "Clear filters" only once something is on', () => {
    renderToolbar()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull()

    cleanup()
    const { onClear } = renderToolbar('', { stage: ['Trial'] })
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(onClear).toHaveBeenCalledOnce()
  })

  it('passes on what is typed and shows the count', () => {
    const { onQueryChange } = renderToolbar()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search deals' }), {
      target: { value: 'lumen' }
    })

    expect(onQueryChange).toHaveBeenCalledWith('lumen')
    expect(screen.getByText('2 of 8 deals')).toBeTruthy()
  })
})
