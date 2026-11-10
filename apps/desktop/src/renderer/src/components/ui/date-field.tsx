import { useRef, useState, type KeyboardEvent } from 'react'

import { Calendar03Icon } from '@hugeicons/core-free-icons'
import { Popover } from 'radix-ui'

import { useLocale } from '@/hooks/use-locale'
import { formatFieldDate, localDatePattern, parseTypedDate } from '@/lib/dates'
import { cn } from '@/lib/utils'

import { Calendar } from './calendar'
import { FieldWrap, useFieldIds, type TFieldFrameProps } from './field'
import { Icon } from './icon'
import { fieldControlClass } from './input'
import { POPUP_CLASS } from './popup'

type TDateFieldProps = TFieldFrameProps & {
  // A day as "2026-11-30", or '' for none.
  value: string
  onChange: (value: string) => void
  // The pattern to type in, like "dd/mm/yyyy", unless set.
  placeholder?: string
  readOnly?: boolean
  defaultOpen?: boolean
  // 0 for Sunday, 1 for Monday. This computer's custom unless set.
  weekStart?: number
  id?: string
  className?: string
}

/**
 * A date you can type or pick from a calendar. It shows "30 Nov 2026" and
 * hands back "2026-11-30", which is how the server stores plain dates.
 */
export const DateField = ({
  label,
  hint,
  error,
  value,
  onChange,
  placeholder,
  readOnly = false,
  defaultOpen = false,
  weekStart,
  id,
  className
}: TDateFieldProps) => {
  const { t } = useLocale()
  const { controlId, messageId } = useFieldIds(id)

  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  // Opened by clicking the box: the focus stays there, for typing.
  const keepsTyping = useRef(false)

  const [isOpen, setIsOpen] = useState(defaultOpen && !readOnly)
  // What's being typed; null shows the saved date.
  const [typed, setTyped] = useState<string | null>(null)

  const focusCalendar = () =>
    popupRef.current
      ?.querySelector<HTMLElement>('[data-day][tabindex="0"]')
      ?.focus()

  const handleType = (next: string) => {
    setTyped(next)
    if (!next.trim()) {
      onChange('')
      return
    }
    // Saved as soon as it reads as a date; until then the last one stands.
    const day = parseTypedDate(next)
    if (day) onChange(day)
  }

  const handlePick = (day: string) => {
    onChange(day)
    setTyped(null)
    setIsOpen(false)
    inputRef.current?.focus()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (readOnly) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (isOpen) focusCalendar()
      else setIsOpen(true)
    }
    // Enter with the calendar open settles the date; closed, it's the form's.
    if (event.key === 'Enter' && isOpen) {
      event.preventDefault()
      setTyped(null)
      setIsOpen(false)
    }
  }

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
        onOpenChange={(open) => setIsOpen(readOnly ? false : open)}
      >
        <Popover.Anchor asChild>
          <div
            ref={boxRef}
            className={cn(
              fieldControlClass({ invalid: Boolean(error), readOnly }),
              'flex h-8 items-center has-disabled:cursor-not-allowed has-disabled:opacity-50',
              !readOnly &&
                'focus-within:bg-background focus-within:shadow-(--halo-field)',
              isOpen &&
                'bg-background shadow-(--halo-field) hover:bg-background',
              error &&
                !readOnly &&
                'shadow-(--halo-error) focus-within:shadow-(--halo-error)'
            )}
            data-slot="date-field"
          >
            <input
              ref={inputRef}
              aria-describedby={error || hint ? messageId : undefined}
              aria-invalid={error ? true : undefined}
              autoComplete="off"
              className="h-full min-w-0 flex-1 bg-transparent pr-1 pl-3 font-sans text-body-lg text-inherit outline-none placeholder:text-faint disabled:cursor-not-allowed"
              id={controlId}
              placeholder={
                readOnly ? undefined : (placeholder ?? localDatePattern())
              }
              readOnly={readOnly}
              type="text"
              value={typed ?? formatFieldDate(value)}
              onBlur={() => setTyped(null)}
              onChange={(event) => handleType(event.target.value)}
              onClick={() => {
                if (readOnly || isOpen) return
                keepsTyping.current = true
                setIsOpen(true)
              }}
              onKeyDown={handleKeyDown}
            />
            {readOnly ? null : (
              <Popover.Trigger
                aria-label={t('Open the calendar')}
                className={cn(
                  'flex h-full w-8 flex-none items-center justify-center rounded-r-row text-muted-foreground outline-none',
                  'transition-colors duration-150 hover:text-foreground keyboard-focus:shadow-(--halo-keyboard)',
                  'disabled:cursor-not-allowed disabled:hover:text-muted-foreground',
                  isOpen && 'text-foreground'
                )}
                type="button"
              >
                <Icon icon={Calendar03Icon} size={14} />
              </Popover.Trigger>
            )}
          </div>
        </Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            ref={popupRef}
            align="start"
            aria-label={label ?? t('Choose a date')}
            className={cn(
              POPUP_CLASS,
              'origin-(--radix-popover-content-transform-origin) p-0'
            )}
            sideOffset={6}
            onCloseAutoFocus={(event) => event.preventDefault()}
            onEscapeKeyDown={() => inputRef.current?.focus()}
            onInteractOutside={(event) => {
              // The box belongs to the calendar: typing in it keeps it open.
              if (boxRef.current?.contains(event.target as Node)) {
                event.preventDefault()
              }
            }}
            onOpenAutoFocus={(event) => {
              event.preventDefault()
              if (!keepsTyping.current) focusCalendar()
              keepsTyping.current = false
            }}
          >
            <Calendar
              value={value}
              weekStart={weekStart}
              onChange={handlePick}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </FieldWrap>
  )
}
