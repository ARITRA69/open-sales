import type { forecastQuerySchema, reportQuerySchema } from '@open-sales/shared'
import {
  forecastReportSchema,
  pipelineReportSchema,
  wonLostReportSchema
} from '@open-sales/shared'
import type { z } from 'zod'

import { ServerProblem } from './server-api'

// The same patience as the app's other server calls.
const REQUEST_TIMEOUT_MS = 8000

type TFetch = typeof fetch

/** The server's reports, checked against the shared schemas. */
export const createReportsApi = (fetchFn: TFetch = fetch) => {
  /** A signed-in GET under /reports: the body, or a problem in plain words. */
  const read = async <TSchema extends z.ZodType>(
    serverUrl: string,
    token: string,
    path: string,
    query: Record<string, string | undefined>,
    schema: TSchema
  ): Promise<z.infer<TSchema>> => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value) params.set(key, value)
    }

    let response: Response
    try {
      response = await fetchFn(
        `${serverUrl}/api/v1/reports/${path}?${params.toString()}`,
        {
          headers: { authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        }
      )
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
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: unknown; code?: unknown }
      } | null
      const { message, code } = body?.error ?? {}
      throw new ServerProblem(
        typeof message === 'string' ? message : 'That didn’t work. Try again.',
        typeof code === 'string' ? code : undefined
      )
    }
    return schema.parse(await response.json())
  }

  return {
    getPipeline: (
      serverUrl: string,
      token: string,
      query: z.output<typeof reportQuerySchema>
    ) => read(serverUrl, token, 'pipeline', query, pipelineReportSchema),
    getWonLost: (
      serverUrl: string,
      token: string,
      query: z.output<typeof reportQuerySchema>
    ) => read(serverUrl, token, 'won-lost', query, wonLostReportSchema),
    getForecast: (
      serverUrl: string,
      token: string,
      query: z.output<typeof forecastQuerySchema>
    ) => read(serverUrl, token, 'forecast', query, forecastReportSchema)
  }
}

export type TReportsApi = ReturnType<typeof createReportsApi>
