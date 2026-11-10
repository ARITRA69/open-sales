const DAY_MS = 24 * 60 * 60 * 1000

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/

const pad = (value: number, length = 2) => String(value).padStart(length, '0')

/** A local day as "2026-11-30", which is how the server stores plain dates. */
export const toIsoDay = (date: Date) =>
  `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

/** The day for these numbers, or null when there isn't one (31 February). */
export const dayOf = (year: number, month: number, day: number) => {
  const date = new Date(year, month, day)
  // Years below 100 would otherwise be read as 19xx.
  date.setFullYear(year)
  return date.getFullYear() === year &&
    date.getMonth() === month &&
    date.getDate() === day
    ? date
    : null
}

/** "2026-11-30" as a local day, or null when it isn't one. */
export const fromIsoDay = (value: string | null) => {
  const match = value ? ISO_DAY.exec(value) : null
  return match
    ? dayOf(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : null
}

/** "12 Nov", or "12 Nov 2025" when it isn't this year. */
export const formatShortDate = (value: string | null): string => {
  if (!value) return ''
  // A plain "2026-11-30" is a calendar day: read it as local, not UTC.
  const date = fromIsoDay(value) ?? new Date(value)
  const isThisYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(isThisYear ? {} : { year: 'numeric' })
  })
}

/** "12 Nov 2026": a saved day as a date box shows it. */
export const formatFieldDate = (value: string) =>
  fromIsoDay(value)?.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }) ?? ''

/** Whole days since a moment, never negative. */
export const daysSince = (iso: string, now = Date.now()) =>
  Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY_MS))

export type TDateOrder = 'dmy' | 'mdy' | 'ymd'

const numericDateParts = (locale?: string) =>
  new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).formatToParts(new Date(2026, 0, 2))

/** Which way round this computer writes 3/4/2026. */
export const localDateOrder = (locale?: string): TDateOrder => {
  const order = numericDateParts(locale)
    .filter((part) => part.type !== 'literal')
    .map((part) => part.type[0])
    .join('')
  return order === 'mdy' || order === 'ymd' ? order : 'dmy'
}

/** The pattern to type a date in, like "dd/mm/yyyy". */
export const localDatePattern = (locale?: string) =>
  numericDateParts(locale)
    .map((part) =>
      part.type === 'day'
        ? 'dd'
        : part.type === 'month'
          ? 'mm'
          : part.type === 'year'
            ? 'yyyy'
            : part.value
    )
    .join('')

const monthNames = (locale?: string) =>
  Array.from({ length: 12 }, (_, month) =>
    new Date(2026, month, 1)
      .toLocaleDateString(locale, { month: 'long' })
      .toLowerCase()
  )

/** 0 for "jan" or "january", in English or this computer's language. */
const monthFromName = (word: string) => {
  if (word.length < 3) return -1
  for (const names of [monthNames(), monthNames('en')]) {
    const month = names.findIndex((name) => name.startsWith(word))
    if (month >= 0) return month
  }
  return -1
}

/** "26" is 2026; anything else must be a full year. */
const readYear = (text: string | undefined, fallback: number) => {
  if (text === undefined) return fallback
  if (/^\d{2}$/.test(text)) return 2000 + Number(text)
  return /^\d{4}$/.test(text) ? Number(text) : null
}

const readDay = (text: string | undefined) =>
  text !== undefined && /^\d{1,2}$/.test(text) ? Number(text) : null

/**
 * A typed date as "2026-11-30", or null when it doesn't read as one. Takes
 * 30/11/2026 (or 11/30/2026 where that's the custom), 30.11.26, 2026-11-30,
 * "30 Nov" and "Nov 30 2026". Without a year it means this year.
 */
export const parseTypedDate = (
  text: string,
  order: TDateOrder = localDateOrder(),
  today = new Date()
): string | null => {
  const words = text
    .trim()
    .toLowerCase()
    .split(/[\s/.,-]+/)
    .filter(Boolean)
  if (words.length < 2 || words.length > 3) return null

  let day: number | null
  let month: number
  let year: number | null

  const namedAt = words.findIndex((word) => /^\p{L}+$/u.test(word))
  if (namedAt >= 0) {
    month = monthFromName(words[namedAt])
    const numbers = words.filter((_, index) => index !== namedAt)
    const yearFirst = numbers.length === 2 && numbers[0].length === 4
    day = readDay(yearFirst ? numbers[1] : numbers[0])
    year = readYear(yearFirst ? numbers[0] : numbers[1], today.getFullYear())
  } else {
    const yearFirst =
      words[0].length === 4 || (order === 'ymd' && words.length === 3)
    const [first, second, third] = yearFirst ? words.slice(1) : words
    const monthFirst = yearFirst || order !== 'dmy'
    day = readDay(monthFirst ? second : first)
    month = (readDay(monthFirst ? first : second) ?? 0) - 1
    year = readYear(yearFirst ? words[0] : third, today.getFullYear())
  }

  if (day === null || year === null || month < 0) return null
  const date = dayOf(year, month, day)
  return date ? toIsoDay(date) : null
}

/** The first day of the week here: 0 for Sunday, 1 for Monday. */
export const localWeekStart = (): number => {
  try {
    const locale = new Intl.Locale(navigator.language) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number }
      weekInfo?: { firstDay: number }
    }
    const info = locale.getWeekInfo?.() ?? locale.weekInfo
    // Intl counts Monday as 1 and Sunday as 7.
    return info ? info.firstDay % 7 : 1
  } catch {
    return 1
  }
}

/** The same day a number of months away, or that month's last day. */
export const shiftMonth = (date: Date, months: number) => {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1)
  const lastDay = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0
  ).getDate()
  target.setDate(Math.min(date.getDate(), lastDay))
  return target
}

export const shiftDay = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)

/**
 * A month as six weeks of seven days, so the calendar never changes height.
 * The first and last weeks borrow days from the months either side.
 */
export const monthWeeks = (year: number, month: number, weekStart: number) => {
  const lead = (new Date(year, month, 1).getDay() - weekStart + 7) % 7
  return Array.from({ length: 6 }, (_, week) =>
    Array.from(
      { length: 7 },
      (_, day) => new Date(year, month, 1 - lead + week * 7 + day)
    )
  )
}
