import { useRef, useState, type ReactNode } from 'react'

import {
  ArrowDown02Icon,
  MoreHorizontalIcon,
  Sorting05Icon
} from '@hugeicons/core-free-icons'
import { AnimatePresence, motion } from 'motion/react'

import { Link } from '@/components/shared/link'
import { useLocale } from '@/hooks/use-locale'
import type { TCssVariables } from '@/lib/css-variables'
import { cn } from '@/lib/utils'

import { Button } from './button'
import { Checkbox } from './controls'
import { FloatBar, type TFloatBarAction } from './float-bar'
import { Icon } from './icon'
import { Menu, type TMenuItem } from './menu'
import { SkeletonRows, StatePanel } from './state-panel'
import {
  ABOVE_ROW_LINK,
  cellText,
  TableCell,
  type TTableColumn,
  type TTableRow
} from './table-cells'
import {
  gridTemplateOf,
  ResizeHandle,
  useColumnResize,
  type TTableColumnWidths
} from './table-resize'

export type { TTableCellValue, TTableColumn, TTableRow } from './table-cells'
export type { TTableColumnWidths } from './table-resize'

export type TTableSort = { key: string; dir: 1 | -1 }

type TTableState = 'ready' | 'loading' | 'empty' | 'none' | 'error'

const PANEL_FOR_STATE = {
  empty: 'first',
  none: 'none',
  error: 'error'
} as const

const FADE = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.15 }
}

const ROW_SPRING = {
  type: 'spring' as const,
  stiffness: 480,
  damping: 42,
  mass: 0.8
}

// Checkboxes and the row menu wait for hover, but stay for the keyboard, touch,
// an open menu, or once anything is selected.
const HOVER_REVEAL =
  'opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100 group-data-any/table:opacity-100 pointer-coarse:opacity-100'

const compareText = (a: string, b: string) =>
  a
    .replace(/,/g, '')
    .localeCompare(b.replace(/,/g, ''), undefined, { numeric: true })

type TTableProps = {
  // Names the table to assistive tech.
  label: string
  columns: TTableColumn[]
  rows: TTableRow[]
  state?: TTableState
  density?: 'normal' | 'compact'
  selectable?: boolean
  // Selected row ids. With `onSelect` as well, the parent owns the selection.
  selected?: string[]
  onSelect?: (selectedIds: string[]) => void
  // A column to start sorted by, A to Z.
  sortBy?: string
  onSort?: (sort: TTableSort) => void
  // The row menu. Leave it empty for rows without one.
  menuItems?: TMenuItem[]
  onMenu?: (label: string, rowId: string) => void
  onCellChange?: (rowId: string, columnKey: string, choice: string) => void
  // Lets people drag the edges between columns.
  resizable?: boolean
  // Widths saved from `onColumnResize`, to start from.
  defaultColumnWidths?: TTableColumnWidths
  // After a drag, an arrow-key step, or a reset (null).
  onColumnResize?: (widths: TTableColumnWidths | null) => void
  // Makes the whole row open something.
  onRowClick?: (row: TTableRow) => void
  // Makes the whole row a link. Return nothing to leave a row out.
  rowHref?: (row: TTableRow) => string | undefined
  // Actions on the bar that appears once rows are selected.
  barActions?: TFloatBarAction[]
  // Leaves the selection bar out, for screens that show their own.
  noBar?: boolean
  // What the `empty` panel says.
  emptyTitle?: string
  emptyBody?: string
  emptyAction?: string
  onEmptyAction?: () => void
}

/**
 * Rows of data with hairlines between them. Checkboxes and the row menu show on
 * hover; selecting rows brings up a bar of actions. Rows fade in and out and
 * glide into place when sorted.
 */
export const Table = ({
  label,
  columns,
  rows,
  state = 'ready',
  density = 'normal',
  selectable = true,
  selected,
  onSelect,
  sortBy,
  onSort,
  menuItems = [],
  onMenu,
  onCellChange,
  resizable = false,
  defaultColumnWidths,
  onColumnResize,
  onRowClick,
  rowHref,
  barActions = [],
  noBar = false,
  emptyTitle,
  emptyBody,
  emptyAction,
  onEmptyAction
}: TTableProps) => {
  const { t } = useLocale()

  const tableRef = useRef<HTMLDivElement>(null)

  const [ownSelection, setOwnSelection] = useState<string[]>(selected ?? [])
  const [sort, setSort] = useState<TTableSort | null>(
    sortBy ? { key: sortBy, dir: 1 } : null
  )
  const [picks, setPicks] = useState<Record<string, string>>({})

  const resize = useColumnResize({
    tableRef,
    columns,
    defaultWidths: defaultColumnWidths,
    onResize: onColumnResize
  })

  const selection = onSelect && selected ? selected : ownSelection
  const hasMenu = menuItems.length > 0
  const isCompact = density === 'compact'
  const isReady = state === 'ready'

  const setSelection = (next: string[]) => {
    setOwnSelection(next)
    onSelect?.(next)
  }

  const textOf = (row: TTableRow, key: string) =>
    picks[`${row.id}:${key}`] ?? cellText(row[key])

  const shownRows = sort
    ? [...rows].sort(
        (a, b) =>
          compareText(textOf(a, sort.key), textOf(b, sort.key)) * sort.dir
      )
    : rows

  const allSelected = rows.length > 0 && selection.length === rows.length
  const someSelected = selection.length > 0 && !allSelected

  const tableVariables: TCssVariables = {
    '--table-columns': gridTemplateOf({
      columns,
      widths: resizable ? resize.widths : null,
      selectable,
      hasMenu
    })
  }

  if (state === 'empty' || state === 'none' || state === 'error') {
    return (
      <AnimatePresence initial={false} mode="wait">
        <motion.div key={state} {...FADE}>
          <StatePanel
            action={state === 'empty' ? emptyAction : undefined}
            body={state === 'empty' ? emptyBody : undefined}
            kind={PANEL_FOR_STATE[state]}
            title={state === 'empty' ? emptyTitle : undefined}
            onAction={onEmptyAction}
          />
        </motion.div>
      </AnimatePresence>
    )
  }

  const header = (
    <div
      className="group/head grid min-h-8 grid-cols-(--table-columns) items-center gap-3 px-2"
      role="row"
    >
      {selectable ? (
        <span
          className={cn(
            'flex size-7 items-center justify-center',
            HOVER_REVEAL,
            'group-hover/head:opacity-100'
          )}
        >
          <Checkbox
            aria-label={t('Select all')}
            checked={
              allSelected ? true : someSelected ? 'indeterminate' : false
            }
            onCheckedChange={() =>
              setSelection(allSelected ? [] : rows.map((row) => row.id))
            }
          />
        </span>
      ) : null}
      {columns.map((column, index) => (
        <HeaderCell
          key={column.key}
          column={column}
          handle={
            resizable && isReady && resize.hasHandle(index) ? (
              <ResizeHandle
                columnLabel={column.label}
                onDrag={(change) => resize.drag(index, change)}
                onDragEnd={resize.endDrag}
                onDragStart={resize.startDrag}
                onReset={resize.reset}
                onStep={(change) => resize.step(index, change)}
              />
            ) : null
          }
          sort={sort}
          onSort={(next) => {
            setSort(next)
            onSort?.(next)
          }}
        />
      ))}
      {hasMenu ? <span aria-hidden /> : null}
    </div>
  )

  return (
    <div className="relative w-full text-foreground" data-slot="table-wrap">
      <div
        ref={tableRef}
        aria-label={label}
        className="group/table flex flex-col"
        data-any={selection.length > 0 || undefined}
        data-slot="table"
        role="table"
        style={tableVariables}
      >
        {header}
        <AnimatePresence initial={false} mode="wait">
          {state === 'loading' ? (
            <motion.div key="loading" {...FADE}>
              <SkeletonRows />
            </motion.div>
          ) : (
            <motion.div
              key="rows"
              {...FADE}
              className="relative"
              role="rowgroup"
            >
              <AnimatePresence initial={false} mode="popLayout">
                {shownRows.map((row) => {
                  const isSelected = selection.includes(row.id)
                  const rowName = textOf(row, columns[0]?.key ?? '')
                  const href = rowHref?.(row)
                  const opens = Boolean(href || onRowClick)

                  return (
                    <motion.div
                      key={row.id}
                      animate={{ opacity: 1 }}
                      aria-selected={selectable ? isSelected : undefined}
                      className={cn(
                        'group/row relative grid grid-cols-(--table-columns) items-center gap-3 rounded-row px-2 py-1 text-sm',
                        'transition-colors duration-150',
                        'before:pointer-events-none before:absolute before:inset-x-2 before:bottom-0 before:h-px before:bg-border before:transition-opacity before:duration-150',
                        'last:before:opacity-0 hover:before:opacity-0',
                        isCompact ? 'min-h-8' : 'min-h-11',
                        isSelected
                          ? 'bg-secondary before:opacity-0'
                          : 'hover:bg-muted',
                        opens && 'cursor-pointer'
                      )}
                      exit={{ opacity: 0 }}
                      initial={{ opacity: 0 }}
                      layout="position"
                      role="row"
                      transition={{
                        layout: ROW_SPRING,
                        opacity: { duration: 0.15 }
                      }}
                    >
                      {selectable ? (
                        <span
                          className={cn(
                            'flex size-7 items-center justify-center',
                            ABOVE_ROW_LINK,
                            HOVER_REVEAL
                          )}
                        >
                          <Checkbox
                            aria-label={t('Select {name}', { name: rowName })}
                            checked={isSelected}
                            onCheckedChange={() =>
                              setSelection(
                                isSelected
                                  ? selection.filter((id) => id !== row.id)
                                  : [...selection, row.id]
                              )
                            }
                          />
                        </span>
                      ) : null}
                      {columns.map((column, index) => (
                        <div
                          key={column.key}
                          className={cn(
                            'min-w-0',
                            column.align === 'right' && 'text-right'
                          )}
                          role="cell"
                        >
                          {index === 0 && opens ? (
                            <RowLink
                              href={href}
                              rowName={rowName}
                              onOpen={() => onRowClick?.(row)}
                            />
                          ) : null}
                          <TableCell
                            column={column}
                            isCompact={isCompact}
                            isRowSelected={isSelected}
                            rowName={rowName}
                            text={textOf(row, column.key)}
                            value={row[column.key]}
                            onPick={(choice) => {
                              setPicks({
                                ...picks,
                                [`${row.id}:${column.key}`]: choice
                              })
                              onCellChange?.(row.id, column.key, choice)
                            }}
                          />
                        </div>
                      ))}
                      {hasMenu ? (
                        <span
                          className={cn(
                            'flex size-8',
                            ABOVE_ROW_LINK,
                            HOVER_REVEAL
                          )}
                        >
                          <Menu
                            align="end"
                            items={menuItems.map((item) =>
                              item.line
                                ? item
                                : {
                                    ...item,
                                    onSelect: () => {
                                      item.onSelect?.()
                                      onMenu?.(item.label, row.id)
                                    }
                                  }
                            )}
                            trigger={
                              <Button
                                aria-label={t('More for {name}', {
                                  name: rowName
                                })}
                                lead={<Icon icon={MoreHorizontalIcon} />}
                                size="sm"
                                variant="ghost"
                              />
                            }
                          />
                        </span>
                      ) : null}
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {selectable && !noBar && isReady && selection.length > 0 ? (
          <div
            key="bar"
            className="pointer-events-none sticky bottom-4 z-30 mt-3 flex justify-center"
          >
            <FloatBar
              actions={barActions}
              count={selection.length}
              kind="select"
              onClose={() => setSelection([])}
            />
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

type THeaderCellProps = {
  column: TTableColumn
  sort: TTableSort | null
  handle: ReactNode
  onSort: (sort: TTableSort) => void
}

const HeaderCell = ({ column, sort, handle, onSort }: THeaderCellProps) => {
  const isSorted = sort?.key === column.key
  const isRight = column.align === 'right'

  return (
    <div
      aria-sort={
        column.sortable
          ? isSorted
            ? sort.dir === 1
              ? 'ascending'
              : 'descending'
            : 'none'
          : undefined
      }
      className={cn(
        'relative flex min-w-0 text-body-sm font-semibold whitespace-nowrap text-muted-foreground',
        isRight && 'justify-end'
      )}
      role="columnheader"
    >
      {column.sortable ? (
        <button
          className={cn(
            'inline-flex max-w-full min-w-0 items-center gap-1 rounded-sm transition-colors duration-150 outline-none hover:text-foreground keyboard-focus:shadow-(--halo-keyboard)',
            isSorted && 'text-foreground'
          )}
          type="button"
          onClick={() =>
            onSort({
              key: column.key,
              dir: isSorted && sort.dir === 1 ? -1 : 1
            })
          }
        >
          <span className="truncate">{column.label}</span>
          <Icon
            className={cn(
              'flex-none transition-transform duration-200',
              !isSorted && 'text-faint',
              isSorted && sort.dir === -1 && 'rotate-180'
            )}
            icon={isSorted ? ArrowDown02Icon : Sorting05Icon}
            size={14}
          />
        </button>
      ) : (
        <span className="truncate">{column.label}</span>
      )}
      {handle}
    </div>
  )
}

type TRowLinkProps = {
  rowName: string
  href?: string
  onOpen: () => void
}

/**
 * Stretches over the whole row, under its controls, so a click anywhere on
 * the row opens it. A real link keeps cmd-click and middle-click working, and
 * the keyboard focus ring wraps the whole row.
 */
const RowLink = ({ rowName, href, onOpen }: TRowLinkProps) => {
  const { t } = useLocale()

  const className =
    'absolute inset-0 rounded-row outline-none keyboard-focus:shadow-(--halo-keyboard)'
  const name = t('Open {name}', { name: rowName })

  return href ? (
    <Link
      aria-label={name}
      className={className}
      href={href}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) return
        onOpen()
      }}
    />
  ) : (
    <button
      aria-label={name}
      className={className}
      type="button"
      onClick={onOpen}
    />
  )
}
