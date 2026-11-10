import type { TDeal, TSessionUser } from '@open-sales/shared'

import { toIsoDay } from '@/lib/dates'

/*
 * The Pipeline's filters: whose deals, which stages and which close months.
 * The board and the list show the same filtered deals.
 */

// The close-month choice for deals with no close date yet.
export const NO_CLOSE_DATE = 'none'

export type TPipelineFilters = {
  // One person's deals, or null for everyone's.
  ownerId: string | null
  // Empty means every stage.
  stageIds: string[]
  // "2026-11", or NO_CLOSE_DATE. Empty means any month.
  closeMonths: string[]
}

/** Members start on their own deals; managers and admins on everyone's. */
export const startingFilters = (me: TSessionUser): TPipelineFilters => ({
  ownerId: me.role === 'member' ? me.id : null,
  stageIds: [],
  closeMonths: []
})

export const sameFilters = (a: TPipelineFilters, b: TPipelineFilters) =>
  a.ownerId === b.ownerId &&
  a.stageIds.length === b.stageIds.length &&
  a.stageIds.every((id) => b.stageIds.includes(id)) &&
  a.closeMonths.length === b.closeMonths.length &&
  a.closeMonths.every((month) => b.closeMonths.includes(month))

/** "2026-11" for a deal closing in November, or NO_CLOSE_DATE. */
export const closeMonthOf = (deal: Pick<TDeal, 'closeDate'>) =>
  deal.closeDate ? deal.closeDate.slice(0, 7) : NO_CLOSE_DATE

type TFilterable = Pick<TDeal, 'owner' | 'stageId' | 'closeDate'>

/**
 * The deals the filters let through. `skip` leaves one filter out, to count
 * what each of its choices would show.
 */
export const filterDeals = <TItem extends TFilterable>(
  deals: TItem[],
  filters: TPipelineFilters,
  skip?: 'stage' | 'closeMonth'
): TItem[] =>
  deals.filter(
    (deal) =>
      (filters.ownerId === null || deal.owner.id === filters.ownerId) &&
      (skip === 'stage' ||
        filters.stageIds.length === 0 ||
        filters.stageIds.includes(deal.stageId)) &&
      (skip === 'closeMonth' ||
        filters.closeMonths.length === 0 ||
        filters.closeMonths.includes(closeMonthOf(deal)))
  )

/**
 * The months to offer: this month, and every month a deal closes in,
 * earliest first.
 */
export const closeMonthChoices = (
  deals: Pick<TDeal, 'closeDate'>[],
  today = new Date()
): string[] => {
  const months = new Set([toIsoDay(today).slice(0, 7)])
  for (const deal of deals) {
    if (deal.closeDate) months.add(deal.closeDate.slice(0, 7))
  }
  return [...months].sort()
}

/** "November 2026" for "2026-11". */
export const closeMonthLabel = (month: string): string => {
  if (month === NO_CLOSE_DATE) return 'No close date'
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(year, monthNumber - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric'
  })
}

/** What a set of deals adds up to, counting only the workspace's currency. */
export const totalValue = (
  deals: Pick<TDeal, 'valueMinor' | 'currency'>[],
  currency: string
) =>
  deals
    .filter((deal) => deal.currency === currency)
    .reduce((sum, deal) => sum + (deal.valueMinor ?? 0), 0)
