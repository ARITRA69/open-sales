import { describe, expect, it } from 'vitest'

import {
  fromIsoDay,
  monthWeeks,
  parseTypedDate,
  shiftMonth,
  toIsoDay
} from './dates'

const TODAY = new Date(2026, 10, 10)

describe('parseTypedDate', () => {
  it('reads numbers the way round the computer writes them', () => {
    expect(parseTypedDate('3/4/2026', 'dmy', TODAY)).toBe('2026-04-03')
    expect(parseTypedDate('3/4/2026', 'mdy', TODAY)).toBe('2026-03-04')
    expect(parseTypedDate('30.11.26', 'dmy', TODAY)).toBe('2026-11-30')
    expect(parseTypedDate('26/11/30', 'ymd', TODAY)).toBe('2026-11-30')
  })

  it('reads a year first whatever the custom', () => {
    expect(parseTypedDate('2027-01-05', 'mdy', TODAY)).toBe('2027-01-05')
  })

  it('reads month names, and assumes this year', () => {
    expect(parseTypedDate('30 Nov', 'dmy', TODAY)).toBe('2026-11-30')
    expect(parseTypedDate('nov 30, 2027', 'dmy', TODAY)).toBe('2027-11-30')
    expect(parseTypedDate('5 january 27', 'mdy', TODAY)).toBe('2027-01-05')
    expect(parseTypedDate('12/5', 'mdy', TODAY)).toBe('2026-12-05')
  })

  it("refuses what isn't a date", () => {
    expect(parseTypedDate('', 'dmy', TODAY)).toBeNull()
    expect(parseTypedDate('31/2/2026', 'dmy', TODAY)).toBeNull()
    expect(parseTypedDate('1/1/202', 'dmy', TODAY)).toBeNull()
    expect(parseTypedDate('soon', 'dmy', TODAY)).toBeNull()
    expect(parseTypedDate('10 nope 2026', 'dmy', TODAY)).toBeNull()
  })
})

describe('calendar days', () => {
  it('round-trips a day without shifting time zones', () => {
    expect(toIsoDay(fromIsoDay('2026-11-30')!)).toBe('2026-11-30')
    expect(fromIsoDay('2026-02-31')).toBeNull()
    expect(fromIsoDay('yesterday')).toBeNull()
  })

  it('lays a month out as six full weeks', () => {
    const sundayFirst = monthWeeks(2026, 10, 0)
    expect(sundayFirst).toHaveLength(6)
    expect(toIsoDay(sundayFirst[0][0])).toBe('2026-11-01')
    expect(toIsoDay(sundayFirst[5][6])).toBe('2026-12-12')

    const mondayFirst = monthWeeks(2026, 10, 1)
    expect(toIsoDay(mondayFirst[0][0])).toBe('2026-10-26')
  })

  it("stops at a shorter month's last day", () => {
    expect(toIsoDay(shiftMonth(new Date(2026, 0, 31), 1))).toBe('2026-02-28')
    expect(toIsoDay(shiftMonth(new Date(2026, 0, 15), -1))).toBe('2025-12-15')
  })
})
