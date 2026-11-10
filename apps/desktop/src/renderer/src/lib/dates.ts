const DAY_MS = 24 * 60 * 60 * 1000

/** "12 Nov", or "12 Nov 2025" when it isn't this year. */
export const formatShortDate = (value: string | null): string => {
  if (!value) return ''
  // A plain "2026-11-30" is a calendar day: read it as local, not UTC.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value)
  const isThisYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(isThisYear ? {} : { year: 'numeric' })
  })
}

/** Whole days since a moment, never negative. */
export const daysSince = (iso: string, now = Date.now()) =>
  Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY_MS))
