import {
  leadAssignSchema,
  leadConvertedSchema,
  leadConvertSchema,
  leadCreateSchema,
  leadDisqualifySchema,
  leadListQuerySchema,
  leadMatchSchema,
  leadPageSchema,
  leadSchema
} from '@open-sales/shared'
import { ipcMain } from 'electron'
import { z } from 'zod'

import { LEADS_CHANNELS } from '../preload/bridge-types'
import type { TConnection } from './connection'
import { ServerProblem } from './server-api'

const INVALID = { ok: false, message: 'Check the form and try again.' } as const

const idSchema = z.string().min(1).max(64)
const versionSchema = z.number().int().positive()

/** The first thing wrong with a form, in the schema's words. */
const firstProblem = (error: z.ZodError) => ({
  ok: false as const,
  message: error.issues[0].message
})

/** List filters as a query string. Unset values are left out. */
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

// The same patience as server-api.ts's calls.
const REQUEST_TIMEOUT_MS = 8000

const errorBodySchema = z.object({
  error: z.object({ message: z.string(), code: z.string().optional() })
})

/**
 * One signed-in call under /leads: the body on success, or a problem with
 * the server's message and code. server-api.ts keeps its own request helper
 * to itself, so this is the same thing in small.
 */
const requestLeads = async (
  fetchFn: typeof fetch,
  serverUrl: string,
  token: string,
  path: string,
  body?: unknown
): Promise<unknown> => {
  let response: Response
  try {
    response = await fetchFn(`${serverUrl}/api/v1/leads${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' })
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
  } catch (error) {
    throw new ServerProblem(
      error instanceof Error && error.name === 'TimeoutError'
        ? 'The server didn’t answer in time. Try again in a moment.'
        : `Couldn’t reach ${new URL(serverUrl).host}. Check the address, and that the server is running.`
    )
  }
  if (!response.ok) {
    const problem = errorBodySchema.safeParse(
      await response.json().catch(() => null)
    )
    throw new ServerProblem(
      problem.data?.error.message ?? 'That didn’t work. Try again.',
      problem.data?.error.code
    )
  }
  return response.json()
}

/**
 * The Leads inbox, as the signed-in person. What the renderer sends is
 * checked here and again by the server; what the server answers is checked
 * against the shared schemas.
 */
export const registerLeadsIpc = (
  connection: TConnection,
  fetchFn: typeof fetch = fetch
) => {
  /** One call to /leads, with its answer checked. */
  const call = <TSchema extends z.ZodType>(
    schema: TSchema,
    path: string,
    body?: unknown
  ) =>
    connection.withSession(async (serverUrl, token) =>
      schema.parse(await requestLeads(fetchFn, serverUrl, token, path, body))
    )

  const pathOf = (id: string, action = '') =>
    `/${encodeURIComponent(id)}${action}`

  ipcMain.handle(LEADS_CHANNELS.list, (_event, query: unknown) => {
    const parsed = leadListQuerySchema.safeParse(query ?? {})
    return parsed.success
      ? call(leadPageSchema, toQueryString(parsed.data))
      : INVALID
  })

  ipcMain.handle(LEADS_CHANNELS.get, (_event, id: unknown) => {
    const parsed = idSchema.safeParse(id)
    return parsed.success ? call(leadSchema, pathOf(parsed.data)) : INVALID
  })

  ipcMain.handle(LEADS_CHANNELS.create, (_event, input: unknown) => {
    const parsed = leadCreateSchema.safeParse(input)
    return parsed.success
      ? call(leadSchema, '', parsed.data)
      : firstProblem(parsed.error)
  })

  ipcMain.handle(
    LEADS_CHANNELS.assign,
    (_event, id: unknown, input: unknown) => {
      const parsedId = idSchema.safeParse(id)
      const parsed = leadAssignSchema.safeParse(input)
      return parsedId.success && parsed.success
        ? call(leadSchema, pathOf(parsedId.data, '/assign'), parsed.data)
        : INVALID
    }
  )

  for (const action of ['qualify', 'reopen'] as const) {
    ipcMain.handle(
      LEADS_CHANNELS[action],
      (_event, id: unknown, version: unknown) => {
        const parsed = z
          .tuple([idSchema, versionSchema])
          .safeParse([id, version])
        return parsed.success
          ? call(leadSchema, pathOf(parsed.data[0], `/${action}`), {
              version: parsed.data[1]
            })
          : INVALID
      }
    )
  }

  ipcMain.handle(
    LEADS_CHANNELS.disqualify,
    (_event, id: unknown, input: unknown) => {
      const parsedId = idSchema.safeParse(id)
      if (!parsedId.success) return INVALID
      const parsed = leadDisqualifySchema.safeParse(input)
      return parsed.success
        ? call(leadSchema, pathOf(parsedId.data, '/disqualify'), parsed.data)
        : firstProblem(parsed.error)
    }
  )

  ipcMain.handle(
    LEADS_CHANNELS.match,
    (_event, id: unknown, companyName: unknown) => {
      const parsed = z
        .tuple([idSchema, z.string().max(200).optional()])
        .safeParse([id, companyName ?? undefined])
      return parsed.success
        ? call(
            leadMatchSchema,
            pathOf(
              parsed.data[0],
              `/match${toQueryString({ companyName: parsed.data[1] })}`
            )
          )
        : INVALID
    }
  )

  ipcMain.handle(
    LEADS_CHANNELS.convert,
    (_event, id: unknown, input: unknown) => {
      const parsedId = idSchema.safeParse(id)
      if (!parsedId.success) return INVALID
      const parsed = leadConvertSchema.safeParse(input)
      return parsed.success
        ? call(
            leadConvertedSchema,
            pathOf(parsedId.data, '/convert'),
            parsed.data
          )
        : firstProblem(parsed.error)
    }
  )
}
