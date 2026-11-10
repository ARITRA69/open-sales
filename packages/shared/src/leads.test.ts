import { describe, expect, it } from 'vitest'

import {
  companyDomainOfEmail,
  leadConvertSchema,
  leadCreateSchema,
  leadDisqualifySchema,
  leadListQuerySchema
} from './leads'
import {
  canAddDealOnConvert,
  canAssignLead,
  canConvertLeadInto,
  canWorkLead
} from './roles'

describe('canWorkLead', () => {
  it('lets a member work their own leads and ones nobody has', () => {
    expect(canWorkLead('member', 'u1', 'u1')).toBe(true)
    expect(canWorkLead('member', 'u1', null)).toBe(true)
  })

  it('keeps a member off a teammate’s lead', () => {
    expect(canWorkLead('member', 'u1', 'u2')).toBe(false)
  })

  it('lets managers and admins work any lead', () => {
    expect(canWorkLead('manager', 'u1', 'u2')).toBe(true)
    expect(canWorkLead('admin', 'u1', 'u2')).toBe(true)
  })
})

describe('canAssignLead', () => {
  it('lets managers and admins give a lead to anyone, or to nobody', () => {
    expect(canAssignLead('manager', 'u1', 'u2', 'u3')).toBe(true)
    expect(canAssignLead('admin', 'u1', 'u2', null)).toBe(true)
  })

  it('lets a member take a lead nobody has, and nothing more', () => {
    expect(canAssignLead('member', 'u1', null, 'u1')).toBe(true)
    // Not for someone else, not from someone else, and not giving theirs away.
    expect(canAssignLead('member', 'u1', null, 'u2')).toBe(false)
    expect(canAssignLead('member', 'u1', 'u2', 'u1')).toBe(false)
    expect(canAssignLead('member', 'u1', 'u1', 'u2')).toBe(false)
    expect(canAssignLead('member', 'u1', 'u1', null)).toBe(false)
  })
})

describe('converting a lead', () => {
  it('lets a member convert into an account someone else owns', () => {
    expect(canConvertLeadInto('member', 'u1', 'u1', 'u2')).toBe(true)
    expect(canConvertLeadInto('member', 'u1', null, 'u2')).toBe(true)
    expect(canConvertLeadInto('member', 'u1', null, null)).toBe(true)
  })

  it('still needs the lead to be theirs to work', () => {
    expect(canConvertLeadInto('member', 'u1', 'u2', 'u1')).toBe(false)
  })

  it('adds a deal only on a new account or one they may change', () => {
    expect(canAddDealOnConvert('member', 'u1', null)).toBe(true)
    expect(canAddDealOnConvert('member', 'u1', 'u1')).toBe(true)
    expect(canAddDealOnConvert('member', 'u1', 'u2')).toBe(false)
    expect(canAddDealOnConvert('manager', 'u1', 'u2')).toBe(true)
  })
})

describe('companyDomainOfEmail', () => {
  it('reads the company’s domain from a work address', () => {
    expect(companyDomainOfEmail('Dana@Halden.com')).toBe('halden.com')
  })

  it('reads nothing from free mail, or no email', () => {
    expect(companyDomainOfEmail('dana@gmail.com')).toBeNull()
    expect(companyDomainOfEmail('not an email')).toBeNull()
    expect(companyDomainOfEmail(null)).toBeNull()
  })
})

describe('lead schemas', () => {
  it('tidies a lead typed in by hand', () => {
    const parsed = leadCreateSchema.parse({
      name: '  Dana Whitfield ',
      email: 'Dana@Halden.com',
      phone: '+44 20 7946 0000',
      companyName: '',
      message: ' Saw you at the expo. '
    })
    expect(parsed).toEqual({
      name: 'Dana Whitfield',
      email: 'dana@halden.com',
      phone: '+442079460000',
      companyName: null,
      message: 'Saw you at the expo.'
    })
  })

  it('needs a name, and a real email if there is one', () => {
    expect(leadCreateSchema.safeParse({ name: ' ' }).success).toBe(false)
    expect(
      leadCreateSchema.safeParse({ name: 'Dana', email: 'dana@' }).success
    ).toBe(false)
  })

  it('lists the leads still to work unless asked otherwise', () => {
    expect(leadListQuerySchema.parse({})).toMatchObject({
      owner: 'anyone',
      status: 'open',
      limit: 50
    })
  })

  it('needs a reason to disqualify', () => {
    expect(
      leadDisqualifySchema.safeParse({ version: 1, reason: '  ' }).success
    ).toBe(false)
  })

  it('needs to know which account the person was shown', () => {
    expect(leadConvertSchema.safeParse({ version: 1 }).success).toBe(false)
    expect(
      leadConvertSchema.safeParse({ version: 1, companyId: null }).success
    ).toBe(true)
  })
})
