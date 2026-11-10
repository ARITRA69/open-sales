import { z } from 'zod'

import { sessionUserSchema } from './auth'
import { stageSchema } from './records'

/*
 * Settings: the workspace, the pipeline's stages, the lost reasons and each
 * person's own name. Only admins change the workspace's; see
 * `canManageWorkspace` in roles.ts. Flow 5 in docs/user-flows.md.
 */

/* Workspace */

/** "USD", "EUR": a currency this machine knows (ISO 4217). */
export const isCurrencyCode = (code: string): boolean => {
  if (!/^[A-Z]{3}$/.test(code)) return false
  try {
    new Intl.NumberFormat('en', { style: 'currency', currency: code })
    return true
  } catch {
    return false
  }
}

/** "Europe/London": a time zone this machine knows (IANA). */
export const isTimeZone = (timeZone: string): boolean => {
  if (!timeZone || timeZone.length > 64) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone })
    return true
  } catch {
    return false
  }
}

const workspaceNameField = z
  .string()
  .trim()
  .min(1, 'Enter a name for your workspace')
  .max(80, 'Keep it under 80 characters')

/** GET /api/v1/settings/workspace. */
export const workspaceSettingsSchema = z.object({
  name: z.string(),
  // The default for new deals. Existing deals keep theirs.
  currency: z.string(),
  // For "due today" and report weeks.
  timeZone: z.string()
})

export type TWorkspaceSettings = z.infer<typeof workspaceSettingsSchema>

/** PATCH /api/v1/settings/workspace. Send what changed. Admins only. */
export const workspaceUpdateSchema = z
  .object({
    name: workspaceNameField,
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .refine(isCurrencyCode, 'Choose a currency from the list'),
    timeZone: z
      .string()
      .trim()
      .refine(isTimeZone, 'Choose a time zone from the list')
  })
  .partial()
  .refine(
    (changes) => Object.values(changes).some((value) => value !== undefined),
    'Nothing to change'
  )

export type TWorkspaceUpdate = z.infer<typeof workspaceUpdateSchema>

/* Your own account */

/** PATCH /api/v1/settings/me. Answers with the signed-in person. */
export const profileUpdateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter your name')
    .max(80, 'Keep it under 80 characters')
})

export type TProfileUpdate = z.infer<typeof profileUpdateSchema>

export const profileResponseSchema = z.object({ user: sessionUserSchema })

/* Pipeline stages and lost reasons */

export const MAX_STAGES = 20
export const MAX_LOST_REASONS = 30

/** A stage as Settings shows it: with how many deals sit in it. */
export const settingsStageSchema = stageSchema.extend({
  // Deals in the stage that aren't archived.
  dealCount: z.number().int()
})

export type TSettingsStage = z.infer<typeof settingsStageSchema>

/** A lost reason as Settings shows it; archived ones can be brought back. */
export const settingsLostReasonSchema = z.object({
  id: z.string(),
  label: z.string(),
  archivedAt: z.string().nullable()
})

export type TSettingsLostReason = z.infer<typeof settingsLostReasonSchema>

/**
 * GET /api/v1/settings/pipeline. The default pipeline as an admin edits it.
 * Send `revision` back with a save: if someone saved in between, the answer
 * is 409 `changed_since`.
 */
export const pipelineSettingsSchema = z.object({
  id: z.string(),
  name: z.string(),
  revision: z.string(),
  // In order: the open stages, then Won, then Lost.
  stages: z.array(settingsStageSchema),
  // In order, then the archived ones.
  lostReasons: z.array(settingsLostReasonSchema)
})

export type TPipelineSettings = z.infer<typeof pipelineSettingsSchema>

const stageNameField = z
  .string()
  .trim()
  .min(1, 'Give the stage a name')
  .max(40, 'Keep stage names under 40 characters')

// Plain words the AI reads. Empty means none.
const stageNoteField = z
  .string()
  .trim()
  .max(500, 'Keep it under 500 characters')
  .transform((text) => text || null)
  .nullable()

/** One open stage in a save. No `id` means a new stage. */
export const stageInputSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  name: stageNameField,
  winProbability: z
    .number('Enter a win probability from 0 to 100')
    .int('Use a whole number for the win probability')
    .min(0, 'Win probability can’t be below 0')
    .max(100, 'Win probability can’t be above 100'),
  // Null means a deal here never counts as stalled.
  stalledAfterDays: z
    .number()
    .int('Use whole days')
    .min(1, 'Stalled after at least 1 day, or leave it empty')
    .max(3650, 'Keep it under 10 years')
    .nullable(),
  goal: stageNoteField,
  exitCriteria: stageNoteField
})

export type TStageInput = z.infer<typeof stageInputSchema>

/**
 * PUT /api/v1/settings/pipeline/stages. The whole list in one go: the open
 * stages in their new order, and the ones taken away. The server makes every
 * change in one transaction. Admins only.
 */
export const stagesSaveSchema = z.object({
  revision: z.string().min(1),
  stages: z
    .array(stageInputSchema)
    .min(1, 'Keep at least one stage before Won and Lost')
    .max(MAX_STAGES, `Keep it to ${MAX_STAGES} stages`),
  // Won and Lost can be renamed, never removed.
  wonName: stageNameField.optional(),
  lostName: stageNameField.optional(),
  // Stages taken away, and where each one's deals go (another stage that's
  // staying). Null is fine for a stage with no deals.
  removed: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        moveDealsTo: z.string().min(1).max(64).nullable()
      })
    )
    .max(MAX_STAGES)
    .default([])
})

export type TStagesSave = z.infer<typeof stagesSaveSchema>
export type TStagesSaveInput = z.input<typeof stagesSaveSchema>

/**
 * PUT /api/v1/settings/pipeline/lost-reasons. The reasons to offer, in
 * order. One with no `id` is new; one that's left out is archived; an
 * archived one that's listed comes back. Admins only.
 */
export const lostReasonsSaveSchema = z.object({
  revision: z.string().min(1),
  reasons: z
    .array(
      z.object({
        id: z.string().min(1).max(64).optional(),
        label: z
          .string()
          .trim()
          .min(1, 'Give the reason a name')
          .max(60, 'Keep reasons under 60 characters')
      })
    )
    .min(1, 'Keep at least one reason')
    .max(MAX_LOST_REASONS, `Keep it to ${MAX_LOST_REASONS} reasons`)
})

export type TLostReasonsSave = z.infer<typeof lostReasonsSaveSchema>

/** The first name used twice, ignoring case, or null. */
export const findRepeatedName = (names: string[]): string | null => {
  const seen = new Set<string>()
  for (const name of names) {
    const key = name.trim().toLowerCase()
    if (seen.has(key)) return name.trim()
    seen.add(key)
  }
  return null
}
