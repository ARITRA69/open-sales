/*
 * Money is kept in minor units (cents) as whole numbers, like the server.
 * These assume two decimal places, which fits most currencies; ones with
 * none, like JPY, come with currency settings.
 */

/** 1250000, "USD" → "$12,500". Whole amounts drop the cents. */
export const formatMoney = (
  minor: number | null,
  currency: string,
  { compact = false } = {}
): string => {
  if (minor === null) return ''
  const amount = minor / 100
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: compact || Number.isInteger(amount) ? 0 : 2
    }).format(amount)
  } catch {
    // An unknown currency code.
    return `${amount.toLocaleString()} ${currency}`
  }
}

/**
 * What someone typed as an amount, in minor units. Empty is null; anything
 * that isn't an amount is undefined.
 */
export const parseMoney = (typed: string): number | null | undefined => {
  const cleaned = typed.replace(/[\s,]/g, '').replace(/^[^\d.]+/, '')
  if (!typed.trim()) return null
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return undefined
  return Math.round(Number(cleaned) * 100)
}

/** Minor units back to what goes in the box: 1250000 → "12500". */
export const moneyInputValue = (minor: number | null) =>
  minor === null ? '' : String(minor / 100)
