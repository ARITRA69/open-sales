import { forecastQuerySchema, reportQuerySchema } from '@open-sales/shared'
import { ipcMain } from 'electron'

import { REPORTS_CHANNELS } from '../preload/bridge-types'
import type { TConnection } from './connection'
import { createReportsApi, type TReportsApi } from './reports-api'

const INVALID = {
  ok: false,
  message: 'Check the filters and try again.'
} as const

/**
 * Answers the renderer's report requests as the signed-in person. Filters are
 * checked here, and again by the server.
 */
export const registerReportsIpc = (
  { withSession }: Pick<TConnection, 'withSession'>,
  api: TReportsApi = createReportsApi()
) => {
  ipcMain.handle(REPORTS_CHANNELS.getPipeline, (_event, query: unknown) => {
    const parsed = reportQuerySchema.safeParse(query ?? {})
    if (!parsed.success) return INVALID
    return withSession((serverUrl, token) =>
      api.getPipeline(serverUrl, token, parsed.data)
    )
  })

  ipcMain.handle(REPORTS_CHANNELS.getWonLost, (_event, query: unknown) => {
    const parsed = reportQuerySchema.safeParse(query ?? {})
    if (!parsed.success) return INVALID
    return withSession((serverUrl, token) =>
      api.getWonLost(serverUrl, token, parsed.data)
    )
  })

  ipcMain.handle(REPORTS_CHANNELS.getForecast, (_event, query: unknown) => {
    const parsed = forecastQuerySchema.safeParse(query ?? {})
    if (!parsed.success) return INVALID
    return withSession((serverUrl, token) =>
      api.getForecast(serverUrl, token, parsed.data)
    )
  })
}
