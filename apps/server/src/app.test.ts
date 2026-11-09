import type { TSessionUser } from '@open-sales/shared'
import {
  apiErrorSchema,
  healthResponseSchema,
  joinLinkResponseSchema,
  joinResponseSchema,
  setupStatusSchema,
  signedInResponseSchema
} from '@open-sales/shared'
import { describe, expect, it, vi } from 'vitest'

import { createApp } from './app'
import type { TSetupService } from './setup'
import { SetupAlreadyDoneError } from './setup'
import type { TTeamService } from './team'
import { EmailTakenError, JoinLinkInvalidError } from './team'

const ADMIN = {
  id: 'u1',
  name: 'Asha Menon',
  email: 'asha@example.com',
  role: 'admin' as const
}

const VALID_SETUP = {
  workspaceName: 'Halden Capital',
  name: 'Asha Menon',
  email: 'asha@example.com',
  password: 'correct horse'
}

const makeSetup = (overrides: Partial<TSetupService> = {}): TSetupService => ({
  getStatus: async () => ({ needsSetup: true, workspaceName: null }),
  run: async () => ({ token: 'token-1', user: ADMIN }),
  ...overrides
})

const LINK = {
  token: 'link-token',
  allowedDomain: 'halden.com',
  role: 'member' as const,
  createdAt: new Date('2026-11-09T10:00:00Z')
}

const makeTeam = (overrides: Partial<TTeamService> = {}): TTeamService => ({
  getJoinLink: async () => LINK,
  createJoinLink: async () => LINK,
  updateJoinLink: async () => LINK,
  disableJoinLink: async () => undefined,
  previewJoin: async (token) =>
    token === LINK.token ? { workspaceName: 'Halden Capital' } : null,
  join: async () => ({ status: 'pending', ticket: 'ticket-1' }),
  getJoinRequestStatus: async (ticket) =>
    ticket === 'ticket-1' ? { status: 'pending' } : null,
  listMembers: async () => [],
  approve: async () => undefined,
  decline: async () => undefined,
  ...overrides
})

const makeApp = ({
  isUp = true,
  setup = makeSetup(),
  team = makeTeam(),
  me = ADMIN as TSessionUser | null,
  handleAuth = vi.fn(async () => Response.json({ forwarded: true }))
} = {}) =>
  createApp({
    version: '1.2.3',
    isDatabaseReachable: async () => isUp,
    handleAuth,
    getSessionUser: async () => me,
    setup,
    team,
    publicUrl: 'https://sales.halden.com'
  })

const VALID_JOIN = {
  token: LINK.token,
  name: 'Ravi Shah',
  email: 'ravi@gmail.com',
  password: 'correct horse'
}

const postJson = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body)
})

describe('GET /api/v1/health', () => {
  it('says ok when the database answers', async () => {
    const response = await makeApp().request('/api/v1/health')

    expect(response.status).toBe(200)
    expect(healthResponseSchema.parse(await response.json())).toEqual({
      status: 'ok',
      database: 'up',
      version: '1.2.3'
    })
  })

  it('says degraded with a 503 when the database is down', async () => {
    const response = await makeApp({ isUp: false }).request('/api/v1/health')

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      status: 'degraded',
      database: 'down'
    })
  })
})

describe('GET /api/v1/setup', () => {
  it('reports whether the server needs its first admin', async () => {
    const response = await makeApp().request('/api/v1/setup')

    expect(setupStatusSchema.parse(await response.json())).toEqual({
      needsSetup: true,
      workspaceName: null
    })
  })
})

describe('POST /api/v1/setup', () => {
  it('creates the admin and returns a session', async () => {
    const run = vi.fn(async () => ({ token: 'token-1', user: ADMIN }))
    const response = await makeApp({ setup: makeSetup({ run }) }).request(
      '/api/v1/setup',
      postJson(VALID_SETUP)
    )

    expect(response.status).toBe(201)
    expect(signedInResponseSchema.parse(await response.json()).user).toEqual(
      ADMIN
    )
    expect(run).toHaveBeenCalledWith(VALID_SETUP)
  })

  it('explains what is wrong with the request', async () => {
    const response = await makeApp().request(
      '/api/v1/setup',
      postJson({ ...VALID_SETUP, password: 'short' })
    )

    expect(response.status).toBe(400)
    expect(apiErrorSchema.parse(await response.json()).error.message).toBe(
      'Use at least 8 characters'
    )
  })

  it('refuses once the server is set up', async () => {
    const setup = makeSetup({
      run: async () => {
        throw new SetupAlreadyDoneError()
      }
    })
    const response = await makeApp({ setup }).request(
      '/api/v1/setup',
      postJson(VALID_SETUP)
    )

    expect(response.status).toBe(409)
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe(
      'already_set_up'
    )
  })
})

describe('/api/v1/auth', () => {
  it('blocks open sign-up', async () => {
    const handleAuth = vi.fn(async () => new Response())
    const response = await makeApp({ handleAuth }).request(
      '/api/v1/auth/sign-up/email',
      postJson({ email: 'x@example.com', password: 'whatever1', name: 'X' })
    )

    expect(response.status).toBe(404)
    expect(handleAuth).not.toHaveBeenCalled()
  })

  it('passes sign-in to Better Auth', async () => {
    const handleAuth = vi.fn(async () => Response.json({ forwarded: true }))
    const response = await makeApp({ handleAuth }).request(
      '/api/v1/auth/sign-in/email',
      postJson({ email: 'asha@example.com', password: 'correct horse' })
    )

    expect(await response.json()).toEqual({ forwarded: true })
    expect(handleAuth).toHaveBeenCalledOnce()
  })
})

describe('joining with the team link', () => {
  it('shows which team a live link joins, and 404s a dead one', async () => {
    const app = makeApp()
    const live = await app.request(`/api/v1/join/${LINK.token}`)
    const dead = await app.request('/api/v1/join/old-token')

    expect(await live.json()).toEqual({ workspaceName: 'Halden Capital' })
    expect(dead.status).toBe(404)
  })

  it('answers 202 with a ticket when an admin must approve', async () => {
    const join = vi.fn(async () => ({
      status: 'pending' as const,
      ticket: 'ticket-1'
    }))
    const response = await makeApp({ team: makeTeam({ join }) }).request(
      '/api/v1/join',
      postJson(VALID_JOIN)
    )

    expect(response.status).toBe(202)
    expect(joinResponseSchema.parse(await response.json())).toEqual({
      status: 'pending',
      ticket: 'ticket-1'
    })
    expect(join).toHaveBeenCalledWith(VALID_JOIN)
  })

  it('answers 201 with a session when the domain lets them straight in', async () => {
    const team = makeTeam({
      join: async () => ({
        status: 'active',
        token: 'session-1',
        user: { ...ADMIN, role: 'member' }
      })
    })
    const response = await makeApp({ team }).request(
      '/api/v1/join',
      postJson({ ...VALID_JOIN, email: 'ravi@halden.com' })
    )

    expect(response.status).toBe(201)
    expect(joinResponseSchema.parse(await response.json()).status).toBe(
      'active'
    )
  })

  it('says why joining failed', async () => {
    const taken = makeTeam({
      join: async () => {
        throw new EmailTakenError()
      }
    })
    const dead = makeTeam({
      join: async () => {
        throw new JoinLinkInvalidError()
      }
    })

    const takenResponse = await makeApp({ team: taken }).request(
      '/api/v1/join',
      postJson(VALID_JOIN)
    )
    const deadResponse = await makeApp({ team: dead }).request(
      '/api/v1/join',
      postJson(VALID_JOIN)
    )

    expect(takenResponse.status).toBe(409)
    expect(deadResponse.status).toBe(404)
  })

  it('reports a request’s status only to the ticket holder', async () => {
    const app = makeApp()
    const known = await app.request('/api/v1/join/request', {
      headers: { 'x-join-ticket': 'ticket-1' }
    })
    const unknown = await app.request('/api/v1/join/request')

    expect(await known.json()).toEqual({ status: 'pending' })
    expect(unknown.status).toBe(404)
  })

  it('serves a page that hands the link to the app', async () => {
    const response = await makeApp().request(`/join/${LINK.token}`)
    const html = await response.text()

    expect(response.headers.get('content-type')).toContain('text/html')
    expect(html).toContain('Join Halden Capital')
    expect(html).toContain(
      `open-sales://join?link=${encodeURIComponent(
        'https://sales.halden.com/join/link-token'
      )}`
    )
  })
})

describe('/api/v1/team', () => {
  it('gives admins the join link as a full URL', async () => {
    const response = await makeApp().request('/api/v1/team/join-link')

    expect(joinLinkResponseSchema.parse(await response.json())).toEqual({
      joinLink: {
        url: 'https://sales.halden.com/join/link-token',
        allowedDomain: 'halden.com',
        role: 'member',
        createdAt: '2026-11-09T10:00:00.000Z'
      }
    })
  })

  it('is for admins only', async () => {
    const signedOut = await makeApp({ me: null }).request(
      '/api/v1/team/members'
    )
    const member = await makeApp({ me: { ...ADMIN, role: 'member' } }).request(
      '/api/v1/team/members'
    )

    expect(signedOut.status).toBe(401)
    expect(member.status).toBe(403)
  })

  it('checks the allowed domain before making a new link', async () => {
    const createJoinLink = vi.fn(async () => LINK)
    const response = await makeApp({
      team: makeTeam({ createJoinLink })
    }).request('/api/v1/team/join-link', postJson({ allowedDomain: '@halden' }))

    expect(response.status).toBe(400)
    expect(createJoinLink).not.toHaveBeenCalled()
  })

  it('approves and declines people, recording who decided', async () => {
    const approve = vi.fn(async () => undefined)
    const decline = vi.fn(async () => undefined)
    const app = makeApp({ team: makeTeam({ approve, decline }) })

    const approved = await app.request('/api/v1/team/members/u2/approve', {
      method: 'POST'
    })
    const declined = await app.request('/api/v1/team/members/u3/decline', {
      method: 'POST'
    })

    expect([approved.status, declined.status]).toEqual([204, 204])
    expect(approve).toHaveBeenCalledWith('u2', ADMIN.id)
    expect(decline).toHaveBeenCalledWith('u3', ADMIN.id)
  })
})
