import type { TSessionUser } from '@open-sales/shared'
import {
  contractCandidateQuerySchema,
  contractCreateSchema,
  contractEndSchema,
  contractListQuerySchema,
  contractReopenSchema,
  renewalStartSchema
} from '@open-sales/shared'
import type { Context, Hono } from 'hono'

import type { TEnv } from '../http'
import { readBody, readQuery, sendError } from '../http'
import {
  ChangedSinceError,
  DuplicateError,
  InvalidChangeError,
  NotAllowedError,
  RecordNotFoundError
} from '../records/common'
import type { TContractService } from './contracts'

/** The service's errors, as answers. Anything else is a real failure. */
const answer = async (
  c: Context<TEnv>,
  work: () => Promise<unknown>,
  status: 200 | 201 = 200
) => {
  try {
    return c.json(await work(), status)
  } catch (error) {
    if (error instanceof RecordNotFoundError) {
      return sendError(c, 404, 'not_found', error.message)
    }
    if (error instanceof NotAllowedError) {
      return sendError(c, 403, 'forbidden', error.message)
    }
    if (error instanceof ChangedSinceError) {
      return sendError(c, 409, 'changed_since', error.message)
    }
    if (error instanceof DuplicateError) {
      return sendError(c, 409, error.code, error.message)
    }
    if (error instanceof InvalidChangeError) {
      return sendError(c, 400, 'invalid_change', error.message)
    }
    throw error
  }
}

/**
 * Contracts and their renewals, under /api/v1/contracts. Everyone signed in
 * can read them; the service checks who may change which.
 */
export const addContractRoutes = (
  api: Hono<TEnv>,
  contracts: TContractService,
  getSessionUser: (headers: Headers) => Promise<TSessionUser | null>
) => {
  for (const pattern of ['/contracts', '/contracts/*']) {
    api.use(pattern, async (c, next) => {
      const me = await getSessionUser(c.req.raw.headers)
      if (!me) return sendError(c, 401, 'signed_out', 'Sign in again.')
      c.set('me', me)
      await next()
    })
  }

  const idOf = (c: Context<TEnv>) => c.req.param('id') ?? ''

  api.get('/contracts', async (c) => {
    const query = readQuery(c, contractListQuerySchema)
    if (!query.ok) return query.response
    return answer(c, () => contracts.list(c.get('me'), query.data))
  })

  // Won deals without a contract. Before `/:id`, so it isn't read as one.
  api.get('/contracts/candidates', async (c) => {
    const query = readQuery(c, contractCandidateQuerySchema)
    if (!query.ok) return query.response
    return answer(c, () => contracts.candidates(c.get('me'), query.data))
  })

  api.post('/contracts', async (c) => {
    const body = await readBody(c, contractCreateSchema)
    if (!body.ok) return body.response
    return answer(c, () => contracts.create(c.get('me'), body.data), 201)
  })

  api.get('/contracts/:id', (c) =>
    answer(c, () => contracts.get(c.get('me'), idOf(c)))
  )

  api.post('/contracts/:id/start-renewal', async (c) => {
    const body = await readBody(c, renewalStartSchema)
    if (!body.ok) return body.response
    return answer(c, () =>
      contracts.startRenewal(c.get('me'), idOf(c), body.data)
    )
  })

  api.post('/contracts/:id/end', async (c) => {
    const body = await readBody(c, contractEndSchema)
    if (!body.ok) return body.response
    return answer(c, () => contracts.end(c.get('me'), idOf(c), body.data))
  })

  api.post('/contracts/:id/reopen', async (c) => {
    const body = await readBody(c, contractReopenSchema)
    if (!body.ok) return body.response
    return answer(c, () =>
      contracts.reopen(c.get('me'), idOf(c), body.data.version)
    )
  })
}
