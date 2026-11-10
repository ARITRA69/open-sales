import type { DragEvent } from 'react'

import type { TDeal, TStage } from '@open-sales/shared'
import { idleDays, idleLabel } from '@open-sales/shared'
import { motion } from 'motion/react'

import { Link } from '@/components/shared/link'
import { Avatar } from '@/components/ui/bits'
import { StatusDot } from '@/components/ui/status'
import { formatShortDate } from '@/lib/dates'
import { getInitials } from '@/lib/initials'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

const CARD_SPRING = {
  type: 'spring' as const,
  stiffness: 480,
  damping: 40,
  mass: 0.8
}

// What a card being dragged carries.
export const DEAL_DRAG_TYPE = 'application/x-deal-id'

/** Where a deal's own page lives. The name on a card or row links there. */
export const dealHref = (dealId: string) => `#/deals/${dealId}`

type TDealCardProps = {
  deal: TDeal
  // The stage the deal is really in, for its idle limit.
  stage: TStage | undefined
  onOpen: () => void
}

/**
 * One deal on the board. The name links to the deal's page; anywhere else
 * on the card opens the quick-edit dialog. People who can change the deal
 * can drag it.
 */
export const DealCard = ({ deal, stage, onOpen }: TDealCardProps) => {
  const idle = idleDays(deal, stage)

  const handleDragStart = (event: DragEvent<HTMLElement>) => {
    event.dataTransfer.setData(DEAL_DRAG_TYPE, deal.id)
    event.dataTransfer.effectAllowed = 'move'
    // The drag starts on the button that covers the card; carry the whole
    // card under the pointer, not the button's empty outline.
    const card = event.currentTarget.getBoundingClientRect()
    event.dataTransfer.setDragImage?.(
      event.currentTarget,
      event.clientX - card.left,
      event.clientY - card.top
    )
  }

  return (
    <motion.li
      layout
      className="list-none"
      layoutId={deal.id}
      transition={CARD_SPRING}
    >
      <div
        className={cn(
          'relative flex flex-col gap-1 rounded-panel bg-background p-2.5 text-foreground',
          'shadow-(--shadow-tile) transition-shadow duration-200 hover:shadow-(--shadow-tile-hover)',
          deal.canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
        )}
        data-slot="deal-card"
        draggable={deal.canEdit}
        onDragStart={handleDragStart}
      >
        <button
          aria-label={`Edit ${deal.name}`}
          className="absolute inset-0 cursor-[inherit] rounded-panel outline-none keyboard-focus:shadow-(--halo-keyboard)"
          draggable={deal.canEdit}
          type="button"
          onClick={onOpen}
        />
        <Link
          className="relative z-10 max-w-full cursor-pointer self-start truncate rounded-sm text-sm font-semibold text-foreground no-underline outline-none hover:underline keyboard-focus:shadow-(--halo-keyboard)"
          draggable={false}
          href={dealHref(deal.id)}
        >
          {deal.name}
        </Link>
        <span className="truncate text-body-sm text-muted-foreground">
          {deal.company.name}
        </span>
        <span className="mt-1 flex items-center gap-2">
          <span className="text-body-sm font-semibold tabular-nums">
            {formatMoney(deal.valueMinor, deal.currency)}
          </span>
          {deal.closeDate ? (
            <span className="truncate text-body-sm text-muted-foreground">
              {formatShortDate(deal.closeDate)}
            </span>
          ) : null}
          <span className="flex-1" />
          <Avatar initials={getInitials(deal.owner.name)} size={24} />
        </span>
        {idle !== null ? (
          <StatusDot dotSize="sm" variant="meta">
            {idleLabel(idle)}
          </StatusDot>
        ) : null}
      </div>
    </motion.li>
  )
}
