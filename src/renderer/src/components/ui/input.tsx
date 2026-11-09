import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/** The look shared by every box you type into or pick from. */
export const fieldControlClass = ({
  invalid,
  readOnly
}: {
  invalid?: boolean
  readOnly?: boolean
}) =>
  cn(
    'w-full rounded-row font-sans text-body-lg text-foreground outline-none',
    'transition-[background-color,box-shadow] duration-200 ease-(--ease-out-soft)',
    'disabled:cursor-not-allowed disabled:opacity-50',
    readOnly
      ? 'bg-transparent text-muted-foreground'
      : 'bg-muted hover:bg-secondary focus:bg-background focus:shadow-(--halo-field)',
    invalid && !readOnly && 'shadow-(--halo-error) focus:shadow-(--halo-error)'
  )

type TInputProps = {
  // Rings the box in red. `Field` adds the message that says why.
  invalid?: boolean
} & Omit<ComponentProps<'input'>, 'size'>

/** A text box on its own. Use `Field` when it needs a label or a message. */
export const Input = ({
  invalid,
  readOnly,
  className,
  ...inputProps
}: TInputProps) => (
  <input
    {...inputProps}
    aria-invalid={invalid || undefined}
    className={cn(
      fieldControlClass({ invalid, readOnly }),
      'h-11 px-4 placeholder:text-faint',
      className
    )}
    data-slot="input"
    readOnly={readOnly}
  />
)

type TTextareaProps = { invalid?: boolean } & ComponentProps<'textarea'>

/** A box for a few lines of text. Use `Field` for a label or a message. */
export const Textarea = ({
  invalid,
  readOnly,
  rows = 3,
  className,
  ...textareaProps
}: TTextareaProps) => (
  <textarea
    {...textareaProps}
    aria-invalid={invalid || undefined}
    className={cn(
      fieldControlClass({ invalid, readOnly }),
      'resize-none px-4 py-3 placeholder:text-faint',
      className
    )}
    data-slot="textarea"
    readOnly={readOnly}
    rows={rows}
  />
)
