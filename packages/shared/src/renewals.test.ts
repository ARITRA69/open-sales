import { describe, expect, it } from 'vitest'

import {
  addDaysToDay,
  addMonthsToDay,
  contractCreateSchema,
  contractEndSchema,
  contractListQuerySchema,
  daysBetween,
  termMonths
} from './renewals'
import { canEditContract } from './roles'

describe('contract days', () => {
  it('adds months, stopping at the month’s last day', () => {
    expect(addMonthsToDay('2026-12-05', 12)).toBe('2027-12-05')
    expect(addMonthsToDay('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsToDay('2028-02-29', 12)).toBe('2029-02-28')
  })

  it('counts days either way, across a clock change', () => {
    expect(daysBetween('2026-11-10', '2026-12-10')).toBe(30)
    expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31)
    expect(daysBetween('2026-11-10', '2026-11-07')).toBe(-3)
    expect(addDaysToDay('2026-12-25', 10)).toBe('2027-01-04')
  })

  it('reads a term only when it’s whole months', () => {
    expect(termMonths('2025-12-05', '2026-12-05')).toBe(12)
    expect(termMonths('2026-01-31', '2026-02-28')).toBe(1)
    expect(termMonths('2026-01-01', '2026-03-15')).toBeNull()
    expect(termMonths('2026-03-01', '2026-03-01')).toBeNull()
  })
})

describe('contract requests', () => {
  const contract = {
    dealId: 'd1',
    startsOn: '2026-01-01',
    renewsOn: '2027-01-01',
    valueMinor: 3_600_000
  }

  it('needs the renewal date after the start date', () => {
    expect(contractCreateSchema.safeParse(contract).success).toBe(true)
    const backwards = contractCreateSchema.safeParse({
      ...contract,
      renewsOn: '2026-01-01'
    })
    expect(backwards.error?.issues[0]).toMatchObject({
      path: ['renewsOn'],
      message: 'The renewal date must be after the start date'
    })
  })

  it('needs a value and real dates', () => {
    expect(
      contractCreateSchema.safeParse({ ...contract, valueMinor: -1 }).success
    ).toBe(false)
    expect(
      contractCreateSchema.safeParse({ ...contract, startsOn: '2026-02-31' })
        .success
    ).toBe(false)
  })

  it('needs a reason to end one', () => {
    expect(
      contractEndSchema.safeParse({ version: 1, reason: '  ' }).success
    ).toBe(false)
    expect(
      contractEndSchema.parse({ version: 1, reason: ' No budget ' }).reason
    ).toBe('No budget')
  })

  it('lists the next 90 days unless told 30 or 60', () => {
    expect(contractListQuerySchema.parse({})).toMatchObject({
      view: 'upcoming',
      window: 90,
      owner: 'anyone',
      limit: 50
    })
    expect(contractListQuerySchema.parse({ window: '30' }).window).toBe(30)
    expect(contractListQuerySchema.safeParse({ window: '45' }).success).toBe(
      false
    )
  })
})

describe('canEditContract', () => {
  it('follows the company: its owner, managers and admins', () => {
    expect(canEditContract('member', 'u1', 'u1')).toBe(true)
    expect(canEditContract('member', 'u1', 'u2')).toBe(false)
    expect(canEditContract('manager', 'u1', 'u2')).toBe(true)
  })
})
