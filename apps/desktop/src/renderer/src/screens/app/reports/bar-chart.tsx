import { motion } from 'motion/react'

import { cn } from '@/lib/utils'

const BAR_SPRING = {
  type: 'spring' as const,
  stiffness: 260,
  damping: 34,
  mass: 0.9
}

export type TBar = {
  key: string
  label: string
  // How much of the track the dark bar fills, 0 to 1.
  share: number
  // A paler bar behind it, such as the value before weighting.
  backShare?: number
  // The number the bar stands for, and a quieter line beside it.
  value: string
  detail?: string
  // A line under the row, such as what share moved on to the next stage.
  note?: string
}

const percent = (share: number) => `${Math.max(0, Math.min(1, share)) * 100}%`

type TBarChartProps = {
  // Names the chart to assistive tech.
  label: string
  bars: TBar[]
  className?: string
}

/**
 * Horizontal bars, one row each: a name, the bar, and its number in words.
 * Every bar's number is written beside it, so the chart reads without colour.
 */
export const BarChart = ({ label, bars, className }: TBarChartProps) => (
  <ul
    aria-label={label}
    className={cn('m-0 flex list-none flex-col gap-2 p-0', className)}
    data-slot="bar-chart"
  >
    {bars.map((bar) => (
      <li key={bar.key} className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <span className="w-32 flex-none truncate text-sm font-medium">
            {bar.label}
          </span>
          <span
            aria-hidden
            className="relative h-5 min-w-16 flex-1 overflow-hidden rounded-sm bg-muted"
          >
            {bar.backShare === undefined ? null : (
              <motion.span
                animate={{ width: percent(bar.backShare) }}
                className="absolute inset-y-0 left-0 rounded-sm bg-chart-3"
                initial={{ width: 0 }}
                transition={BAR_SPRING}
              />
            )}
            <motion.span
              animate={{ width: percent(bar.share) }}
              className="absolute inset-y-0 left-0 rounded-sm bg-chart-1"
              initial={{ width: 0 }}
              transition={BAR_SPRING}
            />
          </span>
          <span className="flex w-56 flex-none items-baseline justify-end gap-2 text-sm tabular-nums">
            <span className="font-semibold whitespace-nowrap">{bar.value}</span>
            {bar.detail ? (
              <span className="truncate text-body-sm text-muted-foreground">
                {bar.detail}
              </span>
            ) : null}
          </span>
        </div>
        {bar.note ? (
          <p className="m-0 pl-35 text-body-sm text-muted-foreground">
            {bar.note}
          </p>
        ) : null}
      </li>
    ))}
  </ul>
)

type TLegendProps = { items: { label: string; tone: 'front' | 'back' }[] }

/** What the dark and pale bars mean, when a chart has both. */
export const BarLegend = ({ items }: TLegendProps) => (
  <ul className="m-0 flex list-none gap-4 p-0 text-body-sm text-muted-foreground">
    {items.map((item) => (
      <li key={item.label} className="flex items-center gap-1.5">
        <span
          aria-hidden
          className={cn(
            'size-2.5 rounded-xs',
            item.tone === 'front' ? 'bg-chart-1' : 'bg-chart-3'
          )}
        />
        {item.label}
      </li>
    ))}
  </ul>
)
