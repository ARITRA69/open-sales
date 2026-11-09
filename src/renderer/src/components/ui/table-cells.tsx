import type { ComponentProps } from 'react'

import { useLocale } from '@/hooks/use-locale'
import { cn } from '@/lib/utils'

import { Avatar } from './bits'
import { Switch } from './controls'
import { PickPill } from './pick-pill'
import { Tag, type TDotTone } from './status'

type TAvatarTone = NonNullable<ComponentProps<typeof Avatar>['tone']>

export type TTableColumn = {
  key: string
  label: string
  type?: 'text' | 'muted' | 'strong' | 'person' | 'switch' | 'tag' | 'select'
  // The choices in a `select` column.
  options?: string[]
  sortable?: boolean
  // A grid track, like `120px` or `minmax(0, 2fr)`. Defaults to an equal share.
  width?: string
  align?: 'left' | 'right'
  // On a `resizable` table, false keeps this column at its declared width.
  resizable?: boolean
  // On a `resizable` table, the narrowest it can be dragged to, in pixels.
  minWidth?: number
}

export type TTableCellDetail = {
  text?: string
  // The second line of a person.
  sub?: string
  initials?: string
  src?: string
  tone?: TAvatarTone
  dot?: TDotTone
  // A soft tag, only where the status is the main thing on screen.
  soft?: 'success' | 'accent'
  muted?: boolean
  // A `select` cell this person can't change shows as plain text.
  readOnly?: boolean
  // A `switch` cell.
  on?: boolean
  label?: string
  onToggle?: (on: boolean) => void
}

export type TTableCellValue = string | TTableCellDetail

export type TTableRow = { id: string } & Record<
  string,
  TTableCellValue | undefined
>

export const cellText = (value: TTableCellValue | undefined) =>
  (typeof value === 'object' ? value.text : value) ?? ''

const cellDetail = (value: TTableCellValue | undefined): TTableCellDetail =>
  typeof value === 'object' ? value : {}

// Controls in a cell sit above the row's link, so clicking them doesn't open the row.
export const ABOVE_ROW_LINK = 'relative z-10'

type TTableCellProps = {
  column: TTableColumn
  value: TTableCellValue | undefined
  // What shows now: the row's value, or a choice just picked in a `select`.
  text: string
  // The row's first column, which names the row to assistive tech.
  rowName: string
  isCompact: boolean
  isRowSelected: boolean
  onPick: (choice: string) => void
}

export const TableCell = ({
  column,
  value,
  text,
  rowName,
  isCompact,
  isRowSelected,
  onPick
}: TTableCellProps) => {
  const { t } = useLocale()

  const detail = cellDetail(value)
  const type =
    column.type === 'select' && detail.readOnly
      ? 'text'
      : (column.type ?? 'text')

  switch (type) {
    case 'person': {
      const showSub = Boolean(detail.sub) && !isCompact

      return (
        <span
          className={cn(
            'flex min-w-0 items-center',
            showSub ? 'gap-3' : 'gap-2.5'
          )}
        >
          <Avatar
            initials={detail.initials ?? ''}
            size={showSub ? 36 : 28}
            src={detail.src}
            tone={detail.tone}
          />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-semibold">{text}</span>
            {showSub ? (
              <span className="truncate text-body-sm text-muted-foreground">
                {detail.sub}
              </span>
            ) : null}
          </span>
        </span>
      )
    }

    case 'switch':
      return (
        <Switch
          aria-label={
            detail.label ??
            t('{column} for {name}', { column: column.label, name: rowName })
          }
          checked={Boolean(detail.on)}
          className={ABOVE_ROW_LINK}
          size="sm"
          onCheckedChange={detail.onToggle}
        />
      )

    case 'tag':
      return (
        <Tag
          className={cn(isRowSelected && !detail.soft && 'bg-background')}
          dot={detail.dot}
          tone={detail.soft}
        >
          {text}
        </Tag>
      )

    case 'select':
      return (
        <PickPill
          className={ABOVE_ROW_LINK}
          label={t('{column} for {name}', {
            column: column.label,
            name: rowName
          })}
          options={column.options ?? []}
          tone={isRowSelected ? 'white' : 'secondary'}
          value={text}
          onChange={onPick}
        />
      )

    default:
      return (
        <span
          className={cn(
            'block truncate tabular-nums',
            type === 'muted' || detail.muted
              ? 'text-muted-foreground'
              : 'text-foreground',
            type === 'strong' && 'font-semibold'
          )}
        >
          {text}
        </span>
      )
  }
}
