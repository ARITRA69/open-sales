import { describe, expect, it } from 'vitest'

import { canEditCompany, canEditDeal, canReassign } from './roles'

describe('canEditCompany', () => {
  it('lets a member edit only companies they own', () => {
    expect(canEditCompany('member', 'u1', 'u1')).toBe(true)
    expect(canEditCompany('member', 'u1', 'u2')).toBe(false)
  })

  it('lets managers and admins edit any company', () => {
    expect(canEditCompany('manager', 'u1', 'u2')).toBe(true)
    expect(canEditCompany('admin', 'u1', 'u2')).toBe(true)
  })
})

describe('canEditDeal', () => {
  it('lets a member edit deals they own, or on companies they own', () => {
    expect(
      canEditDeal('member', 'u1', { ownerId: 'u1', companyOwnerId: 'u2' })
    ).toBe(true)
    expect(
      canEditDeal('member', 'u1', { ownerId: 'u2', companyOwnerId: 'u1' })
    ).toBe(true)
    expect(
      canEditDeal('member', 'u1', { ownerId: 'u2', companyOwnerId: 'u2' })
    ).toBe(false)
    expect(
      canEditDeal('manager', 'u1', { ownerId: 'u2', companyOwnerId: 'u2' })
    ).toBe(true)
  })
})

describe('canReassign', () => {
  it('is for managers and admins', () => {
    expect(canReassign('member')).toBe(false)
    expect(canReassign('manager')).toBe(true)
    expect(canReassign('admin')).toBe(true)
  })
})
