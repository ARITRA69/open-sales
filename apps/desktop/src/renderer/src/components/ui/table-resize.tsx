import {
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject
} from 'react'

import { useLocale } from '@/hooks/use-locale'

import type { TTableColumn } from './table-cells'

// Column key to width in pixels.
export type TTableColumnWidths = Record<string, number>

const KEY_STEP = 16
const CHECK_TRACK = '28px'
const MENU_TRACK = '32px'
const DEFAULT_TRACK = 'minmax(0, 1fr)'

const MIN_BY_TYPE: Partial<Record<NonNullable<TTableColumn['type']>, number>> =
  {
    person: 140,
    select: 112,
    tag: 100,
    switch: 48
  }

export const minWidthOf = (column: TTableColumn) =>
  column.minWidth ?? MIN_BY_TYPE[column.type ?? 'text'] ?? 80

const canResize = (column: TTableColumn) => column.resizable !== false

// A column left out of resizing with a fixed width keeps that width as it is.
const keepsOwnTrack = (column: TTableColumn) =>
  !canResize(column) && Boolean(column.width) && !column.width?.includes('fr')

/** The resizable column after this one, which gives or takes the space. */
const partnerOf = (columns: TTableColumn[], index: number) =>
  columns.findIndex((column, other) => other > index && canResize(column))

type TTrackArgs = {
  columns: TTableColumn[]
  widths: TTableColumnWidths | null
  selectable: boolean
  hasMenu: boolean
}

/**
 * The grid template for the header and every row. Dragged widths become `fr`
 * shares of the same size, so they land on exactly those pixels and still
 * scale together if the window changes size.
 */
export const gridTemplateOf = ({
  columns,
  widths,
  selectable,
  hasMenu
}: TTrackArgs) => {
  const hasAllWidths =
    widths !== null &&
    columns.every(
      (column) => keepsOwnTrack(column) || widths[column.key] !== undefined
    )

  const tracks = columns.map((column) => {
    if (!hasAllWidths || keepsOwnTrack(column))
      return column.width ?? DEFAULT_TRACK

    const width = widths[column.key]
    return `minmax(${Math.min(minWidthOf(column), width)}px, ${width}fr)`
  })

  return [selectable ? CHECK_TRACK : '', ...tracks, hasMenu ? MENU_TRACK : '']
    .filter(Boolean)
    .join(' ')
}

const measureHeaders = (table: HTMLElement | null) =>
  Array.from(table?.querySelectorAll('[role="columnheader"]') ?? []).map(
    (header) => header.getBoundingClientRect().width
  )

/**
 * Moves the edge between a column and the next resizable one. One grows by
 * what the other gives up, each stopping at its minimum, so the table's total
 * width never changes.
 */
const shiftEdge = (
  columns: TTableColumn[],
  widths: number[],
  index: number,
  change: number
) => {
  const partner = partnerOf(columns, index)
  if (partner === -1) return widths

  const pair = widths[index] + widths[partner]
  const lowest = Math.min(minWidthOf(columns[index]), widths[index])
  const highest = pair - Math.min(minWidthOf(columns[partner]), widths[partner])
  const nextWidth = Math.min(Math.max(widths[index] + change, lowest), highest)

  const next = [...widths]
  next[index] = nextWidth
  next[partner] = pair - nextWidth
  return next
}

const toRecord = (
  columns: TTableColumn[],
  widths: number[]
): TTableColumnWidths =>
  Object.fromEntries(
    columns.map((column, index) => [column.key, widths[index]])
  )

type TColumnResizeArgs = {
  tableRef: RefObject<HTMLElement | null>
  columns: TTableColumn[]
  defaultWidths?: TTableColumnWidths
  onResize?: (widths: TTableColumnWidths | null) => void
}

/** Widths people have dragged columns to, and the actions that change them. */
export const useColumnResize = ({
  tableRef,
  columns,
  defaultWidths,
  onResize
}: TColumnResizeArgs) => {
  const dragStart = useRef<number[] | null>(null)
  const dragLatest = useRef<TTableColumnWidths | null>(null)

  const [widths, setWidths] = useState<TTableColumnWidths | null>(
    defaultWidths ?? null
  )

  const apply = (next: number[]) => {
    const record = toRecord(columns, next)
    setWidths(record)
    return record
  }

  return {
    widths,
    hasHandle: (index: number) =>
      canResize(columns[index]) && partnerOf(columns, index) !== -1,
    startDrag: () => {
      dragStart.current = measureHeaders(tableRef.current)
      dragLatest.current = null
    },
    drag: (index: number, change: number) => {
      if (!dragStart.current) return
      dragLatest.current = apply(
        shiftEdge(columns, dragStart.current, index, change)
      )
    },
    endDrag: () => {
      if (dragLatest.current) onResize?.(dragLatest.current)
      dragStart.current = null
      dragLatest.current = null
    },
    step: (index: number, change: number) => {
      onResize?.(
        apply(
          shiftEdge(columns, measureHeaders(tableRef.current), index, change)
        )
      )
    },
    reset: () => {
      setWidths(null)
      onResize?.(null)
    }
  }
}

type TResizeHandleProps = {
  columnLabel: string
  onDragStart: () => void
  onDrag: (change: number) => void
  onDragEnd: () => void
  onStep: (change: number) => void
  onReset: () => void
}

/**
 * The grip on a column's right edge. Drag it, or focus it and use the arrow
 * keys. A double-click puts every column back.
 */
export const ResizeHandle = ({
  columnLabel,
  onDragStart,
  onDrag,
  onDragEnd,
  onStep,
  onReset
}: TResizeHandleProps) => {
  const { t } = useLocale()

  const startX = useRef<number | null>(null)

  const [isDragging, setIsDragging] = useState(false)

  const stop = () => {
    if (startX.current === null) return
    startX.current = null
    setIsDragging(false)
    onDragEnd()
  }

  return (
    <div
      aria-label={t('Resize the {column} column', { column: columnLabel })}
      aria-orientation="vertical"
      className="group/grip absolute top-1/2 -right-3 z-10 flex h-8 w-4 -translate-y-1/2 cursor-col-resize touch-none items-center justify-center outline-none select-none"
      data-dragging={isDragging || undefined}
      role="separator"
      tabIndex={0}
      title={t('Drag to resize. Double-click to reset.')}
      onDoubleClick={onReset}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        onStep(event.key === 'ArrowLeft' ? -KEY_STEP : KEY_STEP)
      }}
      onPointerCancel={stop}
      onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.currentTarget.setPointerCapture?.(event.pointerId)
        startX.current = event.clientX
        setIsDragging(true)
        onDragStart()
      }}
      onPointerMove={(event: PointerEvent<HTMLDivElement>) => {
        if (startX.current !== null) onDrag(event.clientX - startX.current)
      }}
      onPointerUp={stop}
    >
      <span
        aria-hidden
        className="h-4 w-0.5 rounded-full bg-input opacity-0 transition-[opacity,background-color] duration-150 group-hover/grip:bg-faint group-hover/head:opacity-100 group-data-dragging/grip:bg-faint group-data-dragging/grip:opacity-100 group-keyboard-focus/grip:opacity-100 group-keyboard-focus/grip:shadow-(--halo-keyboard)"
      />
    </div>
  )
}
