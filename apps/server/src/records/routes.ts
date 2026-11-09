import type { TSessionUser } from '@open-sales/shared'
import {
  archiveRequestSchema,
  companyCreateSchema,
  companyUpdateSchema,
  dealCreateSchema,
  dealListQuerySchema,
  dealUpdateSchema,
  listQuerySchema,
  personCreateSchema,
  personUpdateSchema
} from '@open-sales/shared'
import type { Context, Hono } from 'hono'
import type { z } from 'zod'

import type { TDatabase } from '../db/client'
import type { TEnv } from '../http'
import { readBody, readQuery, sendError } from '../http'
import type { TActor } from './common'
import {
  ChangedSinceError,
  DuplicateError,
  InvalidChangeError,
  isRecordId,
  NotAllowedError,
  RecordNotFoundError
} from './common'
import { createCompanyService } from './companies'
import { createDealService, createPipelineService } from './deals'
import { createPersonService } from './people'

export const createRecordsService = (db: TDatabase) => ({
  companies: createCompanyService(db),
  people: createPersonService(db),
  deals: createDealService(db),
  pipeline: createPipelineService(db)
})

export type TRecordsService = ReturnType<typeof createRecordsService>

// Every kind of record answers the same six calls.
type TResource<TQuery> = {
  list: (me: TActor, query: TQuery) => Promise<unknown>
  get: (me: TActor, id: string) => Promise<unknown>
  create: (me: TActor, input: never) => Promise<unknown>
  update: (me: TActor, id: string, input: never) => Promise<unknown>
  archive: (me: TActor, id: string, version: number) => Promise<unknown>
  restore: (me: TActor, id: string, version: number) => Promise<unknown>
}

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

const RECORD_PATHS = ['/companies', '/people', '/deals', '/pipeline']

/**
 * Companies, people, deals and the pipeline, under /api/v1. Everyone signed
 * in can read everything; the services check who may change what.
 */
export const addRecordRoutes = (
  api: Hono<TEnv>,
  records: TRecordsService,
  getSessionUser: (headers: Headers) => Promise<TSessionUser | null>
) => {
  for (const path of RECORD_PATHS) {
    for (const pattern of [path, `${path}/*`]) {
      api.use(pattern, async (c, next) => {
        const me = await getSessionUser(c.req.raw.headers)
        if (!me) return sendError(c, 401, 'signed_out', 'Sign in again.')
        c.set('me', me)
        await next()
      })
    }
  }

  const addResource = <TQuery>(
    path: string,
    service: TResource<TQuery>,
    schemas: {
      list: z.ZodType<TQuery>
      create: z.ZodType
      update: z.ZodType
    }
  ) => {
    // Ids are UUIDs: anything else is answered as not found, not an error.
    const idOf = (c: Context<TEnv>) => {
      const id = c.req.param('id') ?? ''
      return isRecordId(id) ? id : null
    }
    const notFound = (c: Context<TEnv>) =>
      sendError(c, 404, 'not_found', 'That record doesn’t exist.')

    api.get(path, async (c) => {
      const query = readQuery(c, schemas.list)
      if (!query.ok) return query.response
      return answer(c, () => service.list(c.get('me'), query.data))
    })

    api.post(path, async (c) => {
      const body = await readBody(c, schemas.create)
      if (!body.ok) return body.response
      return answer(
        c,
        () => service.create(c.get('me'), body.data as never),
        201
      )
    })

    api.get(`${path}/:id`, async (c) => {
      const id = idOf(c)
      if (!id) return notFound(c)
      return answer(c, () => service.get(c.get('me'), id))
    })

    api.patch(`${path}/:id`, async (c) => {
      const id = idOf(c)
      if (!id) return notFound(c)
      const body = await readBody(c, schemas.update)
      if (!body.ok) return body.response
      return answer(c, () =>
        service.update(c.get('me'), id, body.data as never)
      )
    })

    for (const action of ['archive', 'restore'] as const) {
      api.post(`${path}/:id/${action}`, async (c) => {
        const id = idOf(c)
        if (!id) return notFound(c)
        const body = await readBody(c, archiveRequestSchema)
        if (!body.ok) return body.response
        return answer(c, () =>
          service[action](c.get('me'), id, body.data.version)
        )
      })
    }
  }

  addResource('/companies', records.companies, {
    list: listQuerySchema,
    create: companyCreateSchema,
    update: companyUpdateSchema
  })
  addResource('/people', records.people, {
    list: listQuerySchema,
    create: personCreateSchema,
    update: personUpdateSchema
  })
  addResource('/deals', records.deals, {
    list: dealListQuerySchema,
    create: dealCreateSchema,
    update: dealUpdateSchema
  })

  api.get('/pipeline', (c) => answer(c, () => records.pipeline.get()))
  api.get('/pipeline/board', (c) =>
    answer(c, () => records.pipeline.board(c.get('me')))
  )
}
