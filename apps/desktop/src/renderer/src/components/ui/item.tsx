import type { ComponentProps } from 'react'

import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/utils'

const itemVariants = cva(
  [
    'group/item flex w-full min-w-0 flex-wrap items-center text-sm text-foreground outline-none',
    'transition-colors duration-150 keyboard-focus:shadow-(--halo-keyboard)'
  ],
  {
    variants: {
      variant: {
        plain: 'bg-transparent',
        muted: 'rounded-card bg-muted [a]:hover:bg-secondary',
        // Something waiting on a person, like a change AI proposes.
        accent: 'rounded-card bg-accent-soft'
      },
      size: {
        md: 'gap-2 p-3',
        sm: 'min-h-8 gap-2 p-0'
      }
    },
    defaultVariants: { variant: 'plain', size: 'md' }
  }
)

type TItemProps = ComponentProps<'div'> &
  VariantProps<typeof itemVariants> & {
    // Renders the child instead, for an item that is a link or a button.
    asChild?: boolean
  }

/**
 * A block of content with its actions, from shadcn's AI Elements: a mark, a
 * title and description, and buttons. A header or footer takes a full row.
 */
export const Item = ({
  variant = 'plain',
  size = 'md',
  asChild = false,
  className,
  ...divProps
}: TItemProps) => {
  const Tag = asChild ? Slot.Root : 'div'

  return (
    <Tag
      {...divProps}
      className={cn(itemVariants({ variant, size }), className)}
      data-size={size}
      data-slot="item"
      data-variant={variant}
    />
  )
}

/** A list of items. */
export const ItemGroup = ({
  className,
  ...divProps
}: ComponentProps<'div'>) => (
  <div
    {...divProps}
    className={cn('flex w-full flex-col gap-2', className)}
    data-slot="item-group"
    role="list"
  />
)

type TItemMediaProps = ComponentProps<'div'> & {
  // `done` is the green disc behind a tick, for something that went through.
  variant?: 'plain' | 'done'
}

/** The mark at the start: an icon, a dot or a tick. */
export const ItemMedia = ({
  variant = 'plain',
  className,
  ...divProps
}: TItemMediaProps) => (
  <div
    {...divProps}
    className={cn(
      'flex flex-none items-center justify-center gap-2 [&_svg]:pointer-events-none',
      variant === 'done' &&
        'size-4.5 rounded-full bg-success text-primary-foreground',
      className
    )}
    data-slot="item-media"
    data-variant={variant}
  />
)

export const ItemContent = ({
  className,
  ...divProps
}: ComponentProps<'div'>) => (
  <div
    {...divProps}
    className={cn('flex min-w-0 flex-1 flex-col gap-2', className)}
    data-slot="item-content"
  />
)

export const ItemTitle = ({
  className,
  ...divProps
}: ComponentProps<'div'>) => (
  <div
    {...divProps}
    className={cn(
      'flex min-w-0 items-center gap-2 text-sm font-semibold',
      className
    )}
    data-slot="item-title"
  />
)

export const ItemDescription = ({
  className,
  ...paragraphProps
}: ComponentProps<'p'>) => (
  <p
    {...paragraphProps}
    className={cn(
      'm-0 text-left text-body-sm font-normal text-muted-foreground',
      className
    )}
    data-slot="item-description"
  />
)

/** Buttons beside the content. */
export const ItemActions = ({
  className,
  ...divProps
}: ComponentProps<'div'>) => (
  <div
    {...divProps}
    className={cn('flex flex-none items-center gap-2', className)}
    data-slot="item-actions"
  />
)

const FULL_ROW_CLASS = 'flex min-w-0 basis-full items-center gap-2'

export const ItemHeader = ({
  className,
  ...divProps
}: ComponentProps<'div'>) => (
  <div
    {...divProps}
    className={cn(FULL_ROW_CLASS, className)}
    data-slot="item-header"
  />
)

/** A full row under the content, for the buttons that decide it. */
export const ItemFooter = ({
  className,
  ...divProps
}: ComponentProps<'div'>) => (
  <div
    {...divProps}
    className={cn(FULL_ROW_CLASS, className)}
    data-slot="item-footer"
  />
)
