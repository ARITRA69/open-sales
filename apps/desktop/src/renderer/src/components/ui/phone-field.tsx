import { useRef, useState } from 'react'

import {
  ArrowDown01Icon,
  Search01Icon,
  Tick02Icon
} from '@hugeicons/core-free-icons'
import { Command } from 'cmdk'
import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode
} from 'libphonenumber-js'
import { Popover } from 'radix-ui'

import { useLocale } from '@/hooks/use-locale'
import { cn } from '@/lib/utils'

import { CountryFlag } from './country-flag'
import { FieldWrap, useFieldIds, type TFieldFrameProps } from './field'
import { Icon } from './icon'
import { fieldControlClass } from './input'
import { POPUP_CLASS, POPUP_ITEM_CLASS } from './popup'

const REGION_NAMES = new Intl.DisplayNames(undefined, { type: 'region' })

type TCountry = { code: CountryCode; name: string; dial: string }

const COUNTRIES: TCountry[] = getCountries()
  .map((code) => ({
    code,
    name: REGION_NAMES.of(code) ?? code,
    dial: getCountryCallingCode(code)
  }))
  .sort((a, b) => a.name.localeCompare(b.name))

/** The country of this computer's language setting, like GB for en-GB. */
const localCountry = (): CountryCode => {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region
    return COUNTRIES.some((country) => country.code === region)
      ? (region as CountryCode)
      : 'US'
  } catch {
    return 'US'
  }
}

/**
 * What to store for what's typed: E.164 when it reads as a number, else the
 * text itself, so the form's check can say it isn't one.
 */
const storedValue = (typed: string, country: CountryCode) => {
  if (!typed.trim()) return ''
  const reader = new AsYouType(country)
  reader.input(typed)
  return reader.getNumber()?.number ?? typed
}

/** A saved number as its country and the number as written there. */
const splitStored = (value: string, fallback: CountryCode) => {
  const parsed = value ? parsePhoneNumberFromString(value) : undefined
  return parsed
    ? {
        country: parsed.country ?? fallback,
        typed: parsed.country
          ? parsed.formatNational()
          : parsed.formatInternational()
      }
    : { country: fallback, typed: value }
}

type TPhoneFieldProps = TFieldFrameProps & {
  // E.164, like "+442079460000", or '' for none.
  value: string
  onChange: (value: string) => void
  // Where numbers without a + are from, until one is picked.
  defaultCountry?: CountryCode
  placeholder?: string
  readOnly?: boolean
  className?: string
}

/**
 * A phone number with its country. Pick the country from the list, or type
 * a number starting with + and the country follows. It hands back E.164.
 */
export const PhoneField = ({
  label,
  hint,
  error,
  value,
  onChange,
  defaultCountry,
  placeholder,
  readOnly = false,
  className
}: TPhoneFieldProps) => {
  const { t } = useLocale()
  const { controlId, messageId } = useFieldIds()
  const inputRef = useRef<HTMLInputElement>(null)

  const [initial] = useState(() =>
    splitStored(value, defaultCountry ?? localCountry())
  )
  const [country, setCountry] = useState<CountryCode>(initial.country)
  const [typed, setTyped] = useState(initial.typed)
  const [isOpen, setIsOpen] = useState(false)

  const current =
    COUNTRIES.find((option) => option.code === country) ?? COUNTRIES[0]

  const handleType = (next: string) => {
    setTyped(next)
    // "+44…": the number says its own country.
    let nextCountry = country
    if (next.trim().startsWith('+')) {
      const reader = new AsYouType()
      reader.input(next)
      const detected = reader.getCountry()
      if (detected) {
        nextCountry = detected
        setCountry(detected)
      }
    }
    onChange(storedValue(next, nextCountry))
  }

  const handlePickCountry = (next: CountryCode) => {
    setCountry(next)
    setIsOpen(false)
    // A number typed with its own + code keeps it; the rest change country.
    const national = typed.trim().startsWith('+')
      ? (parsePhoneNumberFromString(typed)?.nationalNumber ?? typed)
      : typed
    setTyped(national)
    onChange(storedValue(national, next))
    inputRef.current?.focus()
  }

  // Spaced out the local way once they've finished typing.
  const handleBlur = () => {
    const parsed = parsePhoneNumberFromString(typed, country)
    if (!parsed?.isValid()) return
    setTyped(
      parsed.country === country
        ? parsed.formatNational()
        : parsed.formatInternational()
    )
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
      <div
        className={cn(
          fieldControlClass({ invalid: Boolean(error), readOnly }),
          'flex h-8 items-center',
          !readOnly &&
            'focus-within:bg-background focus-within:shadow-(--halo-field)',
          error && !readOnly && 'focus-within:shadow-(--halo-error)'
        )}
        data-slot="phone-field"
      >
        <Popover.Root
          open={isOpen}
          onOpenChange={(open) => setIsOpen(readOnly ? false : open)}
        >
          <Popover.Trigger
            aria-label={t('Country: {name}', { name: current.name })}
            className={cn(
              'flex h-full flex-none items-center gap-1.5 rounded-l-row pr-2 pl-3 text-body-lg text-foreground outline-none',
              'transition-colors duration-150 keyboard-focus:shadow-(--halo-keyboard)',
              readOnly ? 'cursor-default' : 'hover:bg-secondary'
            )}
            disabled={readOnly}
            type="button"
          >
            <CountryFlag code={current.code} />
            <span className="text-muted-foreground tabular-nums">
              {`+${current.dial}`}
            </span>
            {readOnly ? null : (
              <Icon
                className={cn(
                  'flex-none text-muted-foreground transition-transform duration-200',
                  isOpen && 'rotate-180'
                )}
                icon={ArrowDown01Icon}
                size={12}
              />
            )}
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="start"
              className={cn(
                POPUP_CLASS,
                'w-72 origin-(--radix-popover-content-transform-origin)'
              )}
              sideOffset={6}
            >
              <Command
                className="outline-none"
                defaultValue={`${current.name} +${current.dial} ${current.code}`}
                label={t('Country')}
              >
                <div className="-mx-1.5 -mt-1.5 mb-1.5 flex h-9 items-center gap-2 px-3 shadow-[inset_0_-1px_0_var(--border)]">
                  <Icon
                    className="flex-none text-muted-foreground"
                    icon={Search01Icon}
                  />
                  <Command.Input
                    aria-label={t('Search countries')}
                    className="min-w-0 flex-1 bg-transparent font-sans text-body-lg text-foreground outline-none placeholder:text-faint"
                    placeholder={t('Country or code')}
                  />
                </div>
                <Command.List className="max-h-72 overflow-y-auto">
                  <Command.Empty className="px-2.5 py-2 text-sm text-muted-foreground">
                    {t('Nothing matches')}
                  </Command.Empty>
                  {COUNTRIES.map((option) => (
                    <Command.Item
                      key={option.code}
                      className={cn(
                        POPUP_ITEM_CLASS,
                        option.code === country && 'font-semibold'
                      )}
                      value={`${option.name} +${option.dial} ${option.code}`}
                      onSelect={() => handlePickCountry(option.code)}
                    >
                      <CountryFlag code={option.code} />
                      <span className="min-w-0 flex-1 truncate">
                        {option.name}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {`+${option.dial}`}
                      </span>
                      {option.code === country ? (
                        <Icon
                          className="flex-none"
                          icon={Tick02Icon}
                          size={14}
                        />
                      ) : null}
                    </Command.Item>
                  ))}
                </Command.List>
              </Command>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <span aria-hidden className="h-4 w-px flex-none bg-border" />
        <input
          ref={inputRef}
          aria-describedby={error || hint ? messageId : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete="tel"
          className="h-full min-w-0 flex-1 bg-transparent pr-3 pl-2.5 font-sans text-body-lg text-foreground outline-none placeholder:text-faint"
          id={controlId}
          inputMode="tel"
          placeholder={placeholder}
          readOnly={readOnly}
          type="tel"
          value={typed}
          onBlur={handleBlur}
          onChange={(event) => handleType(event.target.value)}
        />
      </div>
    </FieldWrap>
  )
}
