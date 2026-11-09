import type { TApiError, THealthResponse } from '@open-sales/shared'
import { setupRequestSchema } from '@open-sales/shared'
import type { Context } from 'hono'
import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import type { TSetupService } from './setup'
import { SetupAlreadyDoneError } from './setup'

type TAppDeps = {
  version: string
  // Passed in rather than imported, so tests run without Postgres.
  isDatabaseReachable: () => Promise<boolean>
  // Better Auth's request handler, for everything under /api/v1/auth
  // (AUTH_BASE_PATH in auth.ts).
  handleAuth: (request: Request) => Promise<Response>
  setup: TSetupService
}

const sendError = (
  c: Context,
  status: ContentfulStatusCode,
  code: string,
  message: string
) => c.json<TApiError>({ error: { code, message } }, status)

/** The Sales API. Every route lives under /api/v1. */
export const createApp = ({
  version,
  isDatabaseReachable,
  handleAuth,
  setup
}: TAppDeps) => {
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

  api.get('/setup', async (c) => c.json(await setup.getStatus()))

  api.post('/setup', async (c) => {
    const parsed = setupRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    )
    if (!parsed.success) {
      const [firstIssue] = parsed.error.issues
      return sendError(c, 400, 'invalid_request', firstIssue.message)
    }

    try {
      return c.json(await setup.run(parsed.data), 201)
    } catch (error) {
      if (error instanceof SetupAlreadyDoneError) {
        return sendError(c, 409, 'already_set_up', error.message)
      }
      throw error
    }
  })

  // Accounts come from setup now and invites later, never open sign-up.
  api.all('/auth/sign-up/*', (c) =>
    sendError(c, 404, 'not_found', 'Ask your admin for an invite.')
  )
  api.on(['GET', 'POST'], '/auth/*', (c) => handleAuth(c.req.raw))

  return api
}
