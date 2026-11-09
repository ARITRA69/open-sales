import type { THealthResponse } from '@open-sales/shared'
import { Hono } from 'hono'

type TAppDeps = {
  version: string
  // Passed in rather than imported, so tests run without Postgres.
  isDatabaseReachable: () => Promise<boolean>
}

/** The Sales API. Every route lives under /api/v1. */
export const createApp = ({ version, isDatabaseReachable }: TAppDeps) => {
  const api = new Hono().basePath('/api/v1')

  api.get('/health', async (c) => {
    const isUp = await isDatabaseReachable()
    const body: THealthResponse = {
      status: isUp ? 'ok' : 'degraded',
      database: isUp ? 'up' : 'down',
      version
    }
    return c.json(body, isUp ? 200 : 503)
  })

  return api
}
