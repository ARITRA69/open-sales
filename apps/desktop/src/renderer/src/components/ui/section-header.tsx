import type { ComponentProps } from 'react'

import { ArrowDown01Icon } from '@hugeicons/core-free-icons'

import { cn } from '@/lib/utils'

import { Icon } from './icon'
import { Dot } from './status'

type TSectionHeaderProps = {
  title: string
  count?: number
  // `accent` marks what needs the person, with a dot.
  tone?: 'accent' | 'muted'
  open?: boolean
} & Omit<ComponentProps<'button'>, 'title'>

/** The heading of a section that folds open and shut. */
export const SectionHeader = ({
  title,
  count,
  tone = 'accent',
  open = true,
  className,
  type = 'button',
  ...buttonProps
}: TSectionHeaderProps) => (
  <button
    aria-expanded={open}
    type={type}
    {...buttonProps}
    className={cn(
      'flex h-12 w-full items-center gap-2.5 rounded-card pr-3.5 pl-4 text-left text-foreground outline-none',
      'transition-colors duration-200 keyboard-focus:shadow-(--halo-keyboard)',
      tone === 'accent'
        ? 'bg-accent-soft hover:bg-secondary'
        : 'bg-muted hover:bg-secondary',
      className
    )}
    data-slot="section-header"
  >
    {tone === 'accent' ? <Dot /> : null}
    <span className="text-body-lg font-semibold">{title}</span>
    {count === undefined ? null : (
      <span className="text-body-sm font-semibold text-muted-foreground tabular-nums">
        {count}
      </span>
    )}
    <Icon
      className={cn(
        'ml-auto flex-none text-muted-foreground transition-transform duration-200 ease-(--ease-out-soft)',
        open && 'rotate-180'
      )}
      icon={ArrowDown01Icon}
    />
  </button>
)
