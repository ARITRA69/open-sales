import type {
  TCompany,
  TDeal,
  TJoinForm,
  TJoinLinkSettings,
  TJoinPreview,
  TPerson,
  TSessionUser,
  TSetupRequest,
  TSetupStatus,
  TSignInRequest
} from '@open-sales/shared'
import {
  boardSchema,
  companySchema,
  dealSchema,
  healthResponseSchema,
  joinLinkResponseSchema,
  joinPreviewSchema,
  joinRequestStatusSchema,
  joinResponseSchema,
  membersResponseSchema,
  pageSchema,
  personSchema,
  pipelineSchema,
  sessionUserSchema,
  setupStatusSchema,
  signedInResponseSchema,
  usersResponseSchema
} from '@open-sales/shared'
import { z } from 'zod'

import brand from '../../brand.config.json'

// Long enough for a slow network, short enough that a wrong address fails fast.
const REQUEST_TIMEOUT_MS = 8000

/**
 * A problem worth showing to the person, in their words. `code` is the
 * server's, like `changed_since`, for screens that react to it.
 */
export class ServerProblem extends Error {
  constructor(
    message: string,
    readonly code?: string
  ) {
    super(message)
  }
}

/** Companies, people and deals: the records the app lists and edits. */
export const RECORD_KINDS = ['companies', 'people', 'deals'] as const

export type TRecordKind = (typeof RECORD_KINDS)[number]

const ITEM_SCHEMAS = {
  companies: companySchema,
  people: personSchema,
  deals: dealSchema
} as const

export type TRecordItem = TCompany | TPerson | TDeal

/** List filters as a query string. Unset values are left out. */
const toQueryString = (query: Record<string, unknown> = {}) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value))
    }
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

const LOCAL_HOST =
  /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|[^/]+\.local)(:\d+)?$/i

/**
 * Turns what someone typed ("sales.acme.com", "localhost:8787",
 * "https://x.com/api/v1/") into the server's base URL. Local addresses default
 * to http, everything else to https.
 */
export const normalizeServerAddress = (typed: string): string => {
  const trimmed = typed.trim()
  if (!trimmed) throw new ServerProblem('Enter your server’s address.')

  const withScheme = /^[a-z]+:\/\//i.test(trimmed)
    ? trimmed
    : `${LOCAL_HOST.test(trimmed.split('/')[0]) ? 'http' : 'https'}://${trimmed}`

  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new ServerProblem('That doesn’t look like a web address.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ServerProblem('Use an address that starts with http or https.')
  }

  const path = url.pathname.replace(/\/+$/, '').replace(/\/api\/v1$/, '')
  return `${url.origin}${path}`
}

/**
 * Reads a join link: the server's `https://sales.acme.com/join/<token>`, or
 * the app's own `open-sales://join?link=…` that the join page opens. Null for
 * anything else, such as a plain server address.
 */
export const parseJoinLink = (
  text: string
): { serverUrl: string; joinToken: string } | null => {
  const trimmed = text.trim()
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  if (url.protocol === `${brand.urlScheme}:`) {
    const inner = url.searchParams.get('link')
    return inner ? parseJoinLink(inner) : null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

  const match = url.pathname.match(/^(.*)\/join\/([A-Za-z0-9_-]{8,})\/?$/)
  if (!match) return null
  return {
    serverUrl: `${url.origin}${match[1].replace(/\/+$/, '')}`,
    joinToken: match[2]
  }
}

type TFetch = typeof fetch

/** The message an error response carries: ours, or Better Auth's. */
const errorBodySchema = z.object({
  error: z
    .object({ message: z.string(), code: z.string().optional() })
    .optional(),
  message: z.string().optional()
})

const readErrorMessage = async (response: Response, fallback: string) => {
  const body = errorBodySchema.safeParse(
    await response.json().catch(() => null)
  )
  return body.data?.error?.message ?? body.data?.message ?? fallback
}

/** An error response as a problem, keeping the server's code. */
const readProblem = async (response: Response, fallback: string) => {
  const body = errorBodySchema.safeParse(
    await response.json().catch(() => null)
  )
  return new ServerProblem(
    body.data?.error?.message ?? body.data?.message ?? fallback,
    body.data?.error?.code
  )
}

// Better Auth's sign-in and get-session bodies, as far as we read them.
const signInBodySchema = z.object({
  token: z.string().nullish(),
  user: z.unknown()
})
const sessionBodySchema = z.object({ user: sessionUserSchema }).nullable()

/** Calls the Sales API. The main process uses it; the renderer never does. */
export const createServerApi = (fetchFn: TFetch = fetch) => {
  /**
   * The one way the app calls the server: built-in fetch, the session token as
   * a Bearer header, a timeout, and network failures turned into plain words.
   * Callers check the response body against the shared Zod schemas.
   */
  const apiRequest = async (
    serverUrl: string,
    path: string,
    init: RequestInit & { token?: string } = {}
  ) => {
    const { token, ...rest } = init
    const headers = new Headers(rest.headers)
    if (rest.body) headers.set('content-type', 'application/json')
    if (token) headers.set('authorization', `Bearer ${token}`)

    try {
      return await fetchFn(`${serverUrl}/api/v1${path}`, {
        ...rest,
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new ServerProblem(
          'The server didn’t answer in time. Try again in a moment.'
        )
      }
      throw new ServerProblem(
        `Couldn’t reach ${new URL(serverUrl).host}. Check the address, and that the server is running.`
      )
    }
  }

  /** Checks this is one of our servers, and that it can reach its database. */
  const checkServer = async (serverUrl: string): Promise<TSetupStatus> => {
    const health = await apiRequest(serverUrl, '/health')
    const parsed = healthResponseSchema.safeParse(
      await health.json().catch(() => null)
    )
    if (!parsed.success) {
      throw new ServerProblem(
        `There’s no ${brand.productName} server at ${new URL(serverUrl).host}.`
      )
    }
    if (parsed.data.status !== 'ok') {
      throw new ServerProblem(
        'The server is running but can’t reach its database. Ask whoever runs it to check.'
      )
    }
    return getSetupStatus(serverUrl)
  }

  const getSetupStatus = async (serverUrl: string): Promise<TSetupStatus> => {
    const response = await apiRequest(serverUrl, '/setup')
    if (!response.ok) {
      throw new ServerProblem(
        await readErrorMessage(
          response,
          'The server couldn’t say if it’s set up.'
        )
      )
    }
    return setupStatusSchema.parse(await response.json())
  }

  const createAdmin = async (serverUrl: string, input: TSetupRequest) => {
    const response = await apiRequest(serverUrl, '/setup', {
      method: 'POST',
      body: JSON.stringify(input)
    })
    if (!response.ok) {
      throw new ServerProblem(
        await readErrorMessage(response, 'Setup didn’t work. Try again.')
      )
    }
    return signedInResponseSchema.parse(await response.json())
  }

  const signIn = async (serverUrl: string, input: TSignInRequest) => {
    const response = await apiRequest(serverUrl, '/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify(input)
    })
    if (response.status === 401) {
      throw new ServerProblem('That email and password don’t match.')
    }
    if (response.status === 429) {
      throw new ServerProblem('Too many tries. Wait a minute and try again.')
    }
    if (!response.ok) {
      throw new ServerProblem(
        await readErrorMessage(response, 'Signing in didn’t work. Try again.')
      )
    }

    const body = signInBodySchema.parse(await response.json())
    // The bearer plugin sends a signed token in this header; the body's works too.
    const token = response.headers.get('set-auth-token') ?? body.token
    return signedInResponseSchema.parse({ token, user: body.user })
  }

  /** The signed-in person, or null if the token has expired or was revoked. */
  const getSessionUser = async (
    serverUrl: string,
    token: string
  ): Promise<TSessionUser | null> => {
    const response = await apiRequest(serverUrl, '/auth/get-session', { token })
    if (!response.ok) return null
    const body = sessionBodySchema.safeParse(
      await response.json().catch(() => null)
    )
    return body.data?.user ?? null
  }

  /** What a join link leads to, or null if it's dead. */
  const previewJoin = async (
    serverUrl: string,
    joinToken: string
  ): Promise<TJoinPreview | null> => {
    const response = await apiRequest(
      serverUrl,
      `/join/${encodeURIComponent(joinToken)}`
    )
    if (response.status === 404) return null
    if (!response.ok) {
      throw new ServerProblem(
        await readErrorMessage(response, 'The join link didn’t work.')
      )
    }
    return joinPreviewSchema.parse(await response.json())
  }

  const join = async (
    serverUrl: string,
    joinToken: string,
    input: TJoinForm
  ) => {
    const response = await apiRequest(serverUrl, '/join', {
      method: 'POST',
      body: JSON.stringify({ ...input, token: joinToken })
    })
    if (!response.ok) {
      throw new ServerProblem(
        await readErrorMessage(response, 'Joining didn’t work. Try again.')
      )
    }
    return joinResponseSchema.parse(await response.json())
  }

  /** Whether an admin has let them in yet; null if the server forgot them. */
  const getJoinRequestStatus = async (serverUrl: string, ticket: string) => {
    const response = await apiRequest(serverUrl, '/join/request', {
      headers: { 'x-join-ticket': ticket }
    })
    if (response.status === 404) return null
    if (!response.ok) {
      throw new ServerProblem(
        await readErrorMessage(response, 'Couldn’t check on your request.')
      )
    }
    return joinRequestStatusSchema.parse(await response.json()).status
  }

  /** A signed-in call: a problem on failure, else the body (or null). */
  const signedInRequest = async (
    serverUrl: string,
    token: string,
    path: string,
    init: RequestInit = {}
  ): Promise<unknown> => {
    const response = await apiRequest(serverUrl, path, { ...init, token })
    if (!response.ok) {
      throw await readProblem(response, 'That didn’t work. Try again.')
    }
    return response.status === 204 ? null : response.json()
  }

  /** An admin's call under /team. */
  const teamRequest = (
    serverUrl: string,
    token: string,
    path: string,
    init: RequestInit = {}
  ) => signedInRequest(serverUrl, token, `/team${path}`, init)

  const team = {
    getJoinLink: async (serverUrl: string, token: string) =>
      joinLinkResponseSchema.parse(
        await teamRequest(serverUrl, token, '/join-link')
      ).joinLink,
    createJoinLink: async (
      serverUrl: string,
      token: string,
      settings: TJoinLinkSettings
    ) =>
      joinLinkResponseSchema.parse(
        await teamRequest(serverUrl, token, '/join-link', {
          method: 'POST',
          body: JSON.stringify(settings)
        })
      ).joinLink,
    updateJoinLink: async (
      serverUrl: string,
      token: string,
      settings: TJoinLinkSettings
    ) =>
      joinLinkResponseSchema.parse(
        await teamRequest(serverUrl, token, '/join-link', {
          method: 'PATCH',
          body: JSON.stringify(settings)
        })
      ).joinLink,
    disableJoinLink: async (serverUrl: string, token: string) => {
      await teamRequest(serverUrl, token, '/join-link', { method: 'DELETE' })
    },
    listMembers: async (serverUrl: string, token: string) =>
      membersResponseSchema.parse(
        await teamRequest(serverUrl, token, '/members')
      ).members,
    decideMember: async (
      serverUrl: string,
      token: string,
      memberId: string,
      decision: 'approve' | 'decline'
    ) => {
      await teamRequest(
        serverUrl,
        token,
        `/members/${encodeURIComponent(memberId)}/${decision}`,
        { method: 'POST', body: '{}' }
      )
    }
  }

  const sendJson = (method: string, body: unknown): RequestInit => ({
    method,
    body: JSON.stringify(body)
  })

  /** Companies, people and deals, checked against the shared schemas. */
  const records = {
    list: async (
      serverUrl: string,
      token: string,
      kind: TRecordKind,
      query?: Record<string, unknown>
    ) =>
      pageSchema(ITEM_SCHEMAS[kind]).parse(
        await signedInRequest(
          serverUrl,
          token,
          `/${kind}${toQueryString(query)}`
        )
      ),
    get: async (
      serverUrl: string,
      token: string,
      kind: TRecordKind,
      id: string
    ): Promise<TRecordItem> =>
      ITEM_SCHEMAS[kind].parse(
        await signedInRequest(
          serverUrl,
          token,
          `/${kind}/${encodeURIComponent(id)}`
        )
      ),
    create: async (
      serverUrl: string,
      token: string,
      kind: TRecordKind,
      input: unknown
    ): Promise<TRecordItem> =>
      ITEM_SCHEMAS[kind].parse(
        await signedInRequest(
          serverUrl,
          token,
          `/${kind}`,
          sendJson('POST', input)
        )
      ),
    update: async (
      serverUrl: string,
      token: string,
      kind: TRecordKind,
      id: string,
      input: unknown
    ): Promise<TRecordItem> =>
      ITEM_SCHEMAS[kind].parse(
        await signedInRequest(
          serverUrl,
          token,
          `/${kind}/${encodeURIComponent(id)}`,
          sendJson('PATCH', input)
        )
      ),
    // Archive or restore.
    setArchived: async (
      serverUrl: string,
      token: string,
      kind: TRecordKind,
      id: string,
      action: 'archive' | 'restore',
      version: number
    ): Promise<TRecordItem> =>
      ITEM_SCHEMAS[kind].parse(
        await signedInRequest(
          serverUrl,
          token,
          `/${kind}/${encodeURIComponent(id)}/${action}`,
          sendJson('POST', { version })
        )
      ),
    getPipeline: async (serverUrl: string, token: string) =>
      pipelineSchema.parse(
        await signedInRequest(serverUrl, token, '/pipeline')
      ),
    getBoard: async (serverUrl: string, token: string) =>
      boardSchema.parse(
        await signedInRequest(serverUrl, token, '/pipeline/board')
      ),
    listUsers: async (serverUrl: string, token: string) =>
      usersResponseSchema.parse(
        await signedInRequest(serverUrl, token, '/users')
      ).users
  }

  const signOut = async (serverUrl: string, token: string) => {
    await apiRequest(serverUrl, '/auth/sign-out', {
      method: 'POST',
      body: '{}',
      token
    })
  }

  return {
    checkServer,
    getSetupStatus,
    createAdmin,
    signIn,
    getSessionUser,
    signOut,
    previewJoin,
    join,
    getJoinRequestStatus,
    team,
    records,
    signedInRequest
  }
}

export type TServerApi = ReturnType<typeof createServerApi>
