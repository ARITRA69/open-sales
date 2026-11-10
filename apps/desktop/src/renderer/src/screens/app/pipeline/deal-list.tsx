import {
  ArrowDown02Icon,
  MoreHorizontalIcon,
  Sorting05Icon
} from '@hugeicons/core-free-icons'
import type { TDeal, TStage } from '@open-sales/shared'
import { idleDays, idleLabel } from '@open-sales/shared'
import { AnimatePresence, motion } from 'motion/react'

import { Link } from '@/components/shared/link'
import { Avatar } from '@/components/ui/bits'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Menu, type TMenuItem } from '@/components/ui/menu'
import { StatusDot } from '@/components/ui/status'
import { formatShortDate } from '@/lib/dates'
import { getInitials } from '@/lib/initials'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

import { dealHref } from './deal-card'
import type { TDealSort, TDealSortKey } from './deal-sort'

const ROW_SPRING = {
  type: 'spring' as const,
  stiffness: 480,
  damping: 42,
  mass: 0.8
}

// Deal, account, stage, value, close date, owner, and the row's menu.
const GRID =
  'grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_2rem] items-center gap-3 px-2'

const COLUMNS: { key: TDealSortKey; label: string; right?: boolean }[] = [
  { key: 'name', label: 'Deal' },
  { key: 'account', label: 'Account' },
  { key: 'stage', label: 'Stage' },
  { key: 'value', label: 'Value', right: true },
  { key: 'closeDate', label: 'Close date' },
  { key: 'owner', label: 'Owner' }
]

type TDealListProps = {
  stages: TStage[]
  // Filtered and sorted already.
  deals: TDeal[]
  sort: TDealSort
  onSort: (sort: TDealSort) => void
  // The quick-edit dialog.
  onOpen: (deal: TDeal) => void
  onClose: (deal: TDeal, outcome: 'won' | 'lost') => void
}

/**
 * The board's deals as a table. Every column sorts. A deal's name links to
 * its page; the rest of the row opens the quick-edit dialog.
 */
export const DealList = ({
  stages,
  deals,
  sort,
  onSort,
  onOpen,
  onClose
}: TDealListProps) => {
  const stageById = new Map(stages.map((stage) => [stage.id, stage]))

  return (
    <div
      aria-label="Deals"
      className="flex w-full flex-col text-foreground"
      data-slot="deal-list"
      role="table"
    >
      <div className={cn(GRID, 'min-h-8')} role="row">
        {COLUMNS.map((column) => {
          const isSorted = sort.key === column.key
          return (
            <div
              key={column.key}
              aria-sort={
                isSorted
                  ? sort.dir === 1
                    ? 'ascending'
                    : 'descending'
                  : 'none'
              }
              className={cn(
                'flex min-w-0 text-body-sm font-semibold whitespace-nowrap text-muted-foreground',
                column.right && 'justify-end pr-2'
              )}
              role="columnheader"
            >
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
                <span
                  className={cn(
                    'flex flex-none transition-transform duration-200',
                    !isSorted && 'text-faint',
                    isSorted && sort.dir === -1 && 'rotate-180'
                  )}
                >
                  <Icon
                    icon={isSorted ? ArrowDown02Icon : Sorting05Icon}
                    size={14}
                  />
                </span>
              </button>
            </div>
          )
        })}
        <span aria-hidden />
      </div>
      <div className="relative" role="rowgroup">
        <AnimatePresence initial={false} mode="popLayout">
          {deals.map((deal) => {
            const idle = idleDays(deal, stageById.get(deal.stageId))
            const menuItems: TMenuItem[] = [
              { label: 'Edit', onSelect: () => onOpen(deal) },
              { label: 'Open deal page', href: dealHref(deal.id) },
              ...(deal.canEdit
                ? [
                    { line: true as const },
                    {
                      label: 'Mark as won',
                      onSelect: () => onClose(deal, 'won')
                    },
                    {
                      label: 'Mark as lost',
                      onSelect: () => onClose(deal, 'lost')
                    }
                  ]
                : [])
            ]

            return (
              <motion.div
                key={deal.id}
                animate={{ opacity: 1 }}
                className={cn(
                  GRID,
                  'group/row relative min-h-8 cursor-pointer rounded-row py-1 text-sm transition-colors duration-150 hover:bg-muted',
                  'before:pointer-events-none before:absolute before:inset-x-2 before:bottom-0 before:h-px before:bg-border before:transition-opacity before:duration-150',
                  'last:before:opacity-0 hover:before:opacity-0'
                )}
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                layout="position"
                role="row"
                transition={ROW_SPRING}
              >
                <div className="flex min-w-0 items-center gap-2" role="cell">
                  <button
                    aria-label={`Edit ${deal.name}`}
                    className="absolute inset-0 cursor-pointer rounded-row outline-none keyboard-focus:shadow-(--halo-keyboard)"
                    type="button"
                    onClick={() => onOpen(deal)}
                  />
                  <Link
                    className="relative z-10 truncate rounded-sm font-semibold text-foreground no-underline outline-none hover:underline keyboard-focus:shadow-(--halo-keyboard)"
                    href={dealHref(deal.id)}
                  >
                    {deal.name}
                  </Link>
                  {idle !== null ? (
                    <StatusDot
                      className="flex-none"
                      dotSize="sm"
                      variant="meta"
                    >
                      {idleLabel(idle)}
                    </StatusDot>
                  ) : null}
                </div>
                <div className="min-w-0 truncate" role="cell">
                  {deal.company.name}
                </div>
                <div className="min-w-0 truncate" role="cell">
                  {stageById.get(deal.stageId)?.name ?? ''}
                </div>
                <div
                  className="min-w-0 truncate pr-2 text-right font-semibold tabular-nums"
                  role="cell"
                >
                  {formatMoney(deal.valueMinor, deal.currency)}
                </div>
                <div
                  className="min-w-0 truncate text-muted-foreground tabular-nums"
                  role="cell"
                >
                  {formatShortDate(deal.closeDate)}
                </div>
                <div className="flex min-w-0 items-center gap-2" role="cell">
                  <Avatar initials={getInitials(deal.owner.name)} size={24} />
                  <span className="truncate">{deal.owner.name}</span>
                </div>
                <span className="relative z-10 flex size-8 opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 focus-within:opacity-100 has-aria-expanded:opacity-100 pointer-coarse:opacity-100">
                  <Menu
                    align="end"
                    items={menuItems}
                    label={`Actions for ${deal.name}`}
                    trigger={
                      <Button
                        aria-label={`More for ${deal.name}`}
                        lead={<Icon icon={MoreHorizontalIcon} />}
                        size="sm"
                        variant="ghost"
                      />
                    }
                  />
                </span>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
