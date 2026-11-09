import {
  apiErrorSchema,
  healthResponseSchema,
  setupStatusSchema,
  signedInResponseSchema
} from '@open-sales/shared'
import { describe, expect, it, vi } from 'vitest'

import { createApp } from './app'
import type { TSetupService } from './setup'
import { SetupAlreadyDoneError } from './setup'

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

const makeApp = ({
  isUp = true,
  setup = makeSetup(),
  handleAuth = vi.fn(async () => Response.json({ forwarded: true }))
} = {}) =>
  createApp({
    version: '1.2.3',
    isDatabaseReachable: async () => isUp,
    handleAuth,
    setup
  })

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
