import { GridViewIcon, Menu01Icon } from '@hugeicons/core-free-icons'
import { ToggleGroup } from 'radix-ui'

import { useLocale } from '@/hooks/use-locale'
import { cn } from '@/lib/utils'

import { Icon } from './icon'

export type TViewMode = 'grid' | 'list'

type TViewToggleProps = {
  value: TViewMode
  onChange: (value: TViewMode) => void
  className?: string
}

/**
 * Switches a collection between cards and rows. It sits at the right end of
 * the row just above the collection.
 */
export const ViewToggle = ({
  value,
  onChange,
  className
}: TViewToggleProps) => {
  const { t } = useLocale()

  const modes = [
    { value: 'list' as const, label: t('List'), icon: Menu01Icon },
    { value: 'grid' as const, label: t('Cards'), icon: GridViewIcon }
  ]

  return (
    <ToggleGroup.Root
      aria-label={t('View')}
      className={cn(
        'inline-flex flex-none gap-0.5 rounded-full bg-secondary p-0.75',
        className
      )}
      data-slot="view-toggle"
      type="single"
      value={value}
      onValueChange={(next) => {
        // Clicking the chosen view again would clear it; keep one chosen.
        if (next) onChange(next as TViewMode)
      }}
    >
      {modes.map((mode) => (
        <ToggleGroup.Item
          key={mode.value}
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-full px-3 text-body-sm font-semibold text-muted-foreground outline-none',
            'transition-[background-color,box-shadow,color] duration-200 keyboard-focus:shadow-(--halo-keyboard)',
            'hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-(--shadow-segment)'
          )}
          value={mode.value}
        >
          <Icon icon={mode.icon} size={15} />
          {mode.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}
