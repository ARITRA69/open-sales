import { setupRequestSchema, signInRequestSchema } from '@open-sales/shared'
import { ipcMain } from 'electron'
import { z } from 'zod'

import { CONNECTION_CHANNELS } from '../preload/bridge-types'
import type { TConnection } from './connection'

const INVALID = { ok: false, message: 'Check the form and try again.' } as const

/**
 * Answers the renderer's requests. Everything it sends is checked again here:
 * the renderer is web content and isn't trusted with more than it shows.
 */
export const registerConnectionIpc = (connection: TConnection) => {
  ipcMain.handle(CONNECTION_CHANNELS.getState, () => connection.getState())

  ipcMain.handle(
    CONNECTION_CHANNELS.chooseServer,
    (_event, address: unknown) => {
      const parsed = z.string().max(2048).safeParse(address)
      return parsed.success ? connection.chooseServer(parsed.data) : INVALID
    }
  )

  ipcMain.handle(CONNECTION_CHANNELS.forgetServer, () =>
    connection.forgetServer()
  )

  ipcMain.handle(CONNECTION_CHANNELS.createAdmin, (_event, input: unknown) => {
    const parsed = setupRequestSchema.safeParse(input)
    return parsed.success ? connection.createAdmin(parsed.data) : INVALID
  })

  ipcMain.handle(CONNECTION_CHANNELS.signIn, (_event, input: unknown) => {
    const parsed = signInRequestSchema.safeParse(input)
    return parsed.success ? connection.signIn(parsed.data) : INVALID
  })

  ipcMain.handle(CONNECTION_CHANNELS.signOut, () => connection.signOut())
}
