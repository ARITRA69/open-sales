import {
  companyCreateSchema,
  companyUpdateSchema,
  dealCreateSchema,
  dealListQuerySchema,
  dealUpdateSchema,
  joinFormSchema,
  joinLinkSettingsSchema,
  listQuerySchema,
  personCreateSchema,
  personUpdateSchema,
  setupRequestSchema,
  signInRequestSchema
} from '@open-sales/shared'
import { ipcMain } from 'electron'
import { z } from 'zod'

import {
  AI_TOOLS_CHANNELS,
  CONNECTION_CHANNELS,
  RECORDS_CHANNELS,
  TEAM_CHANNELS
} from '../preload/bridge-types'
import { detectAiTools, localMachine } from './ai-tools'
import type { TConnection } from './connection'
import { RECORD_KINDS } from './server-api'

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

// What each kind of record takes. Checked here, and again by the server.
const RECORD_SCHEMAS = {
  companies: {
    query: listQuerySchema,
    create: companyCreateSchema,
    update: companyUpdateSchema
  },
  people: {
    query: listQuerySchema,
    create: personCreateSchema,
    update: personUpdateSchema
  },
  deals: {
    query: dealListQuerySchema,
    create: dealCreateSchema,
    update: dealUpdateSchema
  }
} as const

const kindSchema = z.enum(RECORD_KINDS)
const idSchema = z.string().min(1).max(64)

/** Companies, people, deals and the pipeline, as the signed-in person. */
export const registerRecordsIpc = ({ records }: TConnection) => {
  ipcMain.handle(
    RECORDS_CHANNELS.list,
    (_event, kind: unknown, query: unknown) => {
      const parsedKind = kindSchema.safeParse(kind)
      if (!parsedKind.success) return INVALID
      const parsed = RECORD_SCHEMAS[parsedKind.data].query.safeParse(
        query ?? {}
      )
      return parsed.success
        ? records.list(parsedKind.data, parsed.data)
        : INVALID
    }
  )

  ipcMain.handle(RECORDS_CHANNELS.get, (_event, kind: unknown, id: unknown) => {
    const parsed = z.tuple([kindSchema, idSchema]).safeParse([kind, id])
    return parsed.success ? records.get(...parsed.data) : INVALID
  })

  ipcMain.handle(
    RECORDS_CHANNELS.create,
    (_event, kind: unknown, input: unknown) => {
      const parsedKind = kindSchema.safeParse(kind)
      if (!parsedKind.success) return INVALID
      const parsed = RECORD_SCHEMAS[parsedKind.data].create.safeParse(input)
      return parsed.success
        ? records.create(parsedKind.data, parsed.data)
        : { ok: false, message: parsed.error.issues[0].message }
    }
  )

  ipcMain.handle(
    RECORDS_CHANNELS.update,
    (_event, kind: unknown, id: unknown, input: unknown) => {
      const parsedKind = kindSchema.safeParse(kind)
      const parsedId = idSchema.safeParse(id)
      if (!parsedKind.success || !parsedId.success) return INVALID
      const parsed = RECORD_SCHEMAS[parsedKind.data].update.safeParse(input)
      return parsed.success
        ? records.update(parsedKind.data, parsedId.data, parsed.data)
        : { ok: false, message: parsed.error.issues[0].message }
    }
  )

  ipcMain.handle(
    RECORDS_CHANNELS.setArchived,
    (_event, kind: unknown, id: unknown, action: unknown, version: unknown) => {
      const parsed = z
        .tuple([
          kindSchema,
          idSchema,
          z.enum(['archive', 'restore']),
          z.number().int().positive()
        ])
        .safeParse([kind, id, action, version])
      return parsed.success ? records.setArchived(...parsed.data) : INVALID
    }
  )

  ipcMain.handle(RECORDS_CHANNELS.getPipeline, () => records.getPipeline())
  ipcMain.handle(RECORDS_CHANNELS.getBoard, () => records.getBoard())
  ipcMain.handle(RECORDS_CHANNELS.listUsers, () => records.listUsers())
}

/** Answers "which AI tools does this machine have?". It takes no input. */
export const registerAiToolsIpc = () => {
  ipcMain.handle(AI_TOOLS_CHANNELS.getStatus, () =>
    detectAiTools(localMachine())
  )
}
