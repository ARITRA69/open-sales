import {
  joinFormSchema,
  joinLinkSettingsSchema,
  setupRequestSchema,
  signInRequestSchema
} from '@open-sales/shared'
import { ipcMain } from 'electron'
import { z } from 'zod'

import {
  AI_TOOLS_CHANNELS,
  CONNECTION_CHANNELS,
  TEAM_CHANNELS
} from '../preload/bridge-types'
import { detectAiTools, localMachine } from './ai-tools'
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

  ipcMain.handle(CONNECTION_CHANNELS.join, (_event, input: unknown) => {
    const parsed = joinFormSchema.safeParse(input)
    return parsed.success ? connection.join(parsed.data) : INVALID
  })

  ipcMain.handle(CONNECTION_CHANNELS.cancelJoin, () => connection.cancelJoin())

  // An admin's team tools. The server checks the role again on every call.
  const { team } = connection
  ipcMain.handle(TEAM_CHANNELS.getJoinLink, () => team.getJoinLink())
  ipcMain.handle(TEAM_CHANNELS.createJoinLink, (_event, input: unknown) => {
    const parsed = joinLinkSettingsSchema.safeParse(input)
    return parsed.success ? team.createJoinLink(parsed.data) : INVALID
  })
  ipcMain.handle(TEAM_CHANNELS.updateJoinLink, (_event, input: unknown) => {
    const parsed = joinLinkSettingsSchema.safeParse(input)
    return parsed.success ? team.updateJoinLink(parsed.data) : INVALID
  })
  ipcMain.handle(TEAM_CHANNELS.disableJoinLink, () => team.disableJoinLink())
  ipcMain.handle(TEAM_CHANNELS.listMembers, () => team.listMembers())
  ipcMain.handle(
    TEAM_CHANNELS.decideMember,
    (_event, memberId: unknown, decision: unknown) => {
      const parsed = z
        .tuple([z.string().min(1).max(200), z.enum(['approve', 'decline'])])
        .safeParse([memberId, decision])
      return parsed.success ? team.decideMember(...parsed.data) : INVALID
    }
  )
}

/** Answers "which AI tools does this machine have?". It takes no input. */
export const registerAiToolsIpc = () => {
  ipcMain.handle(AI_TOOLS_CHANNELS.getStatus, () =>
    detectAiTools(localMachine())
  )
}
