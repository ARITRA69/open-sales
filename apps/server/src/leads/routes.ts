import type { TSessionUser } from '@open-sales/shared'
import {
  leadAssignSchema,
  leadConvertSchema,
  leadCreateSchema,
  leadDisqualifySchema,
  leadListQuerySchema,
  leadMatchQuerySchema,
  leadVersionSchema
} from '@open-sales/shared'
import type { Context, Hono } from 'hono'

import type { TEnv } from '../http'
import { readBody, readQuery, sendError } from '../http'
import {
  ChangedSinceError,
  DuplicateError,
  InvalidChangeError,
  isRecordId,
  NotAllowedError,
  RecordNotFoundError
} from '../records/common'
import type { TLeadsService } from './leads'
import { MatchChangedError } from './leads'

/** The service's errors, as answers. Anything else is a real failure. */
const answerError = (c: Context, error: unknown) => {
  if (error instanceof RecordNotFoundError) {
    return sendError(c, 404, 'not_found', error.message)
  }
  if (error instanceof NotAllowedError) {
    return sendError(c, 403, 'forbidden', error.message)
  }
  if (error instanceof ChangedSinceError) {
    return sendError(c, 409, 'changed_since', error.message)
  }
  if (error instanceof MatchChangedError) {
    return sendError(c, 409, 'match_changed', error.message)
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
 * The Leads inbox, under /api/v1/leads. Everyone signed in reads every lead;
 * the service checks who may assign, work and convert them.
 */
export const addLeadRoutes = (
  api: Hono<TEnv>,
  leads: TLeadsService,
  getSessionUser: (headers: Headers) => Promise<TSessionUser | null>
) => {
  for (const pattern of ['/leads', '/leads/*']) {
    api.use(pattern, async (c, next) => {
      const me = await getSessionUser(c.req.raw.headers)
      if (!me) return sendError(c, 401, 'signed_out', 'Sign in again.')
      c.set('me', me)
      await next()
    })
  }

  // Ids are UUIDs: anything else is answered as not found, not an error.
  const idOf = (c: Context<TEnv>) => {
    const id = c.req.param('id') ?? ''
    return isRecordId(id) ? id : null
  }
  const notFound = (c: Context<TEnv>) =>
    sendError(c, 404, 'not_found', 'That lead doesn’t exist.')

  api.get('/leads', async (c) => {
    const query = readQuery(c, leadListQuerySchema)
    if (!query.ok) return query.response
    return answer(c, () => leads.list(c.get('me'), query.data))
  })

  api.post('/leads', async (c) => {
    const body = await readBody(c, leadCreateSchema)
    if (!body.ok) return body.response
    return answer(c, () => leads.create(c.get('me'), body.data), 201)
  })

  api.get('/leads/:id', async (c) => {
    const id = idOf(c)
    if (!id) return notFound(c)
    return answer(c, () => leads.get(c.get('me'), id))
  })

  // What converting would do: the account and person it already matches.
  api.get('/leads/:id/match', async (c) => {
    const id = idOf(c)
    if (!id) return notFound(c)
    const query = readQuery(c, leadMatchQuerySchema)
    if (!query.ok) return query.response
    return answer(c, () => leads.match(c.get('me'), id, query.data.companyName))
  })

  api.post('/leads/:id/assign', async (c) => {
    const id = idOf(c)
    if (!id) return notFound(c)
    const body = await readBody(c, leadAssignSchema)
    if (!body.ok) return body.response
    return answer(c, () => leads.assign(c.get('me'), id, body.data))
  })

  for (const action of ['qualify', 'reopen'] as const) {
    api.post(`/leads/:id/${action}`, async (c) => {
      const id = idOf(c)
      if (!id) return notFound(c)
      const body = await readBody(c, leadVersionSchema)
      if (!body.ok) return body.response
      return answer(c, () => leads[action](c.get('me'), id, body.data.version))
    })
  }

  api.post('/leads/:id/disqualify', async (c) => {
    const id = idOf(c)
    if (!id) return notFound(c)
    const body = await readBody(c, leadDisqualifySchema)
    if (!body.ok) return body.response
    return answer(c, () => leads.disqualify(c.get('me'), id, body.data))
  })

  api.post('/leads/:id/convert', async (c) => {
    const id = idOf(c)
    if (!id) return notFound(c)
    const body = await readBody(c, leadConvertSchema)
    if (!body.ok) return body.response
    return answer(c, () => leads.convert(c.get('me'), id, body.data))
  })
}
