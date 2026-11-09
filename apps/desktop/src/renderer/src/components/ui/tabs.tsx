import { useId } from 'react'

import { motion } from 'motion/react'
import { Tabs as TabsPrimitive } from 'radix-ui'

import { useLocale } from '@/hooks/use-locale'
import { cn } from '@/lib/utils'

export type TTabItem = { label: string; count?: number } | string

const labelOf = (item: TTabItem) =>
  typeof item === 'string' ? item : item.label
const countOf = (item: TTabItem) =>
  typeof item === 'string' ? undefined : item.count

const INDICATOR_SPRING = {
  type: 'spring' as const,
  stiffness: 460,
  damping: 38,
  mass: 0.8
}

type TTabsProps = {
  items: TTabItem[]
  active: number
  onChange: (index: number, label: string) => void
  // `underline` moves between sections; `segmented` filters one list.
  variant?: 'underline' | 'segmented'
  // `sm` for panels and other tight spaces.
  size?: 'md' | 'sm'
  label?: string
  className?: string
}

/**
 * A row of tabs. The marker under (or behind) the active tab slides to the
 * new one, and labels keep their width when they turn bold.
 */
export const Tabs = ({
  items,
  active,
  onChange,
  variant = 'underline',
  size = 'md',
  label,
  className
}: TTabsProps) => {
  const { t } = useLocale()

  const indicatorId = useId()
  const isSegmented = variant === 'segmented'

  return (
    <TabsPrimitive.Root
      activationMode="automatic"
      value={String(active)}
      onValueChange={(value) => {
        const index = Number(value)
        onChange(index, labelOf(items[index]))
      }}
    >
      <TabsPrimitive.List
        aria-label={label ?? t('Sections')}
        className={cn(
          isSegmented
            ? 'inline-flex gap-0.5 rounded-full bg-secondary p-0.5'
            : 'flex gap-5',
          className
        )}
        data-slot="tabs"
        data-variant={variant}
      >
        {items.map((item, index) => {
          const itemLabel = labelOf(item)
          const itemCount = countOf(item)
          const isActive = index === active

          return (
            <TabsPrimitive.Trigger
              key={itemLabel}
              className={cn(
                'relative inline-flex items-center gap-1.5 whitespace-nowrap outline-none',
                'transition-colors duration-200 keyboard-focus:shadow-(--halo-keyboard)',
                isActive
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
                isSegmented
                  ? cn(
                      'rounded-full',
                      size === 'sm'
                        ? 'h-6 px-2.5 text-body-sm'
                        : 'h-7 px-3 text-sm',
                      !isActive && 'hover:bg-background/50'
                    )
                  : cn(size === 'sm' ? 'pb-1.5 text-body-sm' : 'pb-2 text-sm')
              )}
              value={String(index)}
            >
              {isActive ? (
                <motion.span
                  aria-hidden
                  className={cn(
                    'absolute',
                    isSegmented
                      ? 'inset-0 rounded-full bg-background shadow-(--shadow-segment)'
                      : 'inset-x-0 bottom-0 h-0.5 rounded-full bg-foreground'
                  )}
                  layoutId={indicatorId}
                  transition={INDICATOR_SPRING}
                />
              ) : null}
              {/* The bold copy holds the width, so tabs don't shift when one turns bold. */}
              <span className="relative inline-grid">
                <span
                  aria-hidden
                  className="invisible col-start-1 row-start-1 font-semibold"
                >
                  {itemLabel}
                </span>
                <span
                  className={cn(
                    'col-start-1 row-start-1 text-center',
                    isActive ? 'font-semibold' : 'font-medium'
                  )}
                >
                  {itemLabel}
                </span>
              </span>
              {itemCount === undefined ? null : (
                <span className="relative text-body-sm font-medium text-muted-foreground tabular-nums">
                  {itemCount}
                </span>
              )}
            </TabsPrimitive.Trigger>
          )
        })}
      </TabsPrimitive.List>
    </TabsPrimitive.Root>
  )
}
