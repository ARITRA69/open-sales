import { describe, expect, it } from 'vitest'

import { newId } from './ids'

describe('newId', () => {
  it('makes version 7 UUIDs', () => {
    expect(newId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
  })

  it('sorts by the time they were made', () => {
    const earlier = newId(Date.UTC(2026, 0, 1))
    const later = newId(Date.UTC(2026, 0, 2))
    expect(earlier < later).toBe(true)
  })
})
