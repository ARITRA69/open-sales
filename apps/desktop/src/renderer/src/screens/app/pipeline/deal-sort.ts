import type { TDeal, TStage } from '@open-sales/shared'

export const DEAL_SORT_KEYS = [
  'name',
  'account',
  'stage',
  'value',
  'closeDate',
  'owner'
] as const

export type TDealSortKey = (typeof DEAL_SORT_KEYS)[number]

export type TDealSort = { key: TDealSortKey; dir: 1 | -1 }

const byText = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

/** A deal's place in a column's order, or null when it has nothing to go by. */
const sortValue = (
  deal: TDeal,
  key: TDealSortKey,
  stagePositions: Map<string, number>
): string | number | null => {
  switch (key) {
    case 'name':
      return deal.name
    case 'account':
      return deal.company.name
    case 'stage':
      return stagePositions.get(deal.stageId) ?? null
    case 'value':
      return deal.valueMinor
    case 'closeDate':
      return deal.closeDate
    case 'owner':
      return deal.owner.name
  }
}

/**
 * Deals in a column's order. Stages go in pipeline order, not A–Z. Deals
 * with no value or no close date come last whichever way it's sorted, and
 * ties fall back to the deal's name.
 */
export const sortDeals = (
  deals: TDeal[],
  sort: TDealSort,
  stages: Pick<TStage, 'id' | 'position'>[]
): TDeal[] => {
  const positions = new Map(stages.map((stage) => [stage.id, stage.position]))
  return [...deals].sort((a, b) => {
    const left = sortValue(a, sort.key, positions)
    const right = sortValue(b, sort.key, positions)
    if (left === null || right === null) {
      if (left !== right) return left === null ? 1 : -1
    } else {
      const order =
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : byText(String(left), String(right))
      if (order !== 0) return order * sort.dir
    }
    return byText(a.name, b.name) || byText(a.id, b.id)
  })
}
