import type { TSessionUser } from '@open-sales/shared'
import { forecastQuerySchema, reportQuerySchema } from '@open-sales/shared'
import type { Context, Hono } from 'hono'

import type { TEnv } from '../http'
import { readQuery, sendError } from '../http'
import { NotAllowedError, RecordNotFoundError } from '../records/common'
import type { TReportsService } from './service'

export { createReportsService } from './service'
export type { TReportsService } from './service'

/** The service's refusals, as answers. Anything else is a real failure. */
const answer = async (c: Context<TEnv>, work: () => Promise<unknown>) => {
  try {
    return c.json(await work())
  } catch (error) {
    if (error instanceof NotAllowedError) {
      return sendError(c, 403, 'forbidden', error.message)
    }
    if (error instanceof RecordNotFoundError) {
      return sendError(c, 404, 'not_found', error.message)
    }
    throw error
  }
}

/**
 * Reports, under /api/v1/reports. They only read. Everyone signed in sees
 * the pipeline and won-and-lost reports; the service keeps the forecast for
 * managers and admins.
 */
export const addReportRoutes = (
  api: Hono<TEnv>,
  reports: TReportsService,
  getSessionUser: (headers: Headers) => Promise<TSessionUser | null>
) => {
  api.use('/reports/*', async (c, next) => {
    const me = await getSessionUser(c.req.raw.headers)
    if (!me) return sendError(c, 401, 'signed_out', 'Sign in again.')
    c.set('me', me)
    await next()
  })

  api.get('/reports/pipeline', async (c) => {
    const query = readQuery(c, reportQuerySchema)
    if (!query.ok) return query.response
    return answer(c, () => reports.pipeline(c.get('me'), query.data))
  })

  api.get('/reports/won-lost', async (c) => {
    const query = readQuery(c, reportQuerySchema)
    if (!query.ok) return query.response
    return answer(c, () => reports.wonLost(c.get('me'), query.data))
  })

  api.get('/reports/forecast', async (c) => {
    const query = readQuery(c, forecastQuerySchema)
    if (!query.ok) return query.response
    return answer(c, () => reports.forecast(c.get('me'), query.data))
  })
}
