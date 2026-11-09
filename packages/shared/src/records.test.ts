import { describe, expect, it } from 'vitest'

import {
  companyCreateSchema,
  dealCreateSchema,
  listQuerySchema,
  normaliseDomain,
  personCreateSchema,
  personUpdateSchema
} from './records'

describe('normaliseDomain', () => {
  it('turns pasted links into a bare domain', () => {
    expect(normaliseDomain('https://www.Halden.com/about?x=1')).toBe(
      'halden.com'
    )
    expect(normaliseDomain('  HALDEN.co.uk. ')).toBe('halden.co.uk')
    expect(normaliseDomain('halden.com:8080')).toBe('halden.com')
  })
})

describe('companyCreateSchema', () => {
  it('stores empty optional boxes as null', () => {
    const parsed = companyCreateSchema.parse({
      name: ' Halden Capital ',
      domain: '',
      industry: '  '
    })
    expect(parsed).toEqual({
      name: 'Halden Capital',
      domain: null,
      industry: null
    })
  })

  it('cleans the domain and refuses one that isn’t', () => {
    expect(
      companyCreateSchema.parse({ name: 'H', domain: 'www.halden.com/' }).domain
    ).toBe('halden.com')
    expect(
      companyCreateSchema.safeParse({ name: 'H', domain: 'not a domain' })
        .success
    ).toBe(false)
  })

  it('needs a name', () => {
    const parsed = companyCreateSchema.safeParse({ name: '  ' })
    expect(parsed.error?.issues[0].message).toBe('Enter the company’s name')
  })
})

describe('personCreateSchema', () => {
  it('needs a company', () => {
    const parsed = personCreateSchema.safeParse({ name: 'Ravi Shah' })
    expect(parsed.success).toBe(false)
  })

  it('lower-cases email and checks links', () => {
    const parsed = personCreateSchema.parse({
      companyId: 'c1',
      name: 'Ravi Shah',
      email: ' Ravi@Halden.com ',
      linkedinUrl: ''
    })
    expect(parsed.email).toBe('ravi@halden.com')
    expect(parsed.linkedinUrl).toBeNull()
    expect(
      personCreateSchema.safeParse({
        companyId: 'c1',
        name: 'R',
        linkedinUrl: 'javascript:alert(1)'
      }).success
    ).toBe(false)
  })

  it('makes updates send their version', () => {
    expect(personUpdateSchema.safeParse({ name: 'R' }).success).toBe(false)
    expect(
      personUpdateSchema.safeParse({ name: 'R', version: 2 }).success
    ).toBe(true)
  })
})

describe('dealCreateSchema', () => {
  it('takes money in whole minor units', () => {
    const base = { companyId: 'c1', name: 'Renewal' }
    expect(
      dealCreateSchema.parse({
        ...base,
        valueMinor: 1_250_000,
        currency: 'usd'
      })
    ).toMatchObject({ valueMinor: 1_250_000, currency: 'USD' })
    expect(
      dealCreateSchema.safeParse({ ...base, valueMinor: 12.5 }).success
    ).toBe(false)
    expect(
      dealCreateSchema.safeParse({ ...base, valueMinor: -1 }).success
    ).toBe(false)
  })
})

describe('listQuerySchema', () => {
  it('has sensible defaults', () => {
    expect(listQuerySchema.parse({})).toEqual({
      owner: 'anyone',
      archived: false,
      limit: 50
    })
  })
})
