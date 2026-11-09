import { z } from 'zod'

import { ROLES } from './roles'

/*
 * Signing in, and setting up a new server. The messages are written for people:
 * the app shows them next to the field they belong to.
 */

export const MIN_PASSWORD_LENGTH = 8

const emailField = z.email('Enter a valid email address')

/** GET /api/v1/setup. Whether the server still needs its first admin. */
export const setupStatusSchema = z.object({
  needsSetup: z.boolean(),
  // Null until setup has named the workspace.
  workspaceName: z.string().nullable()
})

export type TSetupStatus = z.infer<typeof setupStatusSchema>

/** POST /api/v1/setup. Creates the workspace and its first admin. */
export const setupRequestSchema = z.object({
  workspaceName: z
    .string()
    .trim()
    .min(1, 'Enter a name for your workspace')
    .max(80, 'Keep it under 80 characters'),
  name: z
    .string()
    .trim()
    .min(1, 'Enter your name')
    .max(80, 'Keep it under 80 characters'),
  email: emailField,
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`)
    .max(128, 'Keep it under 128 characters')
})

export type TSetupRequest = z.infer<typeof setupRequestSchema>

/** POST /api/v1/auth/sign-in/email. */
export const signInRequestSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Enter your password')
})

export type TSignInRequest = z.infer<typeof signInRequestSchema>

/** The signed-in person, as the app needs them. */
export const sessionUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.enum(ROLES)
})

export type TSessionUser = z.infer<typeof sessionUserSchema>

/** Returned when setup finishes: the new admin is signed in straight away. */
export const signedInResponseSchema = z.object({
  token: z.string(),
  user: sessionUserSchema
})

export type TSignedInResponse = z.infer<typeof signedInResponseSchema>

/** Every API error has this shape. `code` is for code; `message` is for people. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string()
  })
})

export type TApiError = z.infer<typeof apiErrorSchema>
