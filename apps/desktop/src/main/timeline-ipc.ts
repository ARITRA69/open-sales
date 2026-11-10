import {
  activityCreateSchema,
  activitySchema,
  activityUpdateSchema,
  pageSchema,
  peopleOfRecordSchema,
  recordRefSchema,
  taskCreateSchema,
  taskListQuerySchema,
  taskSchema,
  taskUpdateSchema,
  timelineQuerySchema,
  timelineSchema
} from '@open-sales/shared'
import { ipcMain } from 'electron'
import { z } from 'zod'

import type { TApiResult } from '../preload/bridge-types'
import { TIMELINE_CHANNELS } from '../preload/bridge-types'
import type { TConnection } from './connection'

const INVALID = { ok: false, message: 'Check the form and try again.' } as const

// The pages a timeline hangs off, by the kind of record each one shows.
const RECORD_PATHS = {
  company: 'companies',
  person: 'people',
  deal: 'deals'
} as const

const idSchema = z.string().min(1).max(64)
const versionSchema = z.number().int().positive()

/** Filters as a query string. Unset values are left out. */
const toQueryString = (query: Record<string, unknown>) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value))
    }
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

const sendJson = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body)
})

/** The first problem with what the renderer sent, in people's words. */
const problemOf = (error: z.ZodError) => ({
  ok: false as const,
  message: error.issues[0].message
})

/**
 * Timelines, notes, calls and tasks, as the signed-in person. Everything the
 * renderer sends is checked here, and again by the server; every answer is
 * checked against the shared schemas.
 */
export const registerTimelineIpc = (connection: TConnection) => {
  /** A server call whose answer must fit `schema`. */
  const call = async <TSchema extends z.ZodType>(
    schema: TSchema,
    path: string,
    init?: RequestInit
  ): Promise<TApiResult<z.infer<TSchema>>> => {
    const answer = await connection.request(path, init)
    if (!answer.ok) return answer
    const parsed = schema.safeParse(answer.data)
    return parsed.success
      ? { ok: true, data: parsed.data }
      : { ok: false, message: 'The server sent something this app can’t read.' }
  }

  ipcMain.handle(
    TIMELINE_CHANNELS.read,
    (_event, record: unknown, query: unknown) => {
      const parsed = z
        .tuple([recordRefSchema, timelineQuerySchema])
        .safeParse([record, query ?? {}])
      if (!parsed.success) return INVALID
      const [{ type, id }, filters] = parsed.data
      return call(
        timelineSchema,
        `/${RECORD_PATHS[type]}/${encodeURIComponent(id)}/timeline${toQueryString(filters)}`
      )
    }
  )

  ipcMain.handle(TIMELINE_CHANNELS.createActivity, (_event, input: unknown) => {
    const parsed = activityCreateSchema.safeParse(input)
    return parsed.success
      ? call(activitySchema, '/activities', sendJson('POST', parsed.data))
      : problemOf(parsed.error)
  })

  ipcMain.handle(
    TIMELINE_CHANNELS.updateActivity,
    (_event, id: unknown, input: unknown) => {
      const parsedId = idSchema.safeParse(id)
      if (!parsedId.success) return INVALID
      const parsed = activityUpdateSchema.safeParse(input)
      return parsed.success
        ? call(
            activitySchema,
            `/activities/${encodeURIComponent(parsedId.data)}`,
            sendJson('PATCH', parsed.data)
          )
        : problemOf(parsed.error)
    }
  )

  ipcMain.handle(TIMELINE_CHANNELS.archiveActivity, (_event, id: unknown) => {
    const parsed = idSchema.safeParse(id)
    return parsed.success
      ? call(
          activitySchema,
          `/activities/${encodeURIComponent(parsed.data)}/archive`,
          sendJson('POST', {})
        )
      : INVALID
  })

  ipcMain.handle(TIMELINE_CHANNELS.listTasks, (_event, query: unknown) => {
    const parsed = taskListQuerySchema.safeParse(query ?? {})
    return parsed.success
      ? call(pageSchema(taskSchema), `/tasks${toQueryString(parsed.data)}`)
      : INVALID
  })

  ipcMain.handle(TIMELINE_CHANNELS.createTask, (_event, input: unknown) => {
    const parsed = taskCreateSchema.safeParse(input)
    return parsed.success
      ? call(taskSchema, '/tasks', sendJson('POST', parsed.data))
      : problemOf(parsed.error)
  })

  ipcMain.handle(
    TIMELINE_CHANNELS.updateTask,
    (_event, id: unknown, input: unknown) => {
      const parsedId = idSchema.safeParse(id)
      if (!parsedId.success) return INVALID
      const parsed = taskUpdateSchema.safeParse(input)
      return parsed.success
        ? call(
            taskSchema,
            `/tasks/${encodeURIComponent(parsedId.data)}`,
            sendJson('PATCH', parsed.data)
          )
        : problemOf(parsed.error)
    }
  )

  ipcMain.handle(
    TIMELINE_CHANNELS.setTaskDone,
    (_event, id: unknown, done: unknown, version: unknown) => {
      const parsed = z
        .tuple([idSchema, z.boolean(), versionSchema])
        .safeParse([id, done, version])
      if (!parsed.success) return INVALID
      const [taskId, isDone, seenVersion] = parsed.data
      return call(
        taskSchema,
        `/tasks/${encodeURIComponent(taskId)}/${isDone ? 'complete' : 'reopen'}`,
        sendJson('POST', { version: seenVersion })
      )
    }
  )

  ipcMain.handle(
    TIMELINE_CHANNELS.archiveTask,
    (_event, id: unknown, version: unknown) => {
      const parsed = z.tuple([idSchema, versionSchema]).safeParse([id, version])
      if (!parsed.success) return INVALID
      const [taskId, seenVersion] = parsed.data
      return call(
        taskSchema,
        `/tasks/${encodeURIComponent(taskId)}/archive`,
        sendJson('POST', { version: seenVersion })
      )
    }
  )

  ipcMain.handle(
    TIMELINE_CHANNELS.listPeople,
    async (_event, record: unknown) => {
      const parsed = z
        .object({ type: z.enum(['company', 'deal']), id: idSchema })
        .safeParse(record)
      if (!parsed.success) return INVALID
      const { type, id } = parsed.data
      const answer = await call(
        peopleOfRecordSchema,
        `/${RECORD_PATHS[type]}/${encodeURIComponent(id)}/people`
      )
      return answer.ok ? { ok: true, data: answer.data.people } : answer
    }
  )
}
