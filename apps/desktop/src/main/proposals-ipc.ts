import type { TProposal } from '@open-sales/shared'
import {
  proposalApproveSchema,
  proposalConflictSchema,
  proposalCreateSchema,
  proposalDeclineSchema,
  proposalListQuerySchema,
  proposalPageSchema,
  proposalSchema
} from '@open-sales/shared'
import { ipcMain } from 'electron'
import { z } from 'zod'

import type { TProposalResult } from '../preload/bridge-types'
import { PROPOSALS_CHANNELS } from '../preload/bridge-types'
import type { TConnection } from './connection'
import { ServerProblem } from './server-api'

type TFetch = typeof fetch

const REQUEST_TIMEOUT_MS = 8000

const INVALID = { ok: false, message: 'Check the form and try again.' } as const

const idSchema = z.string().min(1).max(64)

/** The server's answer to a proposal call: the body, or its refusal. */
type TAnswer =
  | { ok: true; body: unknown }
  | { ok: false; message: string; code?: string; proposal?: TProposal }

/**
 * Calls /api/v1/proposals as the signed-in person. A refusal comes back as
 * an answer, not a thrown problem, so it can carry the proposal with it.
 */
const createProposalsApi = (fetchFn: TFetch) => {
  const request = async (
    serverUrl: string,
    token: string,
    path: string,
    body?: unknown
  ): Promise<TAnswer> => {
    let response: Response
    try {
      response = await fetchFn(`${serverUrl}/api/v1/proposals${path}`, {
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
          : `Couldn’t reach ${new URL(serverUrl).host}. Check that the server is running.`
      )
    }
    const json: unknown = await response.json().catch(() => null)
    if (response.ok) return { ok: true, body: json }
    const refusal = proposalConflictSchema.safeParse(json)
    return {
      ok: false,
      message: refusal.data?.error.message ?? 'That didn’t work. Try again.',
      code: refusal.data?.error.code,
      proposal: refusal.data?.proposal
    }
  }

  return { request }
}

/**
 * AI's proposed changes, as the signed-in person. Everything the renderer
 * sends is checked here, and again by the server.
 */
export const registerProposalsIpc = (
  { withSession }: TConnection,
  fetchFn: TFetch = fetch
) => {
  const api = createProposalsApi(fetchFn)

  /** One proposal back, or the server's refusal with what it carried. */
  const callForProposal = async (
    path: string,
    body: unknown
  ): Promise<TProposalResult> => {
    const result = await withSession((serverUrl, token) =>
      api.request(serverUrl, token, path, body)
    )
    if (!result.ok) return result
    const answer = result.data
    if (!answer.ok) return answer
    return { ok: true, data: proposalSchema.parse(answer.body) }
  }

  ipcMain.handle(PROPOSALS_CHANNELS.list, async (_event, query: unknown) => {
    const parsed = proposalListQuerySchema.safeParse(query ?? {})
    if (!parsed.success) return INVALID
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value !== undefined) params.set(key, String(value))
    }
    const result = await withSession((serverUrl, token) =>
      api.request(serverUrl, token, `?${params}`)
    )
    if (!result.ok) return result
    const answer = result.data
    if (!answer.ok) return answer
    return { ok: true, data: proposalPageSchema.parse(answer.body) }
  })

  ipcMain.handle(PROPOSALS_CHANNELS.create, (_event, input: unknown) => {
    const parsed = proposalCreateSchema.safeParse(input)
    return parsed.success
      ? callForProposal('', parsed.data)
      : { ok: false, message: parsed.error.issues[0].message }
  })

  ipcMain.handle(
    PROPOSALS_CHANNELS.approve,
    (_event, id: unknown, input: unknown) => {
      const parsedId = idSchema.safeParse(id)
      const parsed = proposalApproveSchema.safeParse(input ?? {})
      if (!parsedId.success) return INVALID
      return parsed.success
        ? callForProposal(
            `/${encodeURIComponent(parsedId.data)}/approve`,
            parsed.data
          )
        : { ok: false, message: parsed.error.issues[0].message }
    }
  )

  ipcMain.handle(
    PROPOSALS_CHANNELS.decline,
    (_event, id: unknown, reason: unknown) => {
      const parsedId = idSchema.safeParse(id)
      const parsed = proposalDeclineSchema.safeParse({ reason: reason ?? null })
      if (!parsedId.success) return INVALID
      return parsed.success
        ? callForProposal(
            `/${encodeURIComponent(parsedId.data)}/decline`,
            parsed.data
          )
        : { ok: false, message: parsed.error.issues[0].message }
    }
  )

  for (const [channel, action] of [
    [PROPOSALS_CHANNELS.undo, 'undo'],
    [PROPOSALS_CHANNELS.sendToOwner, 'send-to-owner']
  ] as const) {
    ipcMain.handle(channel, (_event, id: unknown) => {
      const parsedId = idSchema.safeParse(id)
      return parsedId.success
        ? callForProposal(`/${encodeURIComponent(parsedId.data)}/${action}`, {})
        : INVALID
    })
  }
}
