import type {
  TContractCreate,
  TContractEnd,
  TRenewalStart
} from '@open-sales/shared'
import {
  contractCandidateSchema,
  contractSchema,
  pageSchema
} from '@open-sales/shared'
import { z } from 'zod'

import { ServerProblem } from './server-api'

// Long enough for a slow network, short enough that a dead server fails fast.
const REQUEST_TIMEOUT_MS = 8000

const errorBodySchema = z.object({
  error: z
    .object({ message: z.string(), code: z.string().optional() })
    .optional()
})

/** List filters as a query string. Unset values are left out. */
const toQueryString = (query: Record<string, unknown> = {}) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value))
    }
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

/**
 * Calls /api/v1/contracts as the signed-in person. Answers are checked
 * against the shared schemas; a refusal is thrown as a `ServerProblem` with
 * the server's message and code, which `withSession` turns into a result.
 */
export const createRenewalsApi = (fetchFn: typeof fetch = fetch) => {
  const request = async (
    serverUrl: string,
    token: string,
    path: string,
    body?: unknown
  ): Promise<unknown> => {
    let response: Response
    try {
      response = await fetchFn(`${serverUrl}/api/v1/contracts${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' })
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new ServerProblem(
          'The server didn’t answer in time. Try again in a moment.'
        )
      }
      throw new ServerProblem(
        `Couldn’t reach ${new URL(serverUrl).host}. Check the address, and that the server is running.`
      )
    }
    const answer: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      const problem = errorBodySchema.safeParse(answer).data?.error
      throw new ServerProblem(
        problem?.message ?? 'That didn’t work. Try again.',
        problem?.code
      )
    }
    return answer
  }

  const act = async (
    serverUrl: string,
    token: string,
    contractId: string,
    action: 'start-renewal' | 'end' | 'reopen',
    body: unknown
  ) =>
    contractSchema.parse(
      await request(
        serverUrl,
        token,
        `/${encodeURIComponent(contractId)}/${action}`,
        body
      )
    )

  return {
    list: async (
      serverUrl: string,
      token: string,
      query?: Record<string, unknown>
    ) =>
      pageSchema(contractSchema).parse(
        await request(serverUrl, token, toQueryString(query))
      ),
    listCandidates: async (
      serverUrl: string,
      token: string,
      query?: Record<string, unknown>
    ) =>
      pageSchema(contractCandidateSchema).parse(
        await request(serverUrl, token, `/candidates${toQueryString(query)}`)
      ),
    createContract: async (
      serverUrl: string,
      token: string,
      input: TContractCreate
    ) => contractSchema.parse(await request(serverUrl, token, '', input)),
    startRenewal: (
      serverUrl: string,
      token: string,
      contractId: string,
      input: TRenewalStart
    ) => act(serverUrl, token, contractId, 'start-renewal', input),
    endContract: (
      serverUrl: string,
      token: string,
      contractId: string,
      input: TContractEnd
    ) => act(serverUrl, token, contractId, 'end', input),
    reopenContract: (
      serverUrl: string,
      token: string,
      contractId: string,
      version: number
    ) => act(serverUrl, token, contractId, 'reopen', { version })
  }
}

export type TRenewalsApi = ReturnType<typeof createRenewalsApi>
