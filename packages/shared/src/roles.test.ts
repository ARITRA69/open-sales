import { describe, expect, it } from 'vitest'

import { canEditCompany } from './roles'

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
