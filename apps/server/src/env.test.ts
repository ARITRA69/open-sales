import { describe, expect, it } from 'vitest'

import { readEnv } from './env'

describe('readEnv', () => {
  it('defaults the port to 8787', () => {
    expect(readEnv({ DATABASE_URL: 'postgres://u:p@db:5432/x' }).PORT).toBe(
      8787
    )
  })

  it('names what is missing', () => {
    expect(() => readEnv({})).toThrow(/DATABASE_URL/)
  })
})
