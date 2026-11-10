import type { TSessionUser } from '@open-sales/shared'
import {
  proposalApproveSchema,
  proposalCreateSchema,
  proposalDeclineSchema,
  proposalListQuerySchema
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
import type { TProposalsService } from './service'
import {
  AlreadyDecidedError,
  NotYoursError,
  UndoConflictError,
  UndoExpiredError
} from './service'

/** The service's errors, as answers. Anything else is a real failure. */
const answerError = (c: Context, error: unknown) => {
  if (error instanceof RecordNotFoundError) {
    return sendError(c, 404, 'not_found', error.message)
  }
  // `forbidden`: their role doesn't allow the change itself.
  if (error instanceof NotAllowedError) {
    return sendError(c, 403, 'forbidden', error.message)
  }
  // `not_yours`: someone else decides this proposal.
  if (error instanceof NotYoursError) {
    return sendError(c, 403, 'not_yours', error.message)
  }
  if (
    error instanceof ChangedSinceError ||
    error instanceof UndoConflictError
  ) {
    return sendError(c, 409, 'changed_since', error.message)
  }
  if (error instanceof AlreadyDecidedError) {
    return sendError(c, 409, 'already_decided', error.message)
  }
  if (error instanceof UndoExpiredError) {
    return sendError(c, 409, 'undo_expired', error.message)
  }
  if (error instanceof DuplicateError) {
    return sendError(c, 409, error.code, error.message)
  }
  if (error instanceof InvalidChangeError) {
    return sendError(c, 400, 'invalid_change', error.message)
  }
  throw error
}

const answer = async (
  c: Context<TEnv>,
  work: () => Promise<unknown>,
  status: 200 | 201 = 200
) => {
  try {
    return c.json(await work(), status)
  } catch (error) {
    return answerError(c, error)
  }
}

/**
 * Proposals, under /api/v1/proposals. Everyone signed in can read them; the
 * service checks who may make one and who decides it.
 */
export const addProposalRoutes = (
  api: Hono<TEnv>,
  proposals: TProposalsService,
  getSessionUser: (headers: Headers) => Promise<TSessionUser | null>
) => {
  for (const pattern of ['/proposals', '/proposals/*']) {
    api.use(pattern, async (c, next) => {
      const me = await getSessionUser(c.req.raw.headers)
      if (!me) return sendError(c, 401, 'signed_out', 'Sign in again.')
      c.set('me', me)
      await next()
    })
  }

  api.get('/proposals', async (c) => {
    const query = readQuery(c, proposalListQuerySchema)
    if (!query.ok) return query.response
    return answer(c, () => proposals.list(c.get('me'), query.data))
  })

  api.post('/proposals', async (c) => {
    const body = await readBody(c, proposalCreateSchema)
    if (!body.ok) return body.response
    return answer(c, () => proposals.create(c.get('me'), body.data), 201)
  })

  api.get('/proposals/:id', (c) =>
    answer(c, () => proposals.get(c.get('me'), c.req.param('id')))
  )

  api.post('/proposals/:id/approve', async (c) => {
    const body = await readBody(c, proposalApproveSchema)
    if (!body.ok) return body.response
    try {
      const result = await proposals.approve(
        c.get('me'),
        c.req.param('id'),
        body.data
      )
      if (result.outcome === 'approved') return c.json(result.proposal)
      // Nothing was saved. The answer carries the record's current values.
      return c.json(
        {
          error: {
            code: 'changed_since',
            message:
              'This changed after AI proposed it. Nothing was saved; look at what it says now.'
          },
          proposal: result.proposal
        },
        409
      )
    } catch (error) {
      return answerError(c, error)
    }
  })

  api.post('/proposals/:id/decline', async (c) => {
    const body = await readBody(c, proposalDeclineSchema)
    if (!body.ok) return body.response
    return answer(c, () =>
      proposals.decline(c.get('me'), c.req.param('id'), body.data)
    )
  })

  api.post('/proposals/:id/undo', (c) =>
    answer(c, () => proposals.undo(c.get('me'), c.req.param('id')))
  )

  api.post('/proposals/:id/send-to-owner', (c) =>
    answer(c, () => proposals.sendToOwner(c.get('me'), c.req.param('id')))
  )
}
