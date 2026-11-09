import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/utils'

type TBannerProps = {
  // `accent` is for something that needs the person's attention.
  tone?: 'muted' | 'accent'
} & ComponentProps<'div'>

/** A grey strip of information inside a page or dialog. */
export const Banner = ({
  tone = 'muted',
  className,
  ...divProps
}: TBannerProps) => (
  <div
    {...divProps}
    className={cn(
      'flex items-center gap-3 rounded-card px-4 py-3 text-sm text-foreground',
      tone === 'accent' ? 'bg-accent-soft font-medium' : 'bg-muted',
      className
    )}
    data-slot="banner"
    data-tone={tone}
  />
)

type TStatTileProps = {
  value: ReactNode
  label: string
  className?: string
}

/** One headline number with what it counts underneath. */
export const StatTile = ({ value, label, className }: TStatTileProps) => (
  <div
    className={cn(
      'flex flex-col gap-1.5 rounded-dialog bg-muted px-5 py-4',
      className
    )}
    data-slot="stat-tile"
  >
    <span className="text-title-xl font-bold tabular-nums">{value}</span>
    <span className="text-sm text-muted-foreground">{label}</span>
  </div>
)
