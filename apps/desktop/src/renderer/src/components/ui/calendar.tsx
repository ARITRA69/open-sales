import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon
} from '@hugeicons/core-free-icons'
import { AnimatePresence, motion, useIsPresent } from 'motion/react'

import { useLocale } from '@/hooks/use-locale'
import {
  fromIsoDay,
  localWeekStart,
  monthWeeks,
  shiftDay,
  shiftMonth,
  toIsoDay
} from '@/lib/dates'
import { cn } from '@/lib/utils'

import { Button } from './button'
import { Icon } from './icon'

const SLIDE_TRANSITION = { duration: 0.18, ease: [0.22, 0.8, 0.24, 1] as const }

// Pages slide the way you're going: later months come in from the right.
const SLIDE = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 16 }),
  shown: { opacity: 1, x: 0 },
  exit: (direction: number) => ({ opacity: 0, x: direction * -16 })
}

const monthNumber = (date: Date) => date.getFullYear() * 12 + date.getMonth()

type TWeeksProps = {
  // Any day in the month to show; it's also the one the keyboard is on.
  focused: Date
  selected: string
  today: string
  weekStart: number
  onPick: (day: string) => void
}

const Weeks = ({
  focused,
  selected,
  today,
  weekStart,
  onPick
}: TWeeksProps) => {
  // A month sliding out is only there to fade: nothing in it can be reached.
  const isPresent = useIsPresent()

  const month = focused.getMonth()
  const focusedDay = toIsoDay(focused)

  return monthWeeks(focused.getFullYear(), month, weekStart).map((week) => (
    <div key={toIsoDay(week[0])} className="flex" inert={!isPresent} role="row">
      {week.map((date) => {
        const day = toIsoDay(date)
        const isSelected = day === selected

        return (
          <div key={day} aria-selected={isSelected} role="gridcell">
            <button
              aria-current={day === today ? 'date' : undefined}
              aria-label={date.toLocaleDateString(undefined, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
              className={cn(
                'relative flex size-8 items-center justify-center rounded-full font-sans text-sm font-medium tabular-nums outline-none select-none',
                'transition-colors duration-150 keyboard-focus:shadow-(--halo-keyboard)',
                isSelected
                  ? 'bg-primary font-semibold text-primary-foreground'
                  : 'hover:bg-muted active:bg-secondary',
                !isSelected &&
                  (date.getMonth() === month
                    ? 'text-foreground'
                    : 'text-faint'),
                // Today is marked with a dot as well as weight.
                day === today &&
                  'font-semibold after:absolute after:bottom-1 after:size-1 after:rounded-full after:bg-current'
              )}
              data-day={isPresent ? day : undefined}
              tabIndex={isPresent && day === focusedDay ? 0 : -1}
              type="button"
              onClick={() => onPick(day)}
            >
              {date.getDate()}
            </button>
          </div>
        )
      })}
    </div>
  ))
}

type TMonthsProps = {
  shown: Date
  onPick: (month: number) => void
}

const Months = ({ shown, onPick }: TMonthsProps) => {
  const isPresent = useIsPresent()

  return (
    <div className="grid h-full grid-cols-3 gap-1" inert={!isPresent}>
      {Array.from({ length: 12 }, (_, month) => {
        const date = new Date(shown.getFullYear(), month, 1)
        const isShown = month === shown.getMonth()

        return (
          <button
            key={month}
            aria-label={date.toLocaleDateString(undefined, {
              month: 'long',
              year: 'numeric'
            })}
            aria-pressed={isShown}
            className={cn(
              'flex items-center justify-center rounded-row font-sans text-sm font-medium text-foreground outline-none select-none',
              'transition-colors duration-150 keyboard-focus:shadow-(--halo-keyboard)',
              isShown
                ? 'bg-secondary font-semibold'
                : 'hover:bg-muted active:bg-secondary'
            )}
            tabIndex={isPresent ? 0 : -1}
            type="button"
            onClick={() => onPick(month)}
          >
            {date.toLocaleDateString(undefined, { month: 'short' })}
          </button>
        )
      })}
    </div>
  )
}

export type TCalendarProps = {
  // A day as "2026-11-30", or '' for none.
  value: string
  // The day that was picked, or '' for Clear.
  onChange: (value: string) => void
  // 0 for Sunday, 1 for Monday. This computer's custom unless set.
  weekStart?: number
  // The day to call today, for tests and examples.
  today?: Date
  className?: string
}

/**
 * A month to pick a day from. The arrows turn the page, the month's name
 * opens the list of months, and the arrow keys walk the days.
 */
export const Calendar = ({
  value,
  onChange,
  weekStart: weekStartProp,
  today: todayProp,
  className
}: TCalendarProps) => {
  const { t } = useLocale()

  const panelRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLButtonElement>(null)
  // Set by the arrow keys, so the day they land on takes the focus.
  const wantsFocus = useRef(false)

  const [today] = useState(() => todayProp ?? new Date())
  const [weekStart] = useState(() => weekStartProp ?? localWeekStart())
  // The month on show is always the focused day's month.
  const [focused, setFocused] = useState(() => fromIsoDay(value) ?? today)
  const [seenValue, setSeenValue] = useState(value)
  const [isPickingMonth, setIsPickingMonth] = useState(false)
  const [direction, setDirection] = useState(0)

  const show = (next: Date) => {
    setDirection(Math.sign(monthNumber(next) - monthNumber(focused)))
    setFocused(next)
  }

  // A day typed into the box turns the calendar to it.
  if (value !== seenValue) {
    setSeenValue(value)
    const picked = fromIsoDay(value)
    if (picked) show(picked)
  }

  useEffect(() => {
    if (!wantsFocus.current) return
    wantsFocus.current = false
    panelRef.current
      ?.querySelector<HTMLElement>(`[data-day="${toIsoDay(focused)}"]`)
      ?.focus()
  }, [focused])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const column = (focused.getDay() - weekStart + 7) % 7
    const next = {
      ArrowLeft: () => shiftDay(focused, -1),
      ArrowRight: () => shiftDay(focused, 1),
      ArrowUp: () => shiftDay(focused, -7),
      ArrowDown: () => shiftDay(focused, 7),
      Home: () => shiftDay(focused, -column),
      End: () => shiftDay(focused, 6 - column),
      PageUp: () => shiftMonth(focused, event.shiftKey ? -12 : -1),
      PageDown: () => shiftMonth(focused, event.shiftKey ? 12 : 1)
    }[event.key]
    if (!next) return

    event.preventDefault()
    wantsFocus.current = true
    show(next())
  }

  // The arrows turn a month at a time, or a year while the months are open.
  const step = isPickingMonth ? 12 : 1

  const weekdays = monthWeeks(2026, 0, weekStart)[0]

  return (
    <div
      className={cn('flex w-60 flex-col gap-1 p-2', className)}
      data-slot="calendar"
    >
      <div className="flex items-center gap-0.5">
        <Button
          ref={titleRef}
          aria-expanded={isPickingMonth}
          className="mr-auto -ml-0.5"
          size="sm"
          trail={
            <Icon
              className={cn(
                'flex-none text-muted-foreground transition-transform duration-200',
                isPickingMonth && 'rotate-180'
              )}
              icon={ArrowDown01Icon}
              size={12}
            />
          }
          variant="ghost"
          onClick={() => {
            setDirection(0)
            setIsPickingMonth(!isPickingMonth)
          }}
        >
          {isPickingMonth
            ? String(focused.getFullYear())
            : focused.toLocaleDateString(undefined, {
                month: 'long',
                year: 'numeric'
              })}
        </Button>
        <Button
          aria-label={isPickingMonth ? t('Previous year') : t('Previous month')}
          leadIcon={ArrowLeft01Icon}
          size="sm"
          variant="ghost"
          onClick={() => show(shiftMonth(focused, -step))}
        />
        <Button
          aria-label={isPickingMonth ? t('Next year') : t('Next month')}
          leadIcon={ArrowRight01Icon}
          size="sm"
          variant="ghost"
          onClick={() => show(shiftMonth(focused, step))}
        />
      </div>

      <div ref={panelRef} className="relative h-55 overflow-hidden">
        <AnimatePresence custom={direction} initial={false}>
          {isPickingMonth ? (
            <motion.div
              key={`months-${focused.getFullYear()}`}
              animate="shown"
              className="absolute inset-0"
              custom={direction}
              exit="exit"
              initial="enter"
              transition={SLIDE_TRANSITION}
              variants={SLIDE}
            >
              <Months
                shown={focused}
                onPick={(month) => {
                  setDirection(0)
                  setFocused(shiftMonth(focused, month - focused.getMonth()))
                  setIsPickingMonth(false)
                  titleRef.current?.focus()
                }}
              />
            </motion.div>
          ) : (
            <motion.div
              key={`days-${monthNumber(focused)}`}
              animate="shown"
              aria-label={focused.toLocaleDateString(undefined, {
                month: 'long',
                year: 'numeric'
              })}
              className="absolute inset-0"
              custom={direction}
              exit="exit"
              initial="enter"
              role="grid"
              transition={SLIDE_TRANSITION}
              variants={SLIDE}
              onKeyDown={handleKeyDown}
            >
              <div className="flex h-7 items-center" role="row">
                {weekdays.map((date) => (
                  <span
                    key={date.getDay()}
                    aria-label={date.toLocaleDateString(undefined, {
                      weekday: 'long'
                    })}
                    className="w-8 text-center text-body-sm font-medium text-muted-foreground"
                    role="columnheader"
                  >
                    {date.toLocaleDateString(undefined, { weekday: 'narrow' })}
                  </span>
                ))}
              </div>
              <Weeks
                focused={focused}
                selected={value}
                today={toIsoDay(today)}
                weekStart={weekStart}
                onPick={onChange}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="-mx-2 mt-1 flex items-center justify-between px-1.5 pt-1.5 shadow-[inset_0_1px_0_var(--border)]">
        <Button
          disabled={!value}
          size="sm"
          variant="ghost"
          onClick={() => onChange('')}
        >
          {t('Clear')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onChange(toIsoDay(today))}
        >
          {t('Today')}
        </Button>
      </div>
    </div>
  )
}
