import {
  contractCandidateQuerySchema,
  contractCreateSchema,
  contractEndSchema,
  contractListQuerySchema,
  renewalStartSchema
} from '@open-sales/shared'
import { ipcMain } from 'electron'
import { z } from 'zod'

import { RENEWALS_CHANNELS } from '../preload/bridge-types'
import type { TConnection } from './connection'
import { createRenewalsApi } from './renewals-api'

const INVALID = { ok: false, message: 'Check the form and try again.' } as const

const idSchema = z.string().min(1).max(64)

/** A form's first problem, in the words the shared schema gives it. */
const firstProblem = (error: z.ZodError) => ({
  ok: false as const,
  message: error.issues[0].message
})

/**
 * Contracts and their renewals, as the signed-in person. What the renderer
 * sends is checked here, and again by the server.
 */
export const registerRenewalsIpc = (
  { withSession }: Pick<TConnection, 'withSession'>,
  api = createRenewalsApi()
) => {
  ipcMain.handle(RENEWALS_CHANNELS.list, (_event, query: unknown) => {
    const parsed = contractListQuerySchema.safeParse(query ?? {})
    if (!parsed.success) return INVALID
    return withSession((serverUrl, token) =>
      api.list(serverUrl, token, parsed.data)
    )
  })

  ipcMain.handle(RENEWALS_CHANNELS.listCandidates, (_event, query: unknown) => {
    const parsed = contractCandidateQuerySchema.safeParse(query ?? {})
    if (!parsed.success) return INVALID
    return withSession((serverUrl, token) =>
      api.listCandidates(serverUrl, token, parsed.data)
    )
  })

  ipcMain.handle(RENEWALS_CHANNELS.createContract, (_event, input: unknown) => {
    const parsed = contractCreateSchema.safeParse(input)
    if (!parsed.success) return firstProblem(parsed.error)
    return withSession((serverUrl, token) =>
      api.createContract(serverUrl, token, parsed.data)
    )
  })

  ipcMain.handle(
    RENEWALS_CHANNELS.startRenewal,
    (_event, contractId: unknown, input: unknown) => {
      const id = idSchema.safeParse(contractId)
      if (!id.success) return INVALID
      const parsed = renewalStartSchema.safeParse(input)
      if (!parsed.success) return firstProblem(parsed.error)
      return withSession((serverUrl, token) =>
        api.startRenewal(serverUrl, token, id.data, parsed.data)
      )
    }
  )

  ipcMain.handle(
    RENEWALS_CHANNELS.endContract,
    (_event, contractId: unknown, input: unknown) => {
      const id = idSchema.safeParse(contractId)
      if (!id.success) return INVALID
      const parsed = contractEndSchema.safeParse(input)
      if (!parsed.success) return firstProblem(parsed.error)
      return withSession((serverUrl, token) =>
        api.endContract(serverUrl, token, id.data, parsed.data)
      )
    }
  )

  ipcMain.handle(
    RENEWALS_CHANNELS.reopenContract,
    (_event, contractId: unknown, version: unknown) => {
      const parsed = z
        .tuple([idSchema, z.number().int().positive()])
        .safeParse([contractId, version])
      if (!parsed.success) return INVALID
      return withSession((serverUrl, token) =>
        api.reopenContract(serverUrl, token, ...parsed.data)
      )
    }
  )
}
