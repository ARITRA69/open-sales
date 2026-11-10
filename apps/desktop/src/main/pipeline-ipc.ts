import { dealCreateWithPeopleSchema } from '@open-sales/shared'
import { ipcMain } from 'electron'

import { PIPELINE_CHANNELS } from '../preload/bridge-types'
import type { TConnection } from './connection'

/**
 * The Pipeline page's own requests. A new deal can name the people on it,
 * which the records channel's check would drop. Checked here, and again by
 * the server.
 */
export const registerPipelineIpc = ({ records }: TConnection) => {
  ipcMain.handle(PIPELINE_CHANNELS.createDeal, (_event, input: unknown) => {
    const parsed = dealCreateWithPeopleSchema.safeParse(input)
    return parsed.success
      ? records.create('deals', parsed.data)
      : { ok: false, message: parsed.error.issues[0].message }
  })
}
