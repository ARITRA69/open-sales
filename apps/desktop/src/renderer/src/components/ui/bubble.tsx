import type { ComponentProps } from 'react'

import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/utils'

const bubbleVariants = cva(
  'group/bubble relative flex w-fit max-w-5/6 min-w-0 flex-col gap-1 data-[align=end]:self-end data-[variant=ghost]:max-w-full',
  {
    variants: {
      variant: {
        primary:
          '*:data-[slot=bubble-content]:bg-primary *:data-[slot=bubble-content]:text-primary-foreground',
        secondary:
          '*:data-[slot=bubble-content]:bg-secondary *:data-[slot=bubble-content]:text-secondary-foreground',
        muted: '*:data-[slot=bubble-content]:bg-muted',
        ghost:
          '*:data-[slot=bubble-content]:rounded-none *:data-[slot=bubble-content]:bg-transparent *:data-[slot=bubble-content]:p-0'
      }
    },
    defaultVariants: { variant: 'secondary' }
  }
)

type TBubbleProps = ComponentProps<'div'> &
  VariantProps<typeof bubbleVariants> & {
    align?: 'start' | 'end'
  }

/**
 * A speech bubble, from shadcn's AI Elements: what a person said in a thread.
 * Grey by default, since black is kept for the one primary button.
 */
export const Bubble = ({
  variant = 'secondary',
  align = 'start',
  className,
  ...divProps
}: TBubbleProps) => (
  <div
    {...divProps}
    className={cn(bubbleVariants({ variant }), className)}
    data-align={align}
    data-slot="bubble"
    data-variant={variant}
  />
)

type TBubbleContentProps = ComponentProps<'div'> & {
  // Renders the child instead, for a bubble that is a link or a button.
  asChild?: boolean
}

export const BubbleContent = ({
  asChild = false,
  className,
  ...divProps
}: TBubbleContentProps) => {
  const Tag = asChild ? Slot.Root : 'div'

  return (
    <Tag
      {...divProps}
      className={cn(
        'w-fit max-w-full min-w-0 overflow-hidden rounded-card px-3 py-2 text-sm wrap-break-word outline-none',
        'transition-colors duration-150 keyboard-focus:shadow-(--halo-keyboard)',
        className
      )}
      data-slot="bubble-content"
    />
  )
}

/** Bubbles from one side, stacked. */
export const BubbleGroup = ({
  className,
  ...divProps
}: ComponentProps<'div'>) => (
  <div
    {...divProps}
    className={cn('flex min-w-0 flex-col gap-2', className)}
    data-slot="bubble-group"
  />
)
