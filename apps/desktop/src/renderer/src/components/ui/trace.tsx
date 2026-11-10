import type { ComponentProps } from 'react'

import { ArrowRight01Icon } from '@hugeicons/core-free-icons'

import { cn } from '@/lib/utils'

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from './collapsible'
import { Icon } from './icon'

const LINE_PARENT_CLASS =
  '*:has-[>[data-slot=trace-line]]:flex *:has-[>[data-slot=trace-line]]:w-fit *:has-[>[data-slot=trace-line]]:max-w-full *:has-[>[data-slot=trace-line]]:min-w-0 *:has-[>[data-slot=trace-line]]:rounded-sm *:has-[>[data-slot=trace-line]]:text-left *:has-[>[data-slot=trace-line]]:no-underline *:has-[>[data-slot=trace-line]]:outline-none *:has-[>[data-slot=trace-line]]:keyboard-focus:shadow-(--halo-keyboard)'

/**
 * The steps AI takes inside a turn, from shadcn's AI Elements: one line per
 * step, so reading, tool calls and sources all have the same shape. Wrap a
 * line in a link or a button to make it open something.
 */
export const Trace = ({ className, ...divProps }: ComponentProps<'div'>) => (
  <div
    {...divProps}
    className={cn(
      'flex w-full min-w-0 flex-col gap-1.5',
      LINE_PARENT_CLASS,
      className
    )}
    data-slot="trace"
  />
)

type TTraceLineProps = ComponentProps<'span'> & {
  // No status means the step is done.
  status?: 'running' | 'error' | 'pending'
  // `sm` for a line that is a note under something else, like a source.
  size?: 'md' | 'sm'
}

export const TraceLine = ({
  status,
  size = 'md',
  className,
  ...spanProps
}: TTraceLineProps) => (
  <span
    {...spanProps}
    className={cn(
      'flex w-fit max-w-full min-w-0 items-center text-muted-foreground transition-colors duration-150',
      size === 'sm' ? 'gap-1.5 text-body-sm' : 'gap-2 text-sm',
      'in-[a,button]:cursor-pointer in-[a:hover,button:hover]:text-foreground',
      // A running line's title shimmers: see `kit-shimmer` in components.css.
      'data-[status=error]:text-destructive data-[status=pending]:text-faint data-[status=running]:text-foreground',
      className
    )}
    data-slot="trace-line"
    data-status={status}
  />
)

export const TraceIcon = ({
  className,
  ...spanProps
}: ComponentProps<'span'>) => (
  <span
    {...spanProps}
    aria-hidden
    className={cn(
      'flex size-4 flex-none items-center justify-center [&_svg]:pointer-events-none',
      className
    )}
    data-slot="trace-icon"
  />
)

export const TraceTitle = ({
  className,
  ...spanProps
}: ComponentProps<'span'>) => (
  <span
    {...spanProps}
    className={cn('min-w-0 truncate', className)}
    data-slot="trace-title"
  />
)

/** A quiet extra beside the title, like a count or how long it took. */
export const TraceDescription = ({
  className,
  ...spanProps
}: ComponentProps<'span'>) => (
  <span
    {...spanProps}
    className={cn('flex-none text-faint tabular-nums', className)}
    data-slot="trace-description"
  />
)

/** A line that opens to show the steps under it. */
export const TraceCollapsible = ({
  className,
  ...collapsibleProps
}: Omit<ComponentProps<typeof Collapsible>, 'asChild'>) => (
  <Collapsible
    {...collapsibleProps}
    className={cn('flex w-full min-w-0 flex-col', className)}
    data-slot="trace-collapsible"
  />
)

export const TraceCollapsibleTrigger = ({
  className,
  children,
  ...triggerProps
}: Omit<ComponentProps<typeof CollapsibleTrigger>, 'asChild'>) => (
  <CollapsibleTrigger
    {...triggerProps}
    className={cn(
      'group/trace-trigger flex w-fit max-w-full min-w-0 cursor-pointer items-center gap-1 rounded-sm border-none bg-transparent p-0 text-left font-sans text-muted-foreground outline-none',
      'transition-colors duration-150 hover:text-foreground has-data-[status=error]:text-destructive keyboard-focus:shadow-(--halo-keyboard)',
      className
    )}
    data-slot="trace-collapsible-trigger"
  >
    {children}
    <TraceIcon className="transition-transform duration-200 ease-(--ease-out-soft) group-aria-expanded/trace-trigger:rotate-90">
      <Icon icon={ArrowRight01Icon} size={14} />
    </TraceIcon>
  </CollapsibleTrigger>
)

export const TraceCollapsibleContent = ({
  className,
  children,
  ...contentProps
}: Omit<ComponentProps<typeof CollapsibleContent>, 'asChild'>) => (
  <CollapsibleContent
    {...contentProps}
    className="min-w-0 overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down"
    data-slot="trace-collapsible-content"
  >
    <div
      className={cn(
        'mt-1.5 mb-1 ml-2 min-w-0 border-l border-border pr-1 pl-3.5 wrap-break-word text-muted-foreground',
        className
      )}
      data-slot="trace-collapsible-content-inner"
    >
      {children}
    </div>
  </CollapsibleContent>
)
