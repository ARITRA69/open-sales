import type { TSessionUser } from '@open-sales/shared'
import {
  PLAYBOOK_ACTIONS,
  playbookActionRequestSchema,
  playbookCreateSchema,
  playbookListQuerySchema,
  playbookUpdateSchema
} from '@open-sales/shared'
import type { Context, Hono } from 'hono'

import type { TEnv } from '../http'
import { readBody, readQuery, sendError } from '../http'
import {
  ChangedSinceError,
  InvalidChangeError,
  isRecordId,
  NotAllowedError,
  RecordNotFoundError
} from '../records/common'
import type { TPlaybookService } from './service'

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
    if (error instanceof InvalidChangeError) {
      return sendError(c, 400, 'invalid_change', error.message)
    }
    throw error
  }
}

/**
 * Playbooks, under /api/v1/playbooks: list, get, create, `PATCH`, and
 * `/:id/publish`, `/unpublish`, `/archive`, `/restore`. Everyone signed in
 * reads published ones; the service checks who may see drafts and write.
 */
export const addPlaybookRoutes = (
  api: Hono<TEnv>,
  playbooks: TPlaybookService,
  getSessionUser: (headers: Headers) => Promise<TSessionUser | null>
) => {
  for (const pattern of ['/playbooks', '/playbooks/*']) {
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
    sendError(c, 404, 'not_found', 'That playbook doesn’t exist.')

  api.get('/playbooks', async (c) => {
    const query = readQuery(c, playbookListQuerySchema)
    if (!query.ok) return query.response
    return answer(c, () => playbooks.list(c.get('me'), query.data))
  })

  api.post('/playbooks', async (c) => {
    const body = await readBody(c, playbookCreateSchema)
    if (!body.ok) return body.response
    return answer(c, () => playbooks.create(c.get('me'), body.data), 201)
  })

  api.get('/playbooks/:id', async (c) => {
    const id = idOf(c)
    if (!id) return notFound(c)
    return answer(c, () => playbooks.get(c.get('me'), id))
  })

  api.patch('/playbooks/:id', async (c) => {
    const id = idOf(c)
    if (!id) return notFound(c)
    const body = await readBody(c, playbookUpdateSchema)
    if (!body.ok) return body.response
    return answer(c, () => playbooks.update(c.get('me'), id, body.data))
  })

  for (const action of PLAYBOOK_ACTIONS) {
    api.post(`/playbooks/:id/${action}`, async (c) => {
      const id = idOf(c)
      if (!id) return notFound(c)
      const body = await readBody(c, playbookActionRequestSchema)
      if (!body.ok) return body.response
      return answer(c, () =>
        playbooks.setState(c.get('me'), id, action, body.data.version)
      )
    })
  }
}
