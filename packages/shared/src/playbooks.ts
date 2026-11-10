import { z } from 'zod'

import { ownerSchema } from './records'

/*
 * Playbooks: shared, reusable AI instructions the team runs on a record. What
 * the API takes and returns, the fixed set of things a playbook may change,
 * and how its steps become the words the AI is given. The tables are in
 * docs/data-model.md.
 */

/*
 * What a playbook may change. The set is closed: a playbook picks from these
 * and nothing else, and every change still arrives as a proposal someone
 * approves. Sending email and changing owners aren't in it, so no playbook
 * can be given them.
 */
export const PLAYBOOK_CHANGES = ['fields', 'tasks', 'email_drafts'] as const

export type TPlaybookChange = (typeof PLAYBOOK_CHANGES)[number]

export const PLAYBOOK_CHANGE_COPY: Record<
  TPlaybookChange,
  { label: string; hint: string }
> = {
  fields: {
    label: 'Fields',
    hint: 'Propose new values on the record, like the next step or close date.'
  },
  tasks: {
    label: 'Tasks',
    hint: 'Propose follow-up tasks with a due date.'
  },
  email_drafts: {
    label: 'Email drafts',
    hint: 'Write emails for a person to read, edit and send.'
  }
}

/** Shown wherever "what it may change" is: the part nobody can switch on. */
export const PLAYBOOK_NEVER_LINE = 'It can never send email or change owners.'

const NOT_ALLOWED =
  'A playbook may change fields, tasks and email drafts, and nothing else.'

const MAX_NAME = 200
const MAX_STEPS = 20_000
export const MAX_PLAYBOOK_BLANKS = 10
export const MAX_BLANK_OPTIONS = 12

/** Picked from the fixed set; listed once each, in the set's own order. */
const allowedChangesField = z
  .array(z.enum(PLAYBOOK_CHANGES, NOT_ALLOWED), NOT_ALLOWED)
  .transform((picked) =>
    PLAYBOOK_CHANGES.filter((change) => picked.includes(change))
  )

/*
 * A blank: something to ask the person before the playbook runs. `name` is
 * how the steps refer to it ("{Plan}"); `question` is what the person is
 * asked; with no options they type the answer.
 */
export const playbookBlankSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Give each blank a short name, like Plan')
    .max(40, 'Keep a blank’s name under 40 characters')
    .regex(/^[^{}]+$/, 'A blank’s name can’t contain { or }'),
  question: z
    .string()
    .trim()
    .min(1, 'Write the question to ask for each blank')
    .max(200, 'Keep each question under 200 characters'),
  options: z
    .array(
      z
        .string()
        .trim()
        .min(1, 'Remove the empty option')
        .max(80, 'Keep each option under 80 characters')
    )
    .max(MAX_BLANK_OPTIONS, `A blank takes up to ${MAX_BLANK_OPTIONS} options`)
    .default([])
})

export type TPlaybookBlank = z.infer<typeof playbookBlankSchema>

const blankKey = (name: string) => name.trim().toLowerCase()

const blanksField = z
  .array(playbookBlankSchema)
  .max(
    MAX_PLAYBOOK_BLANKS,
    `A playbook asks up to ${MAX_PLAYBOOK_BLANKS} blanks`
  )
  .refine(
    (blanks) =>
      new Set(blanks.map((blank) => blankKey(blank.name))).size ===
      blanks.length,
    'Two blanks have the same name. Give each its own.'
  )

const playbookFields = {
  name: z
    .string()
    .trim()
    .min(1, 'Name the playbook')
    .max(MAX_NAME, `Keep it under ${MAX_NAME} characters`),
  // One line saying what it does. An empty box is stored as null.
  description: z
    .string()
    .trim()
    .max(MAX_NAME, `Keep it under ${MAX_NAME} characters`)
    .transform((text) => text || null)
    .nullable()
    .optional(),
  // Plain words. A draft may have none yet; a published playbook needs them.
  steps: z
    .string()
    .trim()
    .max(MAX_STEPS, 'Those steps are too long. Split them into two playbooks.')
    .optional(),
  blanks: blanksField.optional(),
  allowedChanges: allowedChangesField.optional()
}

/** POST /api/v1/playbooks. Makes a draft; publishing is its own call. */
export const playbookCreateSchema = z.object(playbookFields)

export type TPlaybookCreate = z.input<typeof playbookCreateSchema>

const versionField = z.number().int().positive()

/**
 * PATCH /api/v1/playbooks/:id. Send what changed and the `version` you saw.
 * A change to the steps, blanks or allowed changes makes a new numbered
 * version of the playbook.
 */
export const playbookUpdateSchema = z
  .object(playbookFields)
  .partial()
  .extend({ version: versionField })

export type TPlaybookUpdate = z.input<typeof playbookUpdateSchema>

/** POST /api/v1/playbooks/:id/<action>, with the `version` you saw. */
export const PLAYBOOK_ACTIONS = [
  'publish',
  'unpublish',
  'archive',
  'restore'
] as const

export type TPlaybookAction = (typeof PLAYBOOK_ACTIONS)[number]

export const playbookActionRequestSchema = z.object({ version: versionField })

/** One numbered version: what the AI is told, and what it may change. */
export const playbookVersionSchema = z.object({
  id: z.string(),
  // 1, 2, 3…: counts the saved edits to the steps, blanks and allowed changes.
  number: z.number().int(),
  steps: z.string(),
  blanks: z.array(playbookBlankSchema),
  allowedChanges: z.array(z.enum(PLAYBOOK_CHANGES)),
  // Null for the starters that came with the product.
  createdBy: ownerSchema.nullable(),
  createdAt: z.string()
})

export type TPlaybookVersion = z.infer<typeof playbookVersionSchema>

export const PLAYBOOK_STATUSES = ['draft', 'published'] as const

export type TPlaybookStatus = (typeof PLAYBOOK_STATUSES)[number]

export const playbookSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  // Null for a starter playbook.
  author: ownerSchema.nullable(),
  status: z.enum(PLAYBOOK_STATUSES),
  publishedAt: z.string().nullable(),
  // The version in use: the newest one.
  current: playbookVersionSchema,
  // Bumped on every write, for the "changed since" check. Not the numbered
  // version above, which only counts edits to what the AI is told.
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
  // Whether the signed-in person may change it. The server checks again.
  canEdit: z.boolean()
})

export type TPlaybook = z.infer<typeof playbookSchema>

/** Query string for GET /api/v1/playbooks. Paged by cursor, A–Z. */
export const playbookListQuerySchema = z.object({
  // Matches names and descriptions containing this.
  q: z.string().trim().max(100).optional(),
  // People who can't write playbooks only ever get published ones.
  status: z.enum(['any', ...PLAYBOOK_STATUSES]).default('any'),
  archived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100)
})

export type TPlaybookListQuery = z.output<typeof playbookListQuerySchema>

export type TPlaybookListQueryInput = z.input<typeof playbookListQuerySchema>

/* The starters every new server comes with. The migration seeds the same rows. */

export type TStarterPlaybook = {
  name: string
  description: string
  steps: string
  blanks: TPlaybookBlank[]
  allowedChanges: TPlaybookChange[]
}

export const STARTER_PLAYBOOKS: TStarterPlaybook[] = [
  {
    name: 'Meeting prep',
    description: 'A one-page brief before you meet an account.',
    steps: [
      '1. Read this record’s timeline: the recent emails, notes and calls, and any open tasks.',
      '2. Say who will be in the meeting and what each person cares about, from what we know. If we know nothing about someone, say so.',
      '3. Say where things stand: the stage, value, close date and next step, and anything we promised that isn’t done yet.',
      '4. Suggest three questions to ask in this {Meeting type}, and the one outcome to aim for.',
      '5. Give me the brief in a few short sections I can read in two minutes, with where you read each fact.',
      '6. If the next step or the close date looks out of date, propose the change. Propose a task for anything I should do before the meeting.'
    ].join('\n'),
    blanks: [
      {
        name: 'Meeting type',
        question: 'What kind of meeting is it?',
        options: ['First call', 'Discovery', 'Demo', 'Pricing', 'Check-in']
      }
    ],
    allowedChanges: ['fields', 'tasks']
  },
  {
    name: 'Follow-up after a call',
    description:
      'A recap email, the next step and tasks for what was promised.',
    steps: [
      '1. Read the notes from the latest call on this record, and the emails before it. If there are no notes from a call yet, say so and stop.',
      '2. Draft a recap email to the people who were on the call: thank them, list the three things they cared about most, and say what happens next and when. Keep it under 150 words and make it sound {Tone}.',
      '3. If the call changed the next step or the close date, propose the new ones on the deal.',
      '4. Propose a task for each thing we promised, with a due date.',
      '5. If they promised us something, propose a task to check on it in {Check back in}.'
    ].join('\n'),
    blanks: [
      {
        name: 'Tone',
        question: 'How should the email sound?',
        options: ['Friendly', 'Formal', 'Brief']
      },
      {
        name: 'Check back in',
        question: 'When should we check back if they go quiet?',
        options: ['2 days', '3 days', '1 week']
      }
    ],
    allowedChanges: ['fields', 'tasks', 'email_drafts']
  },
  {
    name: 'Stalled deal check',
    description: 'Why a deal has gone quiet, and one thing to do about it.',
    steps: [
      '1. Look at how long this deal has been in its stage, and when anyone last emailed, called or met.',
      '2. Read the last few emails and notes. Say in two sentences why it has most likely stalled: no reply, waiting on us, nobody who can decide, price, or timing.',
      '3. Check what the stage needs before a deal moves on, and say which parts aren’t done.',
      '4. Suggest one next step that fits. Propose it as the deal’s next step, with a task due this week.',
      '5. If a nudge would help, draft a short, friendly email that is easy to answer. Don’t draft one if we wrote last and it was less than three days ago.',
      '6. If the deal looks dead, say so plainly and propose a new close date instead of leaving the old one.'
    ].join('\n'),
    blanks: [],
    allowedChanges: ['fields', 'tasks', 'email_drafts']
  },
  {
    name: 'Renewal prep',
    description:
      'How likely they are to renew, and how to open the conversation.',
    steps: [
      '1. Find when this account’s contract renews and what they pay now.',
      '2. Read the last {Look back} of emails, notes and calls. List what has gone well and what has gone badly, each with where you read it.',
      '3. Say how likely they are to renew (likely, unsure or at risk) and why.',
      '4. Suggest what to offer: renew as it is, grow, or a way to keep them, and what to check with them first.',
      '5. Propose a task to start the renewal conversation, due 60 days before the renewal date, or tomorrow if that has passed.',
      '6. Draft a short email asking for a time to talk about the renewal.'
    ].join('\n'),
    blanks: [
      {
        name: 'Look back',
        question: 'How far back should it read?',
        options: ['3 months', '6 months', '12 months']
      }
    ],
    allowedChanges: ['tasks', 'email_drafts']
  }
]

/* Turning a playbook into the words the AI is given. */

/**
 * Puts the answers into the steps wherever they say `{Name}`. Answers the
 * steps don't mention come back as `unplaced`, to be listed after them.
 * Blanks with no answer are left as written.
 */
export const fillPlaybookSteps = (
  steps: string,
  blanks: TPlaybookBlank[],
  answers: Record<string, string>
) => {
  const byKey = new Map(blanks.map((blank) => [blankKey(blank.name), blank]))
  const placed = new Set<string>()

  const text = steps.replace(/\{([^{}\n]+)\}/g, (written, name: string) => {
    const blank = byKey.get(blankKey(name))
    const answer = blank ? answers[blank.name]?.trim() : undefined
    if (!blank || !answer) return written
    placed.add(blank.name)
    return answer
  })

  const unplaced = blanks
    .filter((blank) => !placed.has(blank.name) && answers[blank.name]?.trim())
    .map((blank) => ({
      question: blank.question,
      answer: answers[blank.name].trim()
    }))

  return { text, unplaced }
}

const listWords = (words: string[]) =>
  words.length <= 1
    ? words.join('')
    : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`

/**
 * The whole instruction for one run: the steps with the answers filled in,
 * what it's run on, and the limits on what it may change.
 */
export const buildPlaybookPrompt = (
  playbook: {
    name: string
    steps: string
    blanks: TPlaybookBlank[]
    allowedChanges: readonly TPlaybookChange[]
  },
  run: {
    answers?: Record<string, string>
    // What it's run on, as people would say it: "Halden Capital".
    targetLabel?: string
  } = {}
): string => {
  const filled = fillPlaybookSteps(
    playbook.steps,
    playbook.blanks,
    run.answers ?? {}
  )
  const allowed = playbook.allowedChanges.map((change) =>
    PLAYBOOK_CHANGE_COPY[change].label.toLowerCase()
  )

  return [
    run.targetLabel
      ? `Run the playbook “${playbook.name}” on ${run.targetLabel}.`
      : `Run the playbook “${playbook.name}”.`,
    `Steps:\n${filled.text}`,
    filled.unplaced.length > 0
      ? `Answers:\n${filled.unplaced
          .map(({ question, answer }) => `- ${question} ${answer}`)
          .join('\n')}`
      : null,
    allowed.length > 0
      ? `You may propose changes to ${listWords(allowed)}, and nothing else. Every change is a proposal for a person to approve. Never send email or change who owns a record.`
      : 'Don’t propose any changes: only answer. Never send email or change who owns a record.'
  ]
    .filter((part) => part !== null)
    .join('\n\n')
}
