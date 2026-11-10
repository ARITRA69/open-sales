import { formatShortDate, fromIsoDay, toIsoDay } from '@/lib/dates'

const DAY_MS = 24 * 60 * 60 * 1000

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate())

/** Whole days from today to a date: 0 today, -1 yesterday, 1 tomorrow. */
const daysFromToday = (date: Date, now: Date) =>
  Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / DAY_MS)

const timeOf = (date: Date) =>
  date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

/** A moment on a timeline: "Today, 14:20", "Yesterday, 09:05", "3 Nov". */
export const formatWhen = (iso: string, now = new Date()) => {
  const date = new Date(iso)
  const days = daysFromToday(date, now)
  if (days === 0) return `Today, ${timeOf(date)}`
  if (days === -1) return `Yesterday, ${timeOf(date)}`
  if (days === 1) return `Tomorrow, ${timeOf(date)}`
  return formatShortDate(iso)
}

/** A due day, to finish "Due …": "today", "tomorrow", "yesterday", "12 Nov". */
export const formatDue = (day: string, now = new Date()) => {
  const date = fromIsoDay(day)
  if (!date) return ''
  const days = daysFromToday(date, now)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  return formatShortDate(day)
}

/** Whether a due day has passed. Today isn't late yet. */
export const isOverdue = (day: string, now = new Date()) => day < toIsoDay(now)

/** The time now as a time box takes it: "14:05". */
export const timeInputValue = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`

/** A local day and time as the moment the server stores, or null. */
export const toMoment = (day: string, time: string) => {
  const date = new Date(`${day}T${time || '00:00'}`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
