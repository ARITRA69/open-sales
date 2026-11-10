import type { TPlaybookAction } from '@open-sales/shared'
import {
  PLAYBOOK_ACTIONS,
  playbookCreateSchema,
  playbookListQuerySchema,
  playbookSchema,
  playbookUpdateSchema
} from '@open-sales/shared'
import { ipcMain } from 'electron'
import { z } from 'zod'

import { PLAYBOOKS_CHANNELS } from '../preload/bridge-types'
import type { TConnection } from './connection'
import { ServerProblem } from './server-api'

// The same patience as the rest of the app's server calls.
const REQUEST_TIMEOUT_MS = 8000

const INVALID = { ok: false, message: 'Check the form and try again.' } as const

const errorBodySchema = z.object({
  error: z
    .object({ message: z.string(), code: z.string().optional() })
    .optional()
})

const pageSchema = z.object({
  items: z.array(playbookSchema),
  nextCursor: z.string().nullable()
})

/** Calls the playbooks API. The main process uses it; the renderer never does. */
export const createPlaybooksApi = (fetchFn: typeof fetch = fetch) => {
  /** A signed-in call: a problem in plain words on failure, else the body. */
  const request = async (
    serverUrl: string,
    token: string,
    path: string,
    send?: { method: 'POST' | 'PATCH'; body: unknown }
  ): Promise<unknown> => {
    let response: Response
    try {
      response = await fetchFn(`${serverUrl}/api/v1/playbooks${path}`, {
        method: send?.method ?? 'GET',
        headers: {
          authorization: `Bearer ${token}`,
          ...(send ? { 'content-type': 'application/json' } : {})
        },
        body: send ? JSON.stringify(send.body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new ServerProblem(
          'The server didn’t answer in time. Try again in a moment.'
        )
      }
      throw new ServerProblem(
        `Couldn’t reach ${new URL(serverUrl).host}. Check that the server is running.`
      )
    }
    if (!response.ok) {
      const body = errorBodySchema.safeParse(
        await response.json().catch(() => null)
      )
      throw new ServerProblem(
        body.data?.error?.message ?? 'That didn’t work. Try again.',
        body.data?.error?.code
      )
    }
    return response.json()
  }

  return {
    list: async (
      serverUrl: string,
      token: string,
      query: Record<string, unknown> = {}
    ) => {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== '') {
          params.set(key, String(value))
        }
      }
      const text = params.toString()
      return pageSchema.parse(
        await request(serverUrl, token, text ? `?${text}` : '')
      )
    },
    get: async (serverUrl: string, token: string, id: string) =>
      playbookSchema.parse(
        await request(serverUrl, token, `/${encodeURIComponent(id)}`)
      ),
    create: async (serverUrl: string, token: string, input: unknown) =>
      playbookSchema.parse(
        await request(serverUrl, token, '', { method: 'POST', body: input })
      ),
    update: async (
      serverUrl: string,
      token: string,
      id: string,
      input: unknown
    ) =>
      playbookSchema.parse(
        await request(serverUrl, token, `/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: input
        })
      ),
    setState: async (
      serverUrl: string,
      token: string,
      id: string,
      action: TPlaybookAction,
      version: number
    ) =>
      playbookSchema.parse(
        await request(
          serverUrl,
          token,
          `/${encodeURIComponent(id)}/${action}`,
          { method: 'POST', body: { version } }
        )
      )
  }
}

export type TPlaybooksApi = ReturnType<typeof createPlaybooksApi>

const idSchema = z.string().min(1).max(64)

/**
 * Answers the renderer's playbook requests as the signed-in person.
 * Everything it sends is checked here, and again by the server.
 */
export const registerPlaybooksIpc = (
  { withSession }: Pick<TConnection, 'withSession'>,
  api: TPlaybooksApi = createPlaybooksApi()
) => {
  ipcMain.handle(PLAYBOOKS_CHANNELS.list, (_event, query: unknown) => {
    // Checked as typed, and sent as typed: the server applies the defaults.
    const parsed = playbookListQuerySchema.safeParse(query ?? {})
    if (!parsed.success) return INVALID
    return withSession((serverUrl, token) =>
      api.list(serverUrl, token, (query ?? {}) as Record<string, unknown>)
    )
  })

  ipcMain.handle(PLAYBOOKS_CHANNELS.get, (_event, id: unknown) => {
    const parsed = idSchema.safeParse(id)
    if (!parsed.success) return INVALID
    return withSession((serverUrl, token) =>
      api.get(serverUrl, token, parsed.data)
    )
  })

  ipcMain.handle(PLAYBOOKS_CHANNELS.create, (_event, input: unknown) => {
    const parsed = playbookCreateSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0].message }
    }
    return withSession((serverUrl, token) =>
      api.create(serverUrl, token, parsed.data)
    )
  })

  ipcMain.handle(
    PLAYBOOKS_CHANNELS.update,
    (_event, id: unknown, input: unknown) => {
      const parsedId = idSchema.safeParse(id)
      if (!parsedId.success) return INVALID
      const parsed = playbookUpdateSchema.safeParse(input)
      if (!parsed.success) {
        return { ok: false, message: parsed.error.issues[0].message }
      }
      return withSession((serverUrl, token) =>
        api.update(serverUrl, token, parsedId.data, parsed.data)
      )
    }
  )

  ipcMain.handle(
    PLAYBOOKS_CHANNELS.setState,
    (_event, id: unknown, action: unknown, version: unknown) => {
      const parsed = z
        .tuple([
          idSchema,
          z.enum(PLAYBOOK_ACTIONS),
          z.number().int().positive()
        ])
        .safeParse([id, action, version])
      if (!parsed.success) return INVALID
      return withSession((serverUrl, token) =>
        api.setState(serverUrl, token, ...parsed.data)
      )
    }
  )
}
