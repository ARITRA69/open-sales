import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

type TMessageProps = ComponentProps<'div'> & {
  // `end` for the person's own turn, `start` for the reply.
  align?: 'start' | 'end'
}

/**
 * One turn in a thread, from shadcn's AI Elements. The person's turn is a
 * `Bubble` at the end; the reply is plain content at the start.
 */
export const Message = ({
  align = 'start',
  className,
  ...divProps
}: TMessageProps) => (
  <div
    {...divProps}
    className={cn(
      'group/message relative flex w-full min-w-0 gap-2 text-sm data-[align=end]:flex-row-reverse',
      className
    )}
    data-align={align}
    data-slot="message"
  />
)

/** Several turns from the same side, set closer together. */
export const MessageGroup = ({
  className,
  ...divProps
}: ComponentProps<'div'>) => (
  <div
    {...divProps}
    className={cn('flex min-w-0 flex-col gap-1.5', className)}
    data-slot="message-group"
  />
)

export const MessageContent = ({
  className,
  ...divProps
}: ComponentProps<'div'>) => (
  <div
    {...divProps}
    className={cn(
      'flex w-full min-w-0 flex-col gap-2 wrap-break-word group-data-[align=end]/message:items-end',
      className
    )}
    data-slot="message-content"
  />
)

const META_CLASS =
  'flex max-w-full min-w-0 items-center gap-1 text-body-sm text-muted-foreground group-data-[align=end]/message:justify-end'

/** A meta line above the turn: who answered, and how. */
export const MessageHeader = ({
  className,
  ...divProps
}: ComponentProps<'div'>) => (
  <div
    {...divProps}
    className={cn(META_CLASS, className)}
    data-slot="message-header"
  />
)

/** The turn's actions, under its content. */
export const MessageFooter = ({
  className,
  ...divProps
}: ComponentProps<'div'>) => (
  <div
    {...divProps}
    className={cn(META_CLASS, className)}
    data-slot="message-footer"
  />
)
