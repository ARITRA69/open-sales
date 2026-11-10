import {
  lostReasonsSaveSchema,
  memberUpdateSchema,
  profileUpdateSchema,
  stagesSaveSchema,
  workspaceUpdateSchema
} from '@open-sales/shared'
import { BrowserWindow, ipcMain } from 'electron'
import { z } from 'zod'

import { CONNECTION_CHANNELS, SETTINGS_CHANNELS } from '../preload/bridge-types'
import type { TConnection } from './connection'
import type { TSettingsApi } from './settings-api'
import { createSettingsApi } from './settings-api'

/** What a form got wrong, in the schema's own words. */
const invalid = (error: z.ZodError) =>
  ({ ok: false, message: error.issues[0].message }) as const

/**
 * Settings, as the signed-in person. Everything the renderer sends is
 * checked here and again by the server, which also checks the role.
 */
export const registerSettingsIpc = (
  connection: TConnection,
  api: TSettingsApi = createSettingsApi()
) => {
  const { withSession } = connection

  // The sidebar and window show the person's and the workspace's names, which
  // the renderer has from the connection state: send it again when one changes.
  const sendConnectionState = async () => {
    const state = await connection.getState()
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(CONNECTION_CHANNELS.onStateChange, state)
    }
  }

  ipcMain.handle(SETTINGS_CHANNELS.getWorkspace, () =>
    withSession(api.getWorkspace)
  )

  ipcMain.handle(
    SETTINGS_CHANNELS.updateWorkspace,
    async (_event, input: unknown) => {
      const parsed = workspaceUpdateSchema.safeParse(input)
      if (!parsed.success) return invalid(parsed.error)
      const result = await withSession((serverUrl, token) =>
        api.updateWorkspace(serverUrl, token, parsed.data)
      )
      if (result.ok && parsed.data.name !== undefined) {
        await sendConnectionState()
      }
      return result
    }
  )

  ipcMain.handle(SETTINGS_CHANNELS.updateMe, async (_event, input: unknown) => {
    const parsed = profileUpdateSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)
    const result = await withSession((serverUrl, token) =>
      api.updateMe(serverUrl, token, parsed.data)
    )
    if (result.ok) await sendConnectionState()
    return result
  })

  ipcMain.handle(SETTINGS_CHANNELS.getPipeline, () =>
    withSession(api.getPipeline)
  )

  ipcMain.handle(SETTINGS_CHANNELS.saveStages, (_event, input: unknown) => {
    const parsed = stagesSaveSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)
    return withSession((serverUrl, token) =>
      api.saveStages(serverUrl, token, parsed.data)
    )
  })

  ipcMain.handle(
    SETTINGS_CHANNELS.saveLostReasons,
    (_event, input: unknown) => {
      const parsed = lostReasonsSaveSchema.safeParse(input)
      if (!parsed.success) return invalid(parsed.error)
      return withSession((serverUrl, token) =>
        api.saveLostReasons(serverUrl, token, parsed.data)
      )
    }
  )

  ipcMain.handle(
    SETTINGS_CHANNELS.updateMember,
    async (_event, memberId: unknown, input: unknown) => {
      const parsedId = z.string().min(1).max(200).safeParse(memberId)
      const parsed = memberUpdateSchema.safeParse(input)
      if (!parsedId.success) {
        return { ok: false, message: 'Check the form and try again.' }
      }
      if (!parsed.success) return invalid(parsed.error)
      const result = await withSession((serverUrl, token) =>
        api.updateMember(serverUrl, token, parsedId.data, parsed.data)
      )
      // An admin may have changed their own role: the app shows what the
      // new role can use.
      if (result.ok && parsed.data.role !== undefined) {
        await sendConnectionState()
      }
      return result
    }
  )
}
