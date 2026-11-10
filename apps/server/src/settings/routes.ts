import type { TSessionUser } from '@open-sales/shared'
import {
  lostReasonsSaveSchema,
  memberUpdateSchema,
  profileUpdateSchema,
  stagesSaveSchema,
  workspaceUpdateSchema
} from '@open-sales/shared'
import type { Context, Hono, Next } from 'hono'

import type { TDatabase } from '../db/client'
import type { TEnv } from '../http'
import { readBody, sendError } from '../http'
import {
  ChangedSinceError,
  InvalidChangeError,
  NotAllowedError,
  RecordNotFoundError
} from '../records/common'
import { createMemberService } from './members'
import { createPipelineSettingsService } from './pipeline'
import { createProfileService } from './profile'
import { createWorkspaceSettingsService } from './workspace'

export const createSettingsService = (db: TDatabase) => ({
  workspace: createWorkspaceSettingsService(db),
  pipeline: createPipelineSettingsService(db),
  profile: createProfileService(db),
  members: createMemberService(db)
})

export type TSettingsService = ReturnType<typeof createSettingsService>

/** The services' errors, as answers. Anything else is a real failure. */
const answer = async (c: Context<TEnv>, work: () => Promise<unknown>) => {
  try {
    return c.json(await work())
  } catch (error) {
    if (error instanceof RecordNotFoundError) {
      return sendError(c, 404, 'not_found', error.message)
    }
    if (error instanceof NotAllowedError) {
      return sendError(c, 403, 'forbidden', error.message)
    }
    if (error instanceof ChangedSinceError) {
      return sendError(c, 409, 'changed_since', error.message)
    }
    if (error instanceof InvalidChangeError) {
      return sendError(c, 400, 'invalid_change', error.message)
    }
    throw error
  }
}

/**
 * Settings, under /api/v1: the workspace, the pipeline's stages and lost
 * reasons, your own name, and people's roles. The services check that
 * whoever changes the workspace's settings is an admin.
 */
export const addSettingsRoutes = (
  api: Hono<TEnv>,
  settings: TSettingsService,
  getSessionUser: (headers: Headers) => Promise<TSessionUser | null>
) => {
  const signedIn = async (c: Context<TEnv>, next: Next) => {
    const me = await getSessionUser(c.req.raw.headers)
    if (!me) return sendError(c, 401, 'signed_out', 'Sign in again.')
    c.set('me', me)
    await next()
  }
  api.use('/settings/*', signedIn)
  api.use('/team/members/:id', signedIn)

  api.get('/settings/workspace', (c) =>
    answer(c, () => settings.workspace.get())
  )

  api.patch('/settings/workspace', async (c) => {
    const body = await readBody(c, workspaceUpdateSchema)
    if (!body.ok) return body.response
    return answer(c, () => settings.workspace.update(c.get('me'), body.data))
  })

  api.patch('/settings/me', async (c) => {
    const body = await readBody(c, profileUpdateSchema)
    if (!body.ok) return body.response
    return answer(c, async () => ({
      user: await settings.profile.update(c.get('me'), body.data)
    }))
  })

  api.get('/settings/pipeline', (c) =>
    answer(c, () => settings.pipeline.get(c.get('me')))
  )

  api.put('/settings/pipeline/stages', async (c) => {
    const body = await readBody(c, stagesSaveSchema)
    if (!body.ok) return body.response
    return answer(c, () => settings.pipeline.saveStages(c.get('me'), body.data))
  })

  api.put('/settings/pipeline/lost-reasons', async (c) => {
    const body = await readBody(c, lostReasonsSaveSchema)
    if (!body.ok) return body.response
    return answer(c, () =>
      settings.pipeline.saveLostReasons(c.get('me'), body.data)
    )
  })

  // Beside the join link and approvals, which app.ts mounts under /team.
  api.patch('/team/members/:id', async (c) => {
    const body = await readBody(c, memberUpdateSchema)
    if (!body.ok) return body.response
    return answer(c, async () => ({
      member: await settings.members.update(
        c.get('me'),
        c.req.param('id'),
        body.data
      )
    }))
  })
}
