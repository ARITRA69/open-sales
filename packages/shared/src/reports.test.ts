import { describe, expect, it } from 'vitest'

import {
  dayAfter,
  forecastQuerySchema,
  monthsInRange,
  reportQuerySchema,
  resolveForecastRange,
  resolveReportPeriod
} from './reports'
import { canSeeForecast } from './roles'

describe('resolveReportPeriod', () => {
  const today = '2026-11-10'

  it('covers whole months, quarters and years', () => {
    expect(resolveReportPeriod('this_month', today)).toEqual({
      from: '2026-11-01',
      to: '2026-11-30'
    })
    expect(resolveReportPeriod('last_month', today)).toEqual({
      from: '2026-10-01',
      to: '2026-10-31'
    })
    expect(resolveReportPeriod('this_quarter', today)).toEqual({
      from: '2026-10-01',
      to: '2026-12-31'
    })
    expect(resolveReportPeriod('last_quarter', today)).toEqual({
      from: '2026-07-01',
      to: '2026-09-30'
    })
    expect(resolveReportPeriod('this_year', today)).toEqual({
      from: '2026-01-01',
      to: '2026-12-31'
    })
  })

  it('crosses the year’s edge', () => {
    expect(resolveReportPeriod('last_month', '2026-01-15')).toEqual({
      from: '2025-12-01',
      to: '2025-12-31'
    })
    expect(resolveReportPeriod('last_quarter', '2026-02-01')).toEqual({
      from: '2025-10-01',
      to: '2025-12-31'
    })
    expect(resolveReportPeriod('next_3_months', today)).toEqual({
      from: '2026-11-01',
      to: '2027-01-31'
    })
    expect(resolveReportPeriod('next_12_months', today)).toEqual({
      from: '2026-11-01',
      to: '2027-10-31'
    })
  })

  it('ends the last 12 months today', () => {
    expect(resolveReportPeriod('last_12_months', today)).toEqual({
      from: '2025-11-11',
      to: '2026-11-10'
    })
    // 29 February has no day a year before it.
    expect(resolveReportPeriod('last_12_months', '2028-02-29')).toEqual({
      from: '2027-03-02',
      to: '2028-02-29'
    })
  })
})

describe('resolveForecastRange', () => {
  it('runs from today to the end of the period', () => {
    expect(resolveForecastRange('next_3_months', '2026-11-10')).toEqual({
      from: '2026-11-10',
      to: '2027-01-31'
    })
    expect(resolveForecastRange('this_quarter', '2026-11-10')).toEqual({
      from: '2026-11-10',
      to: '2026-12-31'
    })
  })
})

describe('monthsInRange', () => {
  it('lists every month a range touches', () => {
    expect(monthsInRange({ from: '2026-11-01', to: '2027-01-31' })).toEqual([
      '2026-11',
      '2026-12',
      '2027-01'
    ])
    expect(monthsInRange({ from: '2026-11-10', to: '2026-11-12' })).toEqual([
      '2026-11'
    ])
  })
})

describe('dayAfter', () => {
  it('steps over the ends of months and years', () => {
    expect(dayAfter('2026-11-30')).toBe('2026-12-01')
    expect(dayAfter('2026-12-31')).toBe('2027-01-01')
    expect(dayAfter('2028-02-28')).toBe('2028-02-29')
  })
})

describe('report queries', () => {
  it('default to this quarter, and three months ahead', () => {
    expect(reportQuerySchema.parse({})).toEqual({ period: 'this_quarter' })
    expect(forecastQuerySchema.parse({})).toEqual({ period: 'next_3_months' })
  })

  it('refuse a period the report doesn’t have', () => {
    expect(
      reportQuerySchema.safeParse({ period: 'next_3_months' }).success
    ).toBe(false)
    expect(
      forecastQuerySchema.safeParse({ period: 'last_month' }).success
    ).toBe(false)
  })
})

describe('canSeeForecast', () => {
  it('is for managers and admins', () => {
    expect(canSeeForecast('admin')).toBe(true)
    expect(canSeeForecast('manager')).toBe(true)
    expect(canSeeForecast('member')).toBe(false)
  })
})
