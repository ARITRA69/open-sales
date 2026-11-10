import type { TRecordRefType, TSessionUser } from '@open-sales/shared'
import {
  activityCreateSchema,
  activityUpdateSchema,
  taskActionSchema,
  taskCreateSchema,
  taskListQuerySchema,
  taskUpdateSchema,
  timelineQuerySchema
} from '@open-sales/shared'
import type { Context, Hono } from 'hono'

import type { TDatabase } from '../db/client'
import type { TEnv } from '../http'
import { readBody, readQuery, sendError } from '../http'
import {
  ChangedSinceError,
  DuplicateError,
  InvalidChangeError,
  NotAllowedError,
  RecordNotFoundError
} from '../records/common'
import { createPersonService } from '../records/people'
import { createActivityService } from './activities'
import { createTaskService } from './tasks'
import { createTimelineReader } from './timeline'

export const createTimelineService = (db: TDatabase) => {
  const people = createPersonService(db)
  return {
    ...createTimelineReader(db),
    activities: createActivityService(db),
    tasks: createTaskService(db),
    peopleAt: people.listAt,
    peopleOnDeal: people.listOnDeal
  }
}

export type TTimelineService = ReturnType<typeof createTimelineService>

/** The services' errors, as answers. Anything else is a real failure. */
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

// The pages a timeline hangs off, and the kind of record each one shows.
const RECORD_PATHS: Record<string, TRecordRefType> = {
  companies: 'company',
  people: 'person',
  deals: 'deal'
}

const SIGNED_IN_PATHS = [
  '/activities',
  '/activities/*',
  '/tasks',
  '/tasks/*',
  ...Object.keys(RECORD_PATHS).flatMap((path) => [
    `/${path}/:id/timeline`,
    `/${path}/:id/people`
  ])
]

/**
 * Timelines, notes, calls and tasks, under /api/v1. Everyone signed in can
 * read them and add to them; the services check who may change what.
 */
export const addTimelineRoutes = (
  api: Hono<TEnv>,
  timeline: TTimelineService,
  getSessionUser: (headers: Headers) => Promise<TSessionUser | null>
) => {
  for (const pattern of SIGNED_IN_PATHS) {
    api.use(pattern, async (c, next) => {
      const me = await getSessionUser(c.req.raw.headers)
      if (!me) return sendError(c, 401, 'signed_out', 'Sign in again.')
      c.set('me', me)
      await next()
    })
  }

  const idOf = (c: Context<TEnv>) => c.req.param('id') ?? ''

  for (const [path, type] of Object.entries(RECORD_PATHS)) {
    api.get(`/${path}/:id/timeline`, async (c) => {
      const query = readQuery(c, timelineQuerySchema)
      if (!query.ok) return query.response
      return answer(c, () =>
        timeline.read(c.get('me'), { type, id: idOf(c) }, query.data)
      )
    })
  }

  api.get('/companies/:id/people', (c) =>
    answer(c, async () => ({
      people: await timeline.peopleAt(c.get('me'), idOf(c))
    }))
  )
  api.get('/deals/:id/people', (c) =>
    answer(c, async () => ({
      people: await timeline.peopleOnDeal(c.get('me'), idOf(c))
    }))
  )

  /* Notes and calls */

  api.post('/activities', async (c) => {
    const body = await readBody(c, activityCreateSchema)
    if (!body.ok) return body.response
    return answer(
      c,
      () => timeline.activities.create(c.get('me'), body.data),
      201
    )
  })

  api.get('/activities/:id', (c) =>
    answer(c, () => timeline.activities.get(c.get('me'), idOf(c)))
  )

  api.patch('/activities/:id', async (c) => {
    const body = await readBody(c, activityUpdateSchema)
    if (!body.ok) return body.response
    return answer(c, () =>
      timeline.activities.update(c.get('me'), idOf(c), body.data)
    )
  })

  api.post('/activities/:id/archive', (c) =>
    answer(c, () => timeline.activities.archive(c.get('me'), idOf(c)))
  )

  /* Tasks */

  api.get('/tasks', async (c) => {
    const query = readQuery(c, taskListQuerySchema)
    if (!query.ok) return query.response
    return answer(c, () => timeline.tasks.list(c.get('me'), query.data))
  })

  api.post('/tasks', async (c) => {
    const body = await readBody(c, taskCreateSchema)
    if (!body.ok) return body.response
    return answer(c, () => timeline.tasks.create(c.get('me'), body.data), 201)
  })

  api.get('/tasks/:id', (c) =>
    answer(c, () => timeline.tasks.get(c.get('me'), idOf(c)))
  )

  api.patch('/tasks/:id', async (c) => {
    const body = await readBody(c, taskUpdateSchema)
    if (!body.ok) return body.response
    return answer(c, () =>
      timeline.tasks.update(c.get('me'), idOf(c), body.data)
    )
  })

  for (const action of ['complete', 'reopen', 'archive'] as const) {
    api.post(`/tasks/:id/${action}`, async (c) => {
      const body = await readBody(c, taskActionSchema)
      if (!body.ok) return body.response
      return answer(c, () =>
        timeline.tasks[action](c.get('me'), idOf(c), body.data.version)
      )
    })
  }
}
