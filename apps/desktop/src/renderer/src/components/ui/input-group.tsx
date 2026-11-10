import type { ComponentProps, MouseEvent } from 'react'

import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

import { Button, type TButtonProps } from './button'

const CONTROL_SELECTOR = '[data-slot=input-group-control]'

const inputGroupVariants = cva(
  [
    'group/input-group relative flex w-full min-w-0 items-center text-foreground outline-none',
    'transition-[background-color,box-shadow] duration-200 ease-(--ease-out-soft)',
    'has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col',
    'has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col',
    'has-[[data-slot=input-group-control]:disabled]:opacity-50 has-[>textarea]:h-auto'
  ],
  {
    variants: {
      variant: {
        // Sits in a form beside other fields.
        field:
          'h-8 rounded-row bg-muted focus-within:bg-background focus-within:shadow-(--halo-field) hover:not-focus-within:bg-secondary has-[>textarea]:rounded-card',
        // Floats over a thread, like the box you ask AI from.
        float: 'rounded-dialog bg-background shadow-(--shadow-float)'
      }
    },
    defaultVariants: { variant: 'field' }
  }
)

type TInputGroupProps = ComponentProps<'div'> &
  VariantProps<typeof inputGroupVariants>

/**
 * A text box with buttons or labels built into it, from shadcn's AI Elements.
 * With a textarea and a `block-end` addon it is the prompt input.
 */
export const InputGroup = ({
  variant = 'field',
  className,
  ...divProps
}: TInputGroupProps) => (
  <div
    {...divProps}
    className={cn(inputGroupVariants({ variant }), className)}
    data-slot="input-group"
    data-variant={variant}
    role="group"
  />
)

const inputGroupAddonVariants = cva(
  'flex h-auto cursor-text items-center gap-2 text-body-sm font-medium text-muted-foreground select-none',
  {
    variants: {
      align: {
        'inline-start': 'order-first pl-2',
        'inline-end': 'order-last pr-2',
        'block-start': 'order-first w-full justify-start px-2 pt-2',
        'block-end': 'order-last w-full justify-start px-2 pb-2'
      }
    },
    defaultVariants: { align: 'inline-start' }
  }
)

type TInputGroupAddonProps = ComponentProps<'div'> &
  VariantProps<typeof inputGroupAddonVariants>

/** What sits around the text: beside it, or in a row above or below. */
export const InputGroupAddon = ({
  align = 'inline-start',
  className,
  onClick,
  ...divProps
}: TInputGroupAddonProps) => {
  // A click on the empty part of the row puts the cursor in the box.
  const handleClick = (clickEvent: MouseEvent<HTMLDivElement>) => {
    onClick?.(clickEvent)
    if ((clickEvent.target as HTMLElement).closest('button, a')) return
    clickEvent.currentTarget.parentElement
      ?.querySelector<HTMLElement>(CONTROL_SELECTOR)
      ?.focus()
  }

  return (
    <div
      {...divProps}
      className={cn(inputGroupAddonVariants({ align }), className)}
      data-align={align}
      data-slot="input-group-addon"
      role="group"
      onClick={handleClick}
    />
  )
}

/** A kit button sized for the inside of a box. Quiet unless told otherwise. */
export const InputGroupButton = ({
  size = 'sm',
  variant = 'ghost',
  ...buttonProps
}: TButtonProps) => <Button {...buttonProps} size={size} variant={variant} />

export const InputGroupText = ({
  className,
  ...spanProps
}: ComponentProps<'span'>) => (
  <span
    {...spanProps}
    className={cn(
      'flex items-center gap-1.5 text-body-sm text-muted-foreground',
      className
    )}
    data-slot="input-group-text"
  />
)

const CONTROL_CLASS =
  'box-border min-w-0 flex-1 border-none bg-transparent font-sans text-sm text-foreground outline-none placeholder:text-faint disabled:cursor-not-allowed'

export const InputGroupInput = ({
  className,
  ...inputProps
}: ComponentProps<'input'>) => (
  <input
    {...inputProps}
    className={cn(CONTROL_CLASS, 'h-full px-3', className)}
    data-slot="input-group-control"
  />
)

/** Grows with what's typed, up to a few lines, then scrolls. */
export const InputGroupTextarea = ({
  className,
  ...textareaProps
}: ComponentProps<'textarea'>) => (
  <textarea
    {...textareaProps}
    className={cn(
      CONTROL_CLASS,
      'field-sizing-content max-h-40 w-full resize-none scrollbar-thin px-3 py-2.5 leading-5',
      className
    )}
    data-slot="input-group-control"
  />
)
