import type { TMoneyTotal, TReportRange } from '@open-sales/shared'

import { fromIsoDay } from '@/lib/dates'
import { formatMoney } from '@/lib/money'

const DASH = '—'

const formatDay = (day: string, withYear: boolean) =>
  fromIsoDay(day)?.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {})
  }) ?? day

/** "1 Oct – 31 Dec 2026", or "11 Nov 2025 – 10 Nov 2026" across years. */
export const formatRange = ({ from, to }: TReportRange) =>
  `${formatDay(from, from.slice(0, 4) !== to.slice(0, 4))} – ${formatDay(to, true)}`

/** "2026-11" → "Nov 2026". */
export const formatMonth = (month: string) =>
  fromIsoDay(`${month}-01`)?.toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric'
  }) ?? month

/** 0.4 → "40%". Nothing to divide by shows as a dash. */
export const formatShare = (share: number | null) =>
  share === null ? DASH : `${Math.round(share * 100)}%`

/** "1 deal", "3 deals". */
export const countOf = (count: number, noun = 'deal') =>
  `${count.toLocaleString()} ${noun}${count === 1 ? '' : 's'}`

/** One currency's amount out of a list of totals; 0 when it isn't there. */
export const amountIn = (totals: TMoneyTotal[], currency: string) =>
  totals.find((total) => total.currency === currency)?.valueMinor ?? 0

/**
 * Totals as text. Currencies are never added together, so more than one
 * reads "$12,000 + €4,000".
 */
export const formatTotals = (totals: TMoneyTotal[]) =>
  totals.length === 0
    ? DASH
    : totals
        .map((total) => formatMoney(total.valueMinor, total.currency))
        .join(' + ')

/** Every currency the totals mention, the workspace's first. */
export const currenciesIn = (
  totals: { currency: string }[],
  first: string
): string[] => {
  const found = [...new Set(totals.map((total) => total.currency))]
  return found.includes(first)
    ? [first, ...found.filter((currency) => currency !== first)]
    : found
}
