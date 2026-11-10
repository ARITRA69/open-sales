import { z } from 'zod'

import { ownerSchema, personSchema } from './records'

/*
 * A record's timeline: notes, calls, tasks, field changes and stage moves in
 * one stream, and the calls that add to it. The tables behind them are under
 * "Timeline" in docs/data-model.md.
 */

const MAX_TITLE = 200
// Pasted call notes run long.
const MAX_BODY = 20_000
const MAX_PEOPLE = 50

/** A record something is about, by the name its page uses. */
export const RECORD_REF_TYPES = ['company', 'person', 'deal'] as const

export type TRecordRefType = (typeof RECORD_REF_TYPES)[number]

export const recordRefSchema = z.object({
  type: z.enum(RECORD_REF_TYPES),
  id: z.string().min(1).max(64)
})

export type TRecordRef = z.infer<typeof recordRefSchema>

/** A record as a link shows it. */
const namedSchema = z.object({ id: z.string(), name: z.string() })

export type TNamed = z.infer<typeof namedSchema>

const versionField = z.number().int().positive()

/** A moment, as ISO 8601 with a time zone. */
const momentField = z.iso.datetime({ offset: true, message: 'Enter a time' })

/** A calendar day, "2026-11-30". */
const dayField = z.iso.date('Enter a date').nullable()

/* Activities: notes and calls now; meetings and emails come with sync. */

export const ACTIVITY_TYPES = ['note', 'call', 'meeting', 'email'] as const

export type TActivityType = (typeof ACTIVITY_TYPES)[number]

export const ACTIVITY_SOURCES = [
  'manual',
  'ai',
  'email_sync',
  'calendar_sync',
  'import'
] as const

/** How a call went. */
export const CALL_OUTCOMES = ['connected', 'voicemail', 'no_answer'] as const

export type TCallOutcome = (typeof CALL_OUTCOMES)[number]

export const CALL_OUTCOME_LABELS: Record<TCallOutcome, string> = {
  connected: 'Spoke',
  voicemail: 'Left a voicemail',
  no_answer: 'No answer'
}

export const activitySchema = z.object({
  id: z.string(),
  type: z.enum(ACTIVITY_TYPES),
  // When it happened, or starts.
  occurredAt: z.string(),
  endsAt: z.string().nullable(),
  company: namedSchema.nullable(),
  deal: namedSchema.nullable(),
  // Who wrote or logged it. Null for synced emails.
  author: ownerSchema.nullable(),
  source: z.enum(ACTIVITY_SOURCES),
  title: z.string().nullable(),
  body: z.string().nullable(),
  // Calls only.
  outcome: z.enum(CALL_OUTCOMES).nullable(),
  // Who it involved: the people on a call, or the person a note is about.
  people: z.array(namedSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
  // Whether the signed-in person may change it. The server checks again.
  canEdit: z.boolean()
})

export type TActivity = z.infer<typeof activitySchema>

const noteBody = z
  .string()
  .trim()
  .min(1, 'Write the note first')
  .max(MAX_BODY, `Keep it under ${MAX_BODY} characters`)

const callNotes = z
  .string()
  .trim()
  .max(MAX_BODY, `Keep it under ${MAX_BODY} characters`)
  .transform((text) => text || null)
  .nullable()

const personIds = z.array(z.string().min(1).max(64)).max(MAX_PEOPLE)

/**
 * POST /api/v1/activities. `on` is the record whose page it was written
 * from: the server files it under that record's company, and under the deal
 * or person too.
 */
export const activityCreateSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('note'),
    on: recordRefSchema,
    body: noteBody
  }),
  z.object({
    type: z.literal('call'),
    on: recordRefSchema,
    // Defaults to now.
    occurredAt: momentField.optional(),
    outcome: z.enum(CALL_OUTCOMES).default('connected'),
    // The call notes.
    body: callNotes.optional(),
    // Who was on the call.
    personIds: personIds.default([])
  })
])

export type TActivityCreate = z.input<typeof activityCreateSchema>

/** PATCH /api/v1/activities/:id. Send only what changed. */
export const activityUpdateSchema = z.object({
  body: callNotes.optional(),
  occurredAt: momentField.optional(),
  outcome: z.enum(CALL_OUTCOMES).optional(),
  personIds: personIds.optional()
})

export type TActivityUpdate = z.input<typeof activityUpdateSchema>

/* Tasks */

export const TASK_SOURCES = ['manual', 'ai'] as const

export const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  notes: z.string().nullable(),
  // A calendar day; null means no date.
  dueOn: z.string().nullable(),
  assignee: ownerSchema,
  createdBy: ownerSchema,
  // What it's about. Any may be null.
  company: namedSchema.nullable(),
  deal: namedSchema.nullable(),
  person: namedSchema.nullable(),
  completedAt: z.string().nullable(),
  source: z.enum(TASK_SOURCES),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
  canEdit: z.boolean()
})

export type TTask = z.infer<typeof taskSchema>

const taskFields = {
  title: z
    .string()
    .trim()
    .min(1, 'Say what needs doing')
    .max(MAX_TITLE, `Keep it under ${MAX_TITLE} characters`),
  notes: z
    .string()
    .trim()
    .max(5000, 'Keep it under 5000 characters')
    .transform((text) => text || null)
    .nullable()
    .optional(),
  dueOn: dayField.optional(),
  // Defaults to you.
  assigneeId: z.string().min(1).optional()
}

/** POST /api/v1/tasks. `on` links it to a record; leave it out for none. */
export const taskCreateSchema = z.object({
  ...taskFields,
  on: recordRefSchema.optional()
})

export type TTaskCreate = z.input<typeof taskCreateSchema>

/** PATCH /api/v1/tasks/:id. Send only what changed, and the version. */
export const taskUpdateSchema = z
  .object(taskFields)
  .partial()
  .extend({ version: versionField })

export type TTaskUpdate = z.input<typeof taskUpdateSchema>

/** POST /api/v1/tasks/:id/complete, /reopen and /archive. */
export const taskActionSchema = z.object({ version: versionField })

/**
 * GET /api/v1/tasks. The default is my open tasks, soonest first.
 * `due=today` keeps those due today or overdue: Today's "Follow-ups due".
 */
export const taskListQuerySchema = z.object({
  assignee: z.enum(['me', 'anyone']).default('me'),
  due: z.enum(['today', 'any']).default('any'),
  status: z.enum(['open', 'done']).default('open'),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
})

export type TTaskListQuery = z.output<typeof taskListQuerySchema>

export type TTaskListQueryInput = z.input<typeof taskListQuerySchema>

/* The timeline */

/** One field's change, with ids already turned into names where it has them. */
export const fieldChangeSchema = z.object({
  field: z.string(),
  from: z.unknown(),
  to: z.unknown()
})

export type TFieldChange = z.infer<typeof fieldChangeSchema>

export const CHANGE_ACTIONS = [
  'create',
  'update',
  'archive',
  'restore',
  'purge'
] as const

export const CHANGE_VIAS = [
  'app',
  'ai_proposal',
  'import',
  'api',
  'system'
] as const

// What every item carries. `at` is when it happened (or is due); `upcoming`
// items are still ahead: open tasks, and anything dated in the future.
const itemFields = {
  id: z.string(),
  at: z.string().nullable(),
  upcoming: z.boolean()
}

export const timelineItemSchema = z.discriminatedUnion('kind', [
  z.object({
    ...itemFields,
    kind: z.literal('activity'),
    activity: activitySchema
  }),
  z.object({ ...itemFields, kind: z.literal('task'), task: taskSchema }),
  // A change to the record's own fields.
  z.object({
    ...itemFields,
    kind: z.literal('change'),
    // Null for the system.
    actor: ownerSchema.nullable(),
    // `ai_proposal` shows as "AI, approved by Asha".
    via: z.enum(CHANGE_VIAS),
    action: z.enum(CHANGE_ACTIONS),
    changes: z.array(fieldChangeSchema)
  }),
  // A deal entering a stage. `from` is null when the deal was created.
  z.object({
    ...itemFields,
    kind: z.literal('stage'),
    actor: ownerSchema.nullable(),
    deal: namedSchema,
    from: namedSchema.nullable(),
    to: namedSchema
  })
])

export type TTimelineItem = z.infer<typeof timelineItemSchema>

/**
 * GET /api/v1/companies/:id/timeline (and /people, /deals). The first page
 * starts with everything upcoming, soonest first; then history, newest
 * first. `nextCursor` pages the history.
 */
export const timelineSchema = z.object({
  items: z.array(timelineItemSchema),
  nextCursor: z.string().nullable()
})

export type TTimeline = z.infer<typeof timelineSchema>

export const timelineQuerySchema = z.object({
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30)
})

export type TTimelineQuery = z.output<typeof timelineQuerySchema>

export type TTimelineQueryInput = z.input<typeof timelineQuerySchema>

/**
 * GET /api/v1/companies/:id/people (everyone at the company, A–Z) and
 * /deals/:id/people (the people linked to the deal).
 */
export const peopleOfRecordSchema = z.object({ people: z.array(personSchema) })
