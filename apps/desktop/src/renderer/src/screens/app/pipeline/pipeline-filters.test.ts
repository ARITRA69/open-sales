import { describe, expect, it } from 'vitest'

import {
  closeMonthChoices,
  closeMonthLabel,
  closeMonthOf,
  filterDeals,
  NO_CLOSE_DATE,
  sameFilters,
  startingFilters,
  totalValue
} from './pipeline-filters'
import { ASHA, DAN, makeDeal, sessionUser } from './test-data'

const DEALS = [
  makeDeal({ id: 'a', owner: ASHA, closeDate: '2026-11-30' }),
  makeDeal({ id: 'b', owner: ASHA, stageId: 'proposal', closeDate: null }),
  makeDeal({
    id: 'c',
    owner: DAN,
    stageId: 'proposal',
    closeDate: '2026-12-15'
  }),
  makeDeal({ id: 'd', owner: DAN, closeDate: '2026-11-02' })
]

const ids = (deals: { id: string }[]) => deals.map((deal) => deal.id)
const everything = { ownerId: null, stageIds: [], closeMonths: [] }

describe('startingFilters', () => {
  it('starts members on their own deals and everyone else on all of them', () => {
    expect(startingFilters(sessionUser(ASHA, 'member')).ownerId).toBe('asha')
    expect(startingFilters(sessionUser(ASHA, 'manager')).ownerId).toBeNull()
    expect(startingFilters(sessionUser(ASHA, 'admin')).ownerId).toBeNull()
  })
})

describe('filterDeals', () => {
  it('lets everything through with no filters on', () => {
    expect(ids(filterDeals(DEALS, everything))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('keeps one person’s deals', () => {
    expect(ids(filterDeals(DEALS, { ...everything, ownerId: 'dan' }))).toEqual([
      'c',
      'd'
    ])
  })

  it('keeps the stages picked', () => {
    expect(
      ids(filterDeals(DEALS, { ...everything, stageIds: ['proposal'] }))
    ).toEqual(['b', 'c'])
  })

  it('keeps the close months picked, and deals with no date when asked', () => {
    expect(
      ids(filterDeals(DEALS, { ...everything, closeMonths: ['2026-11'] }))
    ).toEqual(['a', 'd'])
    expect(
      ids(
        filterDeals(DEALS, {
          ...everything,
          closeMonths: ['2026-12', NO_CLOSE_DATE]
        })
      )
    ).toEqual(['b', 'c'])
  })

  it('needs a deal to pass every filter', () => {
    expect(
      ids(
        filterDeals(DEALS, {
          ownerId: 'dan',
          stageIds: ['qualified'],
          closeMonths: ['2026-11']
        })
      )
    ).toEqual(['d'])
  })

  it('can leave one filter out, to count its choices', () => {
    const filters = {
      ownerId: 'asha',
      stageIds: ['proposal'],
      closeMonths: ['2026-11']
    }
    expect(ids(filterDeals(DEALS, filters, 'stage'))).toEqual(['a'])
    expect(ids(filterDeals(DEALS, filters, 'closeMonth'))).toEqual(['b'])
  })
})

describe('close months', () => {
  it('offers this month and every month a deal closes in, earliest first', () => {
    expect(closeMonthChoices(DEALS, new Date(2027, 0, 10))).toEqual([
      '2026-11',
      '2026-12',
      '2027-01'
    ])
  })

  it('reads a deal’s month, or none', () => {
    expect(closeMonthOf({ closeDate: '2026-11-30' })).toBe('2026-11')
    expect(closeMonthOf({ closeDate: null })).toBe(NO_CLOSE_DATE)
  })

  it('names a month in words', () => {
    expect(closeMonthLabel('2026-11')).toMatch(/2026/)
    expect(closeMonthLabel('2026-11')).not.toMatch(/-/)
    expect(closeMonthLabel(NO_CLOSE_DATE)).toBe('No close date')
  })
})

describe('sameFilters', () => {
  it('compares what’s picked, in any order', () => {
    expect(
      sameFilters(
        { ownerId: 'asha', stageIds: ['a', 'b'], closeMonths: [] },
        { ownerId: 'asha', stageIds: ['b', 'a'], closeMonths: [] }
      )
    ).toBe(true)
    expect(sameFilters(everything, { ...everything, ownerId: 'asha' })).toBe(
      false
    )
    expect(
      sameFilters(everything, { ...everything, closeMonths: ['2026-11'] })
    ).toBe(false)
  })
})

describe('totalValue', () => {
  it('adds up deals in the workspace’s currency only', () => {
    expect(
      totalValue(
        [
          { valueMinor: 100_00, currency: 'USD' },
          { valueMinor: null, currency: 'USD' },
          { valueMinor: 999_00, currency: 'EUR' },
          { valueMinor: 250_00, currency: 'USD' }
        ],
        'USD'
      )
    ).toBe(350_00)
  })
})
