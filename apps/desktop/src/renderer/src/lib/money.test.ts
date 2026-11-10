import { describe, expect, it } from 'vitest'

import { formatMoney, moneyInputValue, parseMoney } from './money'

describe('parseMoney', () => {
  it('reads amounts people type', () => {
    expect(parseMoney('12,500')).toBe(1_250_000)
    expect(parseMoney('$ 99.5')).toBe(9950)
    expect(parseMoney('0.07')).toBe(7)
  })

  it('treats empty as no value and nonsense as invalid', () => {
    expect(parseMoney('  ')).toBeNull()
    expect(parseMoney('12.345')).toBeUndefined()
    expect(parseMoney('ten')).toBeUndefined()
  })
})

describe('formatMoney', () => {
  it('drops cents on whole amounts and survives unknown codes', () => {
    expect(formatMoney(1_250_000, 'USD')).toBe('$12,500')
    expect(formatMoney(9950, 'USD')).toBe('$99.50')
    expect(formatMoney(null, 'USD')).toBe('')
    expect(formatMoney(100, 'ZZZ')).toContain('1')
  })

  it('round-trips through the input box', () => {
    expect(parseMoney(moneyInputValue(1_250_000))).toBe(1_250_000)
  })
})
