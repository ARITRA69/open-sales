import { describe, expect, it } from 'vitest'

import { idleDays, idleLabel, idleSince } from './stalled'

const NOW = Date.parse('2026-11-30T12:00:00Z')
const daysAgo = (days: number) =>
  new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString()

const deal = (entered: number, active: number | null = null) => ({
  stageEnteredAt: daysAgo(entered),
  lastActivityAt: active === null ? null : daysAgo(active)
})

describe('idleDays', () => {
  it('says nothing until the deal is past its stage’s limit', () => {
    const stage = { stalledAfterDays: 10 }
    expect(idleDays(deal(3), stage, NOW)).toBeNull()
    expect(idleDays(deal(10), stage, NOW)).toBeNull()
    expect(idleDays(deal(11), stage, NOW)).toBe(11)
    expect(idleDays(deal(12), stage, NOW)).toBe(12)
  })

  it('starts the clock again at the last activity', () => {
    const stage = { stalledAfterDays: 10 }
    expect(idleDays(deal(40, 2), stage, NOW)).toBeNull()
    expect(idleDays(deal(40, 15), stage, NOW)).toBe(15)
  })

  it('ignores activity from before the deal entered its stage', () => {
    expect(idleDays(deal(12, 30), { stalledAfterDays: 10 }, NOW)).toBe(12)
  })

  it('never stalls in a stage with no limit, or with no stage', () => {
    expect(idleDays(deal(400), { stalledAfterDays: null }, NOW)).toBeNull()
    expect(idleDays(deal(400), null, NOW)).toBeNull()
    expect(idleDays(deal(400), undefined, NOW)).toBeNull()
  })

  it('counts only open deals that are still in use', () => {
    const stage = { stalledAfterDays: 10 }
    expect(idleDays({ ...deal(30), status: 'won' }, stage, NOW)).toBeNull()
    expect(idleDays({ ...deal(30), status: 'lost' }, stage, NOW)).toBeNull()
    expect(
      idleDays({ ...deal(30), archivedAt: daysAgo(1) }, stage, NOW)
    ).toBeNull()
    expect(
      idleDays({ ...deal(30), status: 'open', archivedAt: null }, stage, NOW)
    ).toBe(30)
  })

  it('counts whole days, and a limit of none is past after one', () => {
    const stage = { stalledAfterDays: 0 }
    expect(idleDays(deal(0.5), stage, NOW)).toBeNull()
    expect(idleDays(deal(1.9), stage, NOW)).toBe(1)
  })

  it('reads a date it can’t parse as not idle', () => {
    expect(
      idleDays(
        { stageEnteredAt: 'soon', lastActivityAt: null },
        { stalledAfterDays: 1 },
        NOW
      )
    ).toBeNull()
  })
})

describe('idleSince', () => {
  it('is the later of entering the stage and the last activity', () => {
    expect(idleSince(deal(8, 3))).toBe(Date.parse(daysAgo(3)))
    expect(idleSince(deal(3, 8))).toBe(Date.parse(daysAgo(3)))
    expect(idleSince(deal(5))).toBe(Date.parse(daysAgo(5)))
  })
})

describe('idleLabel', () => {
  it('says it in plain words', () => {
    expect(idleLabel(12)).toBe('Idle 12 days')
    expect(idleLabel(1)).toBe('Idle 1 day')
  })
})
