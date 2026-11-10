import type {
  THealthResponse,
  TJoinLink,
  TSessionUser
} from '@open-sales/shared'
import {
  joinLinkSettingsSchema,
  joinRequestSchema,
  setupRequestSchema
} from '@open-sales/shared'
import type { Context } from 'hono'
import { Hono } from 'hono'

import type { TEnv } from './http'
import { readBody, sendError } from './http'
import { renderJoinPage } from './join-page'
import type { TLeadsService } from './leads/leads'
import { addLeadRoutes } from './leads/routes'
import { addProposalRoutes } from './proposals/routes'
import type { TProposalsService } from './proposals/service'
import type { TRecordsService } from './records/routes'
import { addRecordRoutes } from './records/routes'
import type { TContractService } from './renewals/contracts'
import { addContractRoutes } from './renewals/routes'
import type { TSetupService } from './setup'
import { SetupAlreadyDoneError } from './setup'
import type { TJoinLinkRecord, TTeamService } from './team'
import {
  EmailTakenError,
  JoinLinkInvalidError,
  MemberNotFoundError
} from './team'
import { addTimelineRoutes } from './timeline/routes'

type TAppDeps = {
  version: string
  // Passed in rather than imported, so tests run without Postgres.
  isDatabaseReachable: () => Promise<boolean>
  // Better Auth's request handler, for everything under /api/v1/auth
  // (AUTH_BASE_PATH in auth.ts).
  handleAuth: (request: Request) => Promise<Response>
  // The signed-in person for a request's Bearer token, or null.
  getSessionUser: (headers: Headers) => Promise<TSessionUser | null>
  setup: TSetupService
  team: TTeamService
  // Companies, people, deals and the pipeline. Optional so tests of other
  // routes needn't build one.
  records?: TRecordsService
  // AI's proposed changes, and people's decisions on them.
  proposals?: TProposalsService
  // The Leads inbox. Optional, like records.
  leads?: TLeadsService
  // Where people reach the server, for join links. Defaults to the request's.
  publicUrl?: string
  // The desktop app's link scheme, for the join page.
  appScheme?: string
  // Contracts and their renewals. Optional, like `records`.
  contracts?: TContractService
}

/** The Sales API under /api/v1, and the join page at /join/:token. */
export const createApp = ({
  version,
  isDatabaseReachable,
  handleAuth,
  getSessionUser,
  setup,
  team,
  records,
  proposals,
  leads,
  publicUrl,
  appScheme = 'open-sales',
  contracts
}: TAppDeps) => {
  const baseUrl = (c: Context) =>
    (publicUrl ?? new URL(c.req.url).origin).replace(/\/+$/, '')
  const toJoinLink = (c: Context, record: TJoinLinkRecord): TJoinLink => ({
    url: `${baseUrl(c)}/join/${record.token}`,
    allowedDomain: record.allowedDomain,
    role: record.role,
    createdAt: record.createdAt.toISOString()
  })

  const api = new Hono<TEnv>()

  api.get('/health', async (c) => {
    const isUp = await isDatabaseReachable()
    const body: THealthResponse = {
      status: isUp ? 'ok' : 'degraded',
      database: isUp ? 'up' : 'down',
      version
    }
    return c.json(body, isUp ? 200 : 503)
  })

  api.get('/setup', async (c) => c.json(await setup.getStatus()))

  api.post('/setup', async (c) => {
    const body = await readBody(c, setupRequestSchema)
    if (!body.ok) return body.response

    try {
      return c.json(await setup.run(body.data), 201)
    } catch (error) {
      if (error instanceof SetupAlreadyDoneError) {
        return sendError(c, 409, 'already_set_up', error.message)
      }
      throw error
    }
  })

  // Joining with the team's link. These are public: the link is the key.
  api.get('/join/request', async (c) => {
    const ticket = c.req.header('x-join-ticket')
    const status = ticket ? await team.getJoinRequestStatus(ticket) : null
    if (!status) {
      return sendError(c, 404, 'not_found', 'That join request isn’t known.')
    }
    return c.json(status)
  })

  api.get('/join/:token', async (c) => {
    const preview = await team.previewJoin(c.req.param('token'))
    if (!preview) {
      return sendError(
        c,
        404,
        'invalid_link',
        new JoinLinkInvalidError().message
      )
    }
    return c.json(preview)
  })

  api.post('/join', async (c) => {
    const body = await readBody(c, joinRequestSchema)
    if (!body.ok) return body.response

    try {
      const joined = await team.join(body.data)
      return c.json(joined, joined.status === 'active' ? 201 : 202)
    } catch (error) {
      if (error instanceof JoinLinkInvalidError) {
        return sendError(c, 404, 'invalid_link', error.message)
      }
      if (error instanceof EmailTakenError) {
        return sendError(c, 409, 'email_taken', error.message)
      }
      throw error
    }
  })

  // Everything under /team is for admins.
  api.use('/team/*', async (c, next) => {
    const me = await getSessionUser(c.req.raw.headers)
    if (!me) return sendError(c, 401, 'signed_out', 'Sign in again.')
    if (me.role !== 'admin') {
      return sendError(c, 403, 'forbidden', 'Only admins can do this.')
    }
    c.set('me', me)
    await next()
  })

  api.get('/team/join-link', async (c) => {
    const record = await team.getJoinLink()
    return c.json({ joinLink: record ? toJoinLink(c, record) : null })
  })

  api.post('/team/join-link', async (c) => {
    const body = await readBody(c, joinLinkSettingsSchema)
    if (!body.ok) return body.response
    const record = await team.createJoinLink(
      c.get('me').id,
      body.data.allowedDomain
    )
    return c.json({ joinLink: toJoinLink(c, record) }, 201)
  })

  api.patch('/team/join-link', async (c) => {
    const body = await readBody(c, joinLinkSettingsSchema)
    if (!body.ok) return body.response
    const record = await team.updateJoinLink(body.data.allowedDomain)
    if (!record) {
      return sendError(c, 404, 'not_found', 'The join link is turned off.')
    }
    return c.json({ joinLink: toJoinLink(c, record) })
  })

  api.delete('/team/join-link', async (c) => {
    await team.disableJoinLink()
    return c.body(null, 204)
  })

  api.get('/team/members', async (c) =>
    c.json({ members: await team.listMembers() })
  )

  api.post('/team/members/:id/:decision{approve|decline}', async (c) => {
    const decide =
      c.req.param('decision') === 'approve' ? team.approve : team.decline
    try {
      await decide(c.req.param('id'), c.get('me').id)
      return c.body(null, 204)
    } catch (error) {
      if (error instanceof MemberNotFoundError) {
        return sendError(c, 404, 'not_found', error.message)
      }
      throw error
    }
  })

  if (records) addRecordRoutes(api, records, getSessionUser)
  if (records) addTimelineRoutes(api, records.timeline, getSessionUser)
  if (proposals) addProposalRoutes(api, proposals, getSessionUser)
  if (leads) addLeadRoutes(api, leads, getSessionUser)
  if (contracts) addContractRoutes(api, contracts, getSessionUser)

  // Accounts come from setup and the join link, never open sign-up.
  api.all('/auth/sign-up/*', (c) =>
    sendError(c, 404, 'not_found', 'Ask your admin for the team’s join link.')
  )
  api.on(['GET', 'POST'], '/auth/*', (c) => handleAuth(c.req.raw))

  const app = new Hono()
  app.route('/api/v1', api)

  // The page a join link opens in a browser: it hands the link to the app.
  app.get('/join/:token', async (c) => {
    const token = c.req.param('token')
    const preview = await team.previewJoin(token)
    const html = renderJoinPage({
      workspaceName: preview?.workspaceName ?? null,
      isValid: Boolean(preview),
      joinUrl: `${baseUrl(c)}/join/${token}`,
      appScheme
    })
    return c.html(html, preview ? 200 : 404)
  })

  return app
}
