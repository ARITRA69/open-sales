import { z } from 'zod'

import { MIN_PASSWORD_LENGTH, sessionUserSchema } from './auth'
import { ROLES } from './roles'

/*
 * Joining a team with its join link, and the admin's side of it: the link
 * itself and approving people. See "Team join link" in docs/user-flows.md.
 */

/** Whether someone can use the app: `pending` waits for an admin's approval. */
export const USER_STATUSES = [
  'active',
  'pending',
  'declined',
  'deactivated'
] as const

export type TUserStatus = (typeof USER_STATUSES)[number]

// "acme.com": lower case, no @ or scheme. People at it join without approval.
const domainField = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^(?=.{1,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/,
    'Enter a domain like acme.com'
  )

/** GET /api/v1/team/join-link. Null when the link is turned off. */
export const joinLinkSchema = z.object({
  url: z.string(),
  allowedDomain: z.string().nullable(),
  role: z.enum(ROLES),
  createdAt: z.string()
})

export type TJoinLink = z.infer<typeof joinLinkSchema>

export const joinLinkResponseSchema = z.object({
  joinLink: joinLinkSchema.nullable()
})

/** POST /api/v1/team/join-link (a new link) and PATCH (change the domain). */
export const joinLinkSettingsSchema = z.object({
  allowedDomain: domainField.nullable()
})

export type TJoinLinkSettings = z.infer<typeof joinLinkSettingsSchema>

/** GET /api/v1/join/:token. What a join link leads to, before joining. */
export const joinPreviewSchema = z.object({
  workspaceName: z.string().nullable()
})

export type TJoinPreview = z.infer<typeof joinPreviewSchema>

/** What the person types on the Join screen. */
export const joinFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter your name')
    .max(80, 'Keep it under 80 characters'),
  email: z.email('Enter a valid email address'),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`)
    .max(128, 'Keep it under 128 characters')
})

export type TJoinForm = z.infer<typeof joinFormSchema>

/** POST /api/v1/join. */
export const joinRequestSchema = joinFormSchema.extend({
  token: z.string().min(1)
})

export type TJoinRequest = z.infer<typeof joinRequestSchema>

/**
 * People at the link's domain are in straight away. Everyone else waits for
 * an admin; `ticket` lets the app ask how that's going.
 */
export const joinResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('active'),
    token: z.string(),
    user: sessionUserSchema
  }),
  z.object({ status: z.literal('pending'), ticket: z.string() })
])

export type TJoinResponse = z.infer<typeof joinResponseSchema>

/** GET /api/v1/join/request, with the ticket in `x-join-ticket`. */
export const joinRequestStatusSchema = z.object({
  status: z.enum(['pending', 'approved', 'declined'])
})

export type TJoinRequestStatus = z.infer<typeof joinRequestStatusSchema>

/** One person on the team, as Settings › People lists them. */
export const memberSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.enum(ROLES),
  status: z.enum(USER_STATUSES),
  joinedAt: z.string()
})

export type TMember = z.infer<typeof memberSchema>

export const membersResponseSchema = z.object({
  members: z.array(memberSchema)
})

/**
 * PATCH /api/v1/team/members/:id. Change someone's role, or whether they can
 * sign in. Admins only; the workspace always keeps one active admin.
 */
export const memberUpdateSchema = z
  .object({
    role: z.enum(ROLES),
    status: z.enum(['active', 'deactivated'])
  })
  .partial()
  .refine(
    (changes) => changes.role !== undefined || changes.status !== undefined,
    'Nothing to change'
  )

export type TMemberUpdate = z.infer<typeof memberUpdateSchema>

export const memberResponseSchema = z.object({ member: memberSchema })
