import { healthResponseSchema } from '@open-sales/shared'
import { describe, expect, it } from 'vitest'

import { createApp } from './app'

const getHealth = (isUp: boolean) =>
  createApp({
    version: '1.2.3',
    isDatabaseReachable: async () => isUp
  }).request('/api/v1/health')

describe('GET /api/v1/health', () => {
  it('says ok when the database answers', async () => {
    const response = await getHealth(true)

    expect(response.status).toBe(200)
    expect(healthResponseSchema.parse(await response.json())).toEqual({
      status: 'ok',
      database: 'up',
      version: '1.2.3'
    })
  })

  it('says degraded with a 503 when the database is down', async () => {
    const response = await getHealth(false)

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      status: 'degraded',
      database: 'down'
    })
  })
})
