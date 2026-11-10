import type { KeyboardEvent, PointerEvent } from 'react'

import { DragDropVerticalIcon } from '@hugeicons/core-free-icons'

import { Icon } from '@/components/ui/icon'

type TReorderHandleProps = {
  // What's being moved, like "Proposal".
  name: string
  onPointerDown: (event: PointerEvent) => void
  // -1 is up, 1 is down.
  onMove: (by: -1 | 1) => void
}

/**
 * The grip at the start of a row you can reorder. Drag it, or focus it and
 * press the up and down arrows.
 */
export const ReorderHandle = ({
  name,
  onPointerDown,
  onMove
}: TReorderHandleProps) => {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    onMove(event.key === 'ArrowUp' ? -1 : 1)
  }

  return (
    <button
      aria-label={`Reorder ${name}. Drag, or press the up and down arrows.`}
      className="flex h-8 w-5 flex-none cursor-grab touch-none items-center justify-center rounded-sm text-faint transition-colors duration-150 outline-none hover:text-foreground active:cursor-grabbing keyboard-focus:text-foreground keyboard-focus:shadow-(--halo-keyboard)"
      type="button"
      onKeyDown={handleKeyDown}
      onPointerDown={onPointerDown}
    >
      <Icon icon={DragDropVerticalIcon} size={16} />
    </button>
  )
}

/** A list with one item moved up or down a place; unchanged at the ends. */
export const moveBy = <TItem,>(
  items: TItem[],
  index: number,
  by: -1 | 1
): TItem[] => {
  const target = index + by
  if (index < 0 || target < 0 || target >= items.length) return items
  const next = [...items]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}
