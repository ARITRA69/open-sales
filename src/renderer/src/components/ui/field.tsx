import {
  useId,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode
} from 'react'

import {
  ArrowDown01Icon,
  Search01Icon,
  Tick02Icon
} from '@hugeicons/core-free-icons'
import { Command } from 'cmdk'
import { Popover } from 'radix-ui'

import { useLocale } from '@/hooks/use-locale'
import { cn } from '@/lib/utils'

import { Key } from './bits'
import { Icon } from './icon'
import { fieldControlClass, Input, Textarea } from './input'
import { POPUP_CLASS, POPUP_ITEM_CLASS } from './popup'

type TFieldFrameProps = {
  label?: string
  // A quiet line under the box. An error replaces it.
  hint?: string
  error?: string
}

type TFieldWrapProps = TFieldFrameProps & {
  controlId: string
  messageId: string
  children: ReactNode
  className?: string
}

/** The label above and the message below, around any kind of box. */
const FieldWrap = ({
  label,
  hint,
  error,
  controlId,
  messageId,
  children,
  className
}: TFieldWrapProps) => {
  const message = error || hint

  return (
    <div
      className={cn('flex w-full flex-col gap-2', className)}
      data-slot="field"
    >
      {label ? (
        <label
          className="text-sm font-semibold text-foreground"
          htmlFor={controlId}
        >
          {label}
        </label>
      ) : null}
      {children}
      {message ? (
        <p
          className={cn(
            'm-0 text-body-sm transition-colors duration-200',
            error ? 'text-destructive' : 'text-muted-foreground'
          )}
          id={messageId}
        >
          {message}
        </p>
      ) : null}
    </div>
  )
}

export type TSelectOption = { label: string; value: string }

type TTextFieldProps = TFieldFrameProps & { kind?: 'text' } & Omit<
    ComponentProps<'input'>,
    'size'
  >

type TTextareaFieldProps = TFieldFrameProps & {
  kind: 'textarea'
} & ComponentProps<'textarea'>

type TSearchFieldProps = { kind: 'search'; shortcut?: string } & Omit<
  ComponentProps<'input'>,
  'size'
>

type TSelectFieldProps = TFieldFrameProps & {
  kind: 'select'
  value?: string
  onValueChange?: (value: string) => void
  options: (TSelectOption | string)[]
  placeholder?: string
  // Adds a search box to the top of the list, for long lists.
  searchable?: boolean
  readOnly?: boolean
  defaultOpen?: boolean
  className?: string
}

export type TFieldProps =
  | TTextFieldProps
  | TTextareaFieldProps
  | TSearchFieldProps
  | TSelectFieldProps

const useFieldIds = (id?: string) => {
  const generatedId = useId()
  const controlId = id ?? generatedId

  return { controlId, messageId: `${controlId}-message` }
}

const TextField = ({
  kind: _kind,
  label,
  hint,
  error,
  className,
  id,
  ...inputProps
}: TTextFieldProps) => {
  const { controlId, messageId } = useFieldIds(id)

  return (
    <FieldWrap
      className={className}
      controlId={controlId}
      error={error}
      hint={hint}
      label={label}
      messageId={messageId}
    >
      <Input
        {...inputProps}
        aria-describedby={error || hint ? messageId : undefined}
        id={controlId}
        invalid={Boolean(error)}
      />
    </FieldWrap>
  )
}

const TextareaField = ({
  kind: _kind,
  label,
  hint,
  error,
  className,
  id,
  ...textareaProps
}: TTextareaFieldProps) => {
  const { controlId, messageId } = useFieldIds(id)

  return (
    <FieldWrap
      className={className}
      controlId={controlId}
      error={error}
      hint={hint}
      label={label}
      messageId={messageId}
    >
      <Textarea
        {...textareaProps}
        aria-describedby={error || hint ? messageId : undefined}
        id={controlId}
        invalid={Boolean(error)}
      />
    </FieldWrap>
  )
}

const SearchField = ({
  kind: _kind,
  shortcut,
  className,
  placeholder,
  'aria-label': ariaLabel,
  ...inputProps
}: TSearchFieldProps) => {
  const { t } = useLocale()

  const shownPlaceholder = placeholder ?? t('Search')

  return (
    <label
      className={cn(
        'flex h-10 items-center gap-2.5 rounded-full bg-secondary pr-2 pl-3.5 text-muted-foreground',
        'transition-[background-color,box-shadow,color] duration-200 ease-(--ease-out-soft)',
        'focus-within:bg-background focus-within:text-foreground focus-within:shadow-(--halo-search) hover:bg-secondary-hover',
        className
      )}
      data-slot="search-field"
    >
      <Icon className="flex-none" icon={Search01Icon} />
      <input
        {...inputProps}
        aria-label={ariaLabel ?? shownPlaceholder}
        className="min-w-0 flex-1 bg-transparent font-sans text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
        placeholder={shownPlaceholder}
        type="search"
      />
      {shortcut ? <Key tone="plain">{shortcut}</Key> : null}
    </label>
  )
}

const toOption = (option: TSelectOption | string): TSelectOption =>
  typeof option === 'string' ? { label: option, value: option } : option

const SelectField = ({
  label,
  hint,
  error,
  value,
  onValueChange,
  options,
  placeholder,
  searchable = false,
  readOnly = false,
  defaultOpen = false,
  className
}: TSelectFieldProps) => {
  const { t } = useLocale()

  const listRef = useRef<HTMLDivElement>(null)
  const { controlId, messageId } = useFieldIds()

  const [isOpen, setIsOpen] = useState(defaultOpen)

  const selectOptions = options.map(toOption)
  const selected = selectOptions.find((option) => option.value === value)

  return (
    <FieldWrap
      className={className}
      controlId={controlId}
      error={error}
      hint={hint}
      label={label}
      messageId={messageId}
    >
      <Popover.Root
        open={isOpen}
        onOpenChange={(nextOpen) => setIsOpen(readOnly ? false : nextOpen)}
      >
        <Popover.Trigger
          aria-describedby={error || hint ? messageId : undefined}
          aria-haspopup="listbox"
          aria-invalid={error ? true : undefined}
          className={cn(
            fieldControlClass({ invalid: Boolean(error), readOnly }),
            // A select is a button, so its ring is for the keyboard only.
            'flex h-11 items-center gap-3 pr-3.5 pl-4 text-left focus:bg-muted focus:shadow-none keyboard-focus:bg-background keyboard-focus:shadow-(--halo-field)',
            isOpen &&
              'bg-background shadow-(--halo-field) hover:bg-background focus:bg-background',
            !selected && 'text-faint',
            readOnly && 'cursor-default'
          )}
          data-slot="select-trigger"
          id={controlId}
          type="button"
        >
          <span className="min-w-0 flex-1 truncate">
            {selected?.label ?? placeholder ?? t('Choose one')}
          </span>
          {readOnly ? null : (
            <Icon
              className={cn(
                'flex-none text-muted-foreground transition-transform duration-200',
                isOpen && 'rotate-180'
              )}
              icon={ArrowDown01Icon}
              size={14}
            />
          )}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            className={cn(
              POPUP_CLASS,
              'w-(--radix-popover-trigger-width) origin-(--radix-popover-content-transform-origin)'
            )}
            sideOffset={6}
            onOpenAutoFocus={(event) => {
              // Without a search box, the list itself takes the arrow keys.
              if (searchable) return
              event.preventDefault()
              listRef.current?.focus()
            }}
          >
            <Command
              ref={listRef}
              className="outline-none"
              defaultValue={selected?.label}
              label={label}
              tabIndex={-1}
            >
              {searchable ? (
                <div className="-mx-1.5 -mt-1.5 mb-1.5 flex h-12 items-center gap-2.5 px-4 shadow-[inset_0_-1px_0_var(--border)]">
                  <Icon
                    className="flex-none text-muted-foreground"
                    icon={Search01Icon}
                  />
                  <Command.Input
                    aria-label={
                      label ? t('Search {label}', { label }) : t('Search')
                    }
                    className="min-w-0 flex-1 bg-transparent font-sans text-body-lg text-foreground outline-none placeholder:text-faint"
                    placeholder={t('Search')}
                  />
                </div>
              ) : null}
              <Command.List className="max-h-72 overflow-y-auto">
                <Command.Empty className="px-3 py-2.5 text-sm text-muted-foreground">
                  {t('Nothing matches')}
                </Command.Empty>
                {selectOptions.map((option) => {
                  const isSelected = option.value === value

                  return (
                    <Command.Item
                      key={option.value}
                      className={cn(
                        POPUP_ITEM_CLASS,
                        isSelected && 'font-semibold'
                      )}
                      value={option.label}
                      onSelect={() => {
                        onValueChange?.(option.value)
                        setIsOpen(false)
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {option.label}
                      </span>
                      {isSelected ? (
                        <Icon
                          className="flex-none"
                          icon={Tick02Icon}
                          size={14}
                        />
                      ) : null}
                    </Command.Item>
                  )
                })}
              </Command.List>
            </Command>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </FieldWrap>
  )
}

/** A labelled text box, text area, search box or select. */
export const Field = (fieldProps: TFieldProps) => {
  if (fieldProps.kind === 'textarea') return <TextareaField {...fieldProps} />
  if (fieldProps.kind === 'search') return <SearchField {...fieldProps} />
  if (fieldProps.kind === 'select') return <SelectField {...fieldProps} />

  return <TextField {...fieldProps} />
}
