import type { ComponentProps } from 'react'

import { Search01Icon } from '@hugeicons/core-free-icons'

import { useLocale } from '@/hooks/use-locale'
import { cn } from '@/lib/utils'

import { Key } from './bits'
import { Icon } from './icon'

type TSearchPillProps = {
  // Whether the search window it opens is showing.
  open?: boolean
  label?: string
  shortcut?: string
} & Omit<ComponentProps<'button'>, 'children'>

/** A button shaped like a search box, which opens app-wide search. */
export const SearchPill = ({
  open = false,
  label,
  shortcut = '⌘K',
  className,
  type = 'button',
  ...buttonProps
}: TSearchPillProps) => {
  const { t } = useLocale()

  return (
    <button
      {...buttonProps}
      aria-expanded={open}
      aria-haspopup="dialog"
      className={cn(
        'flex h-8 w-60 items-center gap-2 rounded-full pr-1.5 pl-3 text-sm font-medium whitespace-nowrap outline-none',
        'transition-[background-color,box-shadow,color] duration-200 ease-(--ease-out-soft)',
        'keyboard-focus:shadow-(--halo-keyboard)',
        open
          ? 'bg-background text-foreground shadow-(--halo-search)'
          : 'bg-secondary text-muted-foreground hover:bg-secondary-hover hover:text-foreground',
        className
      )}
      data-slot="search-pill"
      type={type}
    >
      <Icon className="flex-none" icon={Search01Icon} />
      <span className="min-w-0 flex-1 truncate text-left">
        {label ?? t('Search deals, people and accounts')}
      </span>
      <Key tone={open ? 'grey' : 'plain'}>{shortcut}</Key>
    </button>
  )
}
