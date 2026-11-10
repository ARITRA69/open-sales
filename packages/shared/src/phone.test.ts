import { describe, expect, it } from 'vitest'

import { formatPhone, phoneSchema, toE164 } from './phone'

describe('toE164', () => {
  it('reads international and national numbers', () => {
    expect(toE164('+44 20 7946 0000')).toBe('+442079460000')
    expect(toE164('020 7946 0000', 'GB')).toBe('+442079460000')
    expect(toE164('98765 43210', 'IN')).toBe('+919876543210')
  })

  it('refuses numbers that are too short or have no country', () => {
    expect(toE164('+44 20')).toBeNull()
    expect(toE164('020 7946 0000')).toBeNull()
  })
})

describe('formatPhone', () => {
  it('spaces a stored number out', () => {
    expect(formatPhone('+442079460000')).toBe('+44 20 7946 0000')
    expect(formatPhone(null)).toBe('')
  })
})

describe('phoneSchema', () => {
  it('stores E.164, and empty as null', () => {
    expect(phoneSchema.parse('+44 20 7946 0000')).toBe('+442079460000')
    expect(phoneSchema.parse('  ')).toBeNull()
    expect(phoneSchema.parse(null)).toBeNull()
    expect(phoneSchema.safeParse('call me').success).toBe(false)
  })
})
