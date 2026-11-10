import { describe, expect, it } from 'vitest'

import { sortDeals } from './deal-sort'
import { ASHA, DAN, makeDeal, PIPELINE } from './test-data'

const DEALS = [
  makeDeal({
    id: 'a',
    name: 'Platform 10',
    company: { id: 'l', name: 'Lumen Retail' },
    stageId: 'proposal',
    valueMinor: 900_00,
    closeDate: '2026-12-15',
    owner: DAN
  }),
  makeDeal({
    id: 'b',
    name: 'analytics',
    company: { id: 'h', name: 'Halden Capital' },
    stageId: 'qualified',
    valueMinor: null,
    closeDate: null,
    owner: ASHA
  }),
  makeDeal({
    id: 'c',
    name: 'Platform 9',
    company: { id: 'o', name: 'Orbit Health' },
    stageId: 'qualified',
    valueMinor: 10_000_00,
    closeDate: '2026-11-30',
    owner: ASHA
  })
]

const order = (key: Parameters<typeof sortDeals>[1]['key'], dir: 1 | -1) =>
  sortDeals(DEALS, { key, dir }, PIPELINE.stages).map((deal) => deal.id)

describe('sortDeals', () => {
  it('sorts names A–Z without minding capitals, reading numbers as numbers', () => {
    expect(order('name', 1)).toEqual(['b', 'c', 'a'])
    expect(order('name', -1)).toEqual(['a', 'c', 'b'])
  })

  it('sorts by account and by owner', () => {
    expect(order('account', 1)).toEqual(['b', 'a', 'c'])
    expect(order('owner', 1)).toEqual(['b', 'c', 'a'])
  })

  it('puts stages in pipeline order, not A–Z', () => {
    expect(order('stage', 1)).toEqual(['b', 'c', 'a'])
    expect(order('stage', -1)).toEqual(['a', 'b', 'c'])
  })

  it('sorts by value as a number, with no value last either way', () => {
    expect(order('value', 1)).toEqual(['a', 'c', 'b'])
    expect(order('value', -1)).toEqual(['c', 'a', 'b'])
  })

  it('sorts by close date, with no date last either way', () => {
    expect(order('closeDate', 1)).toEqual(['c', 'a', 'b'])
    expect(order('closeDate', -1)).toEqual(['a', 'c', 'b'])
  })

  it('leaves the list it was given alone', () => {
    const before = DEALS.map((deal) => deal.id)
    order('value', -1)
    expect(DEALS.map((deal) => deal.id)).toEqual(before)
  })
})
