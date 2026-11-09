// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Table, type TTableColumn, type TTableRow } from './table'

const COLUMNS: TTableColumn[] = [
  { key: 'name', label: 'Name', type: 'person', sortable: true },
  {
    key: 'role',
    label: 'Role',
    type: 'select',
    options: ['Rep', 'Manager', 'Admin']
  },
  { key: 'value', label: 'Value', sortable: true, align: 'right' }
]

const ROWS: TTableRow[] = [
  {
    id: 'priya',
    name: { text: 'Priya Shah', initials: 'PS' },
    role: 'Admin',
    value: '9,500'
  },
  {
    id: 'dan',
    name: { text: 'Dan Okafor', initials: 'DO' },
    role: { text: 'Rep', readOnly: true },
    value: '12,000'
  },
  {
    id: 'mei',
    name: { text: 'Mei Tan', initials: 'MT' },
    role: 'Manager',
    value: '800'
  }
]

// Each row's name, read from its checkbox, in the order shown.
const rowNames = () =>
  screen
    .getAllByRole('checkbox')
    .slice(1)
    .map((checkbox) =>
      checkbox.getAttribute('aria-label')?.replace('Select ', '')
    )

const openMenu = (name: string) =>
  fireEvent.keyDown(screen.getByRole('button', { name }), { key: 'Enter' })

describe('Table selection', () => {
  afterEach(cleanup)

  it('shows the bar once something is selected, and counts it', () => {
    render(<Table columns={COLUMNS} label="People" rows={ROWS} />)
    expect(screen.queryByRole('toolbar')).toBeNull()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Mei Tan' }))

    expect(screen.getByRole('toolbar').textContent).toContain('1 selected')
  })

  it('marks select-all as mixed, then selects all, then clears', () => {
    const onSelect = vi.fn()
    render(
      <Table columns={COLUMNS} label="People" rows={ROWS} onSelect={onSelect} />
    )
    const selectAll = screen.getByRole('checkbox', { name: 'Select all' })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Dan Okafor' }))
    expect(selectAll.getAttribute('aria-checked')).toBe('mixed')

    fireEvent.click(selectAll)
    expect(onSelect).toHaveBeenLastCalledWith(['priya', 'dan', 'mei'])

    fireEvent.click(selectAll)
    expect(onSelect).toHaveBeenLastCalledWith([])
  })

  it('clears the selection from the bar', async () => {
    render(
      <Table columns={COLUMNS} label="People" rows={ROWS} selected={['dan']} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))

    expect(
      screen
        .getByRole('checkbox', { name: 'Select Dan Okafor' })
        .getAttribute('aria-checked')
    ).toBe('false')
    await waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull())
  })

  it('has no checkboxes when not selectable, and no bar with noBar', () => {
    render(
      <Table columns={COLUMNS} label="People" rows={ROWS} selectable={false} />
    )
    expect(screen.queryByRole('checkbox')).toBeNull()

    cleanup()
    render(
      <Table
        noBar
        columns={COLUMNS}
        label="People"
        rows={ROWS}
        selected={['dan']}
      />
    )
    expect(screen.queryByRole('toolbar')).toBeNull()
  })
})

describe('Table sorting', () => {
  afterEach(cleanup)

  it('sorts A to Z, then Z to A, and reports each', () => {
    const onSort = vi.fn()
    render(
      <Table
        columns={COLUMNS}
        label="People"
        rows={ROWS}
        sortBy="name"
        onSort={onSort}
      />
    )
    expect(rowNames()).toEqual(['Dan Okafor', 'Mei Tan', 'Priya Shah'])

    const header = screen.getByRole('columnheader', { name: /Name/ })
    expect(header.getAttribute('aria-sort')).toBe('ascending')

    fireEvent.click(within(header).getByRole('button'))
    expect(header.getAttribute('aria-sort')).toBe('descending')
    expect(rowNames()).toEqual(['Priya Shah', 'Mei Tan', 'Dan Okafor'])
    expect(onSort).toHaveBeenCalledWith({ key: 'name', dir: -1 })
  })

  it('compares numbers as numbers, ignoring thousands commas', () => {
    render(
      <Table columns={COLUMNS} label="People" rows={ROWS} sortBy="value" />
    )

    expect(rowNames()).toEqual(['Mei Tan', 'Priya Shah', 'Dan Okafor'])
  })
})

describe('Table cells and menus', () => {
  afterEach(cleanup)

  it('shows a read-only select as plain text', () => {
    render(<Table columns={COLUMNS} label="People" rows={ROWS} />)

    expect(
      screen.queryByRole('button', { name: /Role for Dan Okafor/ })
    ).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Role for Priya Shah: Admin' })
    ).toBeTruthy()
  })

  it('changes a choice from the pill in the row', async () => {
    const onCellChange = vi.fn()
    render(
      <Table
        columns={COLUMNS}
        label="People"
        rows={ROWS}
        onCellChange={onCellChange}
      />
    )

    openMenu('Role for Mei Tan: Manager')
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Admin' }))

    expect(onCellChange).toHaveBeenCalledWith('mei', 'role', 'Admin')
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Role for Mei Tan: Admin' })
      ).toBeTruthy()
    )
  })

  it('tells which row a menu item was picked on', async () => {
    const onMenu = vi.fn()
    render(
      <Table
        columns={COLUMNS}
        label="People"
        menuItems={[{ label: 'Remove' }]}
        rows={ROWS}
        onMenu={onMenu}
      />
    )

    openMenu('More for Dan Okafor')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove' }))

    expect(onMenu).toHaveBeenCalledWith('Remove', 'dan')
  })
})

describe('Table states', () => {
  afterEach(cleanup)

  it('shows placeholders and no rows while loading', () => {
    render(
      <Table columns={COLUMNS} label="People" rows={ROWS} state="loading" />
    )

    expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy()
    expect(screen.queryByText('Priya Shah')).toBeNull()
  })

  it('shows its own empty copy and action', () => {
    const onEmptyAction = vi.fn()
    render(
      <Table
        columns={COLUMNS}
        emptyAction="Import people"
        emptyTitle="No people yet"
        label="People"
        rows={[]}
        state="empty"
        onEmptyAction={onEmptyAction}
      />
    )

    expect(screen.getByText('No people yet')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Import people' }))
    expect(onEmptyAction).toHaveBeenCalledOnce()
  })

  it('uses the standard copy for no results and errors', () => {
    render(<Table columns={COLUMNS} label="People" rows={[]} state="none" />)
    expect(screen.getByText('Nothing matches')).toBeTruthy()

    cleanup()
    render(<Table columns={COLUMNS} label="People" rows={[]} state="error" />)
    expect(screen.getByRole('alert').textContent).toContain("This didn't load")
  })

  it('takes away a removed row', async () => {
    const { rerender } = render(
      <Table columns={COLUMNS} label="People" rows={ROWS} />
    )

    rerender(<Table columns={COLUMNS} label="People" rows={ROWS.slice(1)} />)

    await waitFor(() => expect(screen.queryByText('Priya Shah')).toBeNull())
    expect(screen.getByText('Mei Tan')).toBeTruthy()
  })
})

describe('Table opening rows', () => {
  afterEach(cleanup)

  it('has nothing to open without onRowClick or rowHref', () => {
    render(<Table columns={COLUMNS} label="People" rows={ROWS} />)

    expect(screen.queryByRole('button', { name: /^Open / })).toBeNull()
  })

  it('opens a row from its button, with the row', () => {
    const onRowClick = vi.fn()
    render(
      <Table
        columns={COLUMNS}
        label="People"
        rows={ROWS}
        onRowClick={onRowClick}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open Mei Tan' }))

    expect(onRowClick).toHaveBeenCalledWith(ROWS[2])
  })

  it('leaves the controls in a row to themselves', () => {
    const onRowClick = vi.fn()
    render(
      <Table
        columns={COLUMNS}
        label="People"
        rows={ROWS}
        onRowClick={onRowClick}
      />
    )

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Mei Tan' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Role for Mei Tan: Manager' })
    )

    expect(onRowClick).not.toHaveBeenCalled()
  })

  it('makes each row a real link with rowHref, skipping rows without one', () => {
    const onRowClick = vi.fn()
    render(
      <Table
        columns={COLUMNS}
        label="People"
        rowHref={(row) => (row.id === 'dan' ? undefined : `#/people/${row.id}`)}
        rows={ROWS}
        onRowClick={onRowClick}
      />
    )

    const link = screen.getByRole('link', { name: 'Open Priya Shah' })
    expect(link.getAttribute('href')).toBe('#/people/priya')

    fireEvent.click(link)
    expect(onRowClick).toHaveBeenCalledWith(ROWS[0])

    fireEvent.click(link, { metaKey: true })
    expect(onRowClick).toHaveBeenCalledOnce()

    expect(screen.queryByRole('link', { name: 'Open Dan Okafor' })).toBeNull()
  })
})

describe('Table column resize', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  const fakeHeaderWidths = (width = 200) => {
    const original = Element.prototype.getBoundingClientRect
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: Element) {
        return this.getAttribute('role') === 'columnheader'
          ? ({ width } as DOMRect)
          : original.call(this)
      }
    )
  }

  const columnsTrack = () =>
    screen
      .getByRole('table', { name: 'People' })
      .style.getPropertyValue('--table-columns')

  it('has no handles unless asked', () => {
    render(<Table columns={COLUMNS} label="People" rows={ROWS} />)

    expect(screen.queryByRole('separator')).toBeNull()
  })

  it('puts a handle on every column with a resizable one after it', () => {
    render(<Table resizable columns={COLUMNS} label="People" rows={ROWS} />)

    expect(
      screen
        .getAllByRole('separator')
        .map((handle) => handle.getAttribute('aria-label'))
    ).toEqual(['Resize the Name column', 'Resize the Role column'])
  })

  it('moves an edge with the arrow keys, trading with the next column', () => {
    fakeHeaderWidths()
    const onColumnResize = vi.fn()
    render(
      <Table
        resizable
        columns={COLUMNS}
        label="People"
        rows={ROWS}
        onColumnResize={onColumnResize}
      />
    )

    fireEvent.keyDown(
      screen.getByRole('separator', { name: 'Resize the Name column' }),
      {
        key: 'ArrowRight'
      }
    )

    expect(onColumnResize).toHaveBeenCalledWith({
      name: 216,
      role: 184,
      value: 200
    })
    expect(columnsTrack()).toContain('216fr')
  })

  it('stops a column at its partner’s minimum', () => {
    fakeHeaderWidths(120)
    const onColumnResize = vi.fn()
    render(
      <Table
        resizable
        columns={COLUMNS}
        label="People"
        rows={ROWS}
        onColumnResize={onColumnResize}
      />
    )

    fireEvent.keyDown(
      screen.getByRole('separator', { name: 'Resize the Name column' }),
      {
        key: 'ArrowRight'
      }
    )

    // Role is a select column, which won't go under 112.
    expect(onColumnResize).toHaveBeenCalledWith({
      name: 128,
      role: 112,
      value: 120
    })
  })

  it('drags, reports once at the end, and resets on double-click', () => {
    fakeHeaderWidths()
    const onColumnResize = vi.fn()
    render(
      <Table
        resizable
        columns={COLUMNS}
        label="People"
        rows={ROWS}
        onColumnResize={onColumnResize}
      />
    )
    const handle = screen.getByRole('separator', {
      name: 'Resize the Role column'
    })

    fireEvent.pointerDown(handle, { button: 0, clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 70, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 60, pointerId: 1 })
    expect(onColumnResize).not.toHaveBeenCalled()

    fireEvent.pointerUp(handle, { pointerId: 1 })
    expect(onColumnResize).toHaveBeenCalledOnce()
    expect(onColumnResize).toHaveBeenCalledWith({
      name: 200,
      role: 160,
      value: 240
    })

    fireEvent.doubleClick(handle)
    expect(onColumnResize).toHaveBeenLastCalledWith(null)
    expect(columnsTrack()).not.toContain('fr,')
    expect(columnsTrack()).toContain('minmax(0, 1fr)')
  })

  it('starts from saved widths', () => {
    render(
      <Table
        resizable
        columns={COLUMNS}
        defaultColumnWidths={{ name: 300, role: 150, value: 120 }}
        label="People"
        rows={ROWS}
      />
    )

    expect(columnsTrack()).toContain('300fr')
  })
})
