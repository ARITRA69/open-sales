import type {
  TLostReasonsSave,
  TMemberUpdate,
  TProfileUpdate,
  TStagesSaveInput,
  TWorkspaceUpdate
} from '@open-sales/shared'
import {
  memberResponseSchema,
  pipelineSettingsSchema,
  profileResponseSchema,
  workspaceSettingsSchema
} from '@open-sales/shared'
import { z } from 'zod'

import { ServerProblem } from './server-api'

// The same patience as server-api.ts.
const REQUEST_TIMEOUT_MS = 8000

const errorBodySchema = z.object({
  error: z.object({ message: z.string(), code: z.string().optional() })
})

/**
 * The server's settings routes, called as the signed-in person. Failures
 * are thrown as ServerProblem, which `connection.withSession` turns into
 * `{ ok: false, message, code }`.
 */
export const createSettingsApi = (fetchFn: typeof fetch = fetch) => {
  const request = async (
    serverUrl: string,
    token: string,
    path: string,
    send?: { method: 'PATCH' | 'PUT'; body: unknown }
  ): Promise<unknown> => {
    let response: Response
    try {
      response = await fetchFn(`${serverUrl}/api/v1${path}`, {
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
    const body: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      const problem = errorBodySchema.safeParse(body)
      throw new ServerProblem(
        problem.data?.error.message ?? 'That didn’t work. Try again.',
        problem.data?.error.code
      )
    }
    return body
  }

  return {
    getWorkspace: async (serverUrl: string, token: string) =>
      workspaceSettingsSchema.parse(
        await request(serverUrl, token, '/settings/workspace')
      ),
    updateWorkspace: async (
      serverUrl: string,
      token: string,
      changes: TWorkspaceUpdate
    ) =>
      workspaceSettingsSchema.parse(
        await request(serverUrl, token, '/settings/workspace', {
          method: 'PATCH',
          body: changes
        })
      ),
    updateMe: async (
      serverUrl: string,
      token: string,
      changes: TProfileUpdate
    ) =>
      profileResponseSchema.parse(
        await request(serverUrl, token, '/settings/me', {
          method: 'PATCH',
          body: changes
        })
      ).user,
    getPipeline: async (serverUrl: string, token: string) =>
      pipelineSettingsSchema.parse(
        await request(serverUrl, token, '/settings/pipeline')
      ),
    saveStages: async (
      serverUrl: string,
      token: string,
      input: TStagesSaveInput
    ) =>
      pipelineSettingsSchema.parse(
        await request(serverUrl, token, '/settings/pipeline/stages', {
          method: 'PUT',
          body: input
        })
      ),
    saveLostReasons: async (
      serverUrl: string,
      token: string,
      input: TLostReasonsSave
    ) =>
      pipelineSettingsSchema.parse(
        await request(serverUrl, token, '/settings/pipeline/lost-reasons', {
          method: 'PUT',
          body: input
        })
      ),
    updateMember: async (
      serverUrl: string,
      token: string,
      memberId: string,
      changes: TMemberUpdate
    ) =>
      memberResponseSchema.parse(
        await request(
          serverUrl,
          token,
          `/team/members/${encodeURIComponent(memberId)}`,
          { method: 'PATCH', body: changes }
        )
      ).member
  }
}

export type TSettingsApi = ReturnType<typeof createSettingsApi>
