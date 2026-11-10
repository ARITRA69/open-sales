import { z } from 'zod'

import { ownerSchema } from './records'

/*
 * Proposals: a change AI wants to make, waiting for a person to say yes.
 * Nothing changes until someone approves; the server checks their role when
 * the proposal is made and again when it's approved. The table behind them is
 * in docs/data-model.md, the life of one in docs/user-flows.md.
 */

export const PROPOSAL_KINDS = [
  'update',
  'create',
  'archive',
  'email_draft'
] as const

export type TProposalKind = (typeof PROPOSAL_KINDS)[number]

export const PROPOSAL_STATUSES = [
  'pending',
  'approved',
  'declined',
  'out_of_date',
  'undone'
] as const

export type TProposalStatus = (typeof PROPOSAL_STATUSES)[number]

export const PROPOSAL_TARGET_TYPES = [
  'company',
  'person',
  'deal',
  'task',
  'activity'
] as const

export type TProposalTargetType = (typeof PROPOSAL_TARGET_TYPES)[number]

/** What a proposal can change today. Tasks and activities come with them. */
export const PROPOSAL_RECORD_TYPES = ['company', 'person', 'deal'] as const

export type TProposalRecordType = (typeof PROPOSAL_RECORD_TYPES)[number]

/** The AI tools a proposal can come from. */
export const AI_ENGINES = ['claude-code', 'codex'] as const

export type TAiEngine = (typeof AI_ENGINES)[number]

/** How long after approving a change it can still be undone. */
export const PROPOSAL_UNDO_MS = 5 * 60 * 1000

/**
 * The fields AI may propose a value for. Never the owner: giving a record to
 * someone else is a person's decision.
 */
export const PROPOSAL_FIELDS = {
  company: ['name', 'domain', 'industry', 'description'],
  person: ['name', 'title', 'email', 'phone', 'linkedinUrl', 'companyId'],
  deal: [
    'name',
    'stageId',
    'valueMinor',
    'currency',
    'closeDate',
    'nextStep',
    'lostReasonId',
    'lostNote',
    // Only when proposing a new deal: a deal never moves company.
    'companyId'
  ]
} as const satisfies Record<TProposalRecordType, readonly string[]>

/** Still needs a person: not yet decided, or the record changed under it. */
export const isWaitingProposal = (status: TProposalStatus) =>
  status === 'pending' || status === 'out_of_date'

/** A field's value: text, a number (money is in minor units) or nothing. */
export const proposalValueSchema = z.union([z.string(), z.number(), z.null()])

export type TProposalValue = z.infer<typeof proposalValueSchema>

const fieldName = z.string().trim().min(1).max(64)

/** One field on the card: the old value crossed out beside the new one. */
export const proposalChangeSchema = z.object({
  field: z.string(),
  from: proposalValueSchema,
  to: proposalValueSchema,
  // Names for values that are ids, such as a stage: "Proposal".
  fromLabel: z.string().nullable(),
  toLabel: z.string().nullable(),
  // What the record says now, while the proposal waits. It differs from
  // `from` once someone has changed the record.
  current: proposalValueSchema.optional(),
  currentLabel: z.string().nullable().optional()
})

export type TProposalChange = z.infer<typeof proposalChangeSchema>

/** The email, note or record a proposal came from. */
export const proposalSourceSchema = z.object({
  type: z.string().trim().min(1).max(40),
  id: z.string().trim().min(1).max(500),
  label: z.string().trim().max(200).optional()
})

export type TProposalSource = z.infer<typeof proposalSourceSchema>

export const proposalSchema = z.object({
  id: z.string(),
  kind: z.enum(PROPOSAL_KINDS),
  // `out_of_date` as soon as the record's version moves past the one the
  // proposal was made against, even before anyone tries to approve it.
  status: z.enum(PROPOSAL_STATUSES),
  title: z.string(),
  // The one-line reason: "Dan asked for pricing by Friday".
  why: z.string().nullable(),
  target: z.object({
    type: z.enum(PROPOSAL_TARGET_TYPES),
    // Null for a new record until it's approved.
    id: z.string().nullable(),
    name: z.string(),
    // The company a person or deal belongs to.
    companyName: z.string().nullable(),
    // For showing a deal's value.
    currency: z.string().nullable(),
    // The record's version now. Send it back to approve a proposal that went
    // out of date, once the person has seen the current values.
    version: z.number().int().nullable()
  }),
  changes: z.array(proposalChangeSchema),
  sources: z.array(proposalSourceSchema),
  // Whose AI made it.
  requestedBy: ownerSchema,
  // Who decides: the requester, or the record's owner once it's sent to them.
  approver: ownerSchema,
  engine: z.enum(AI_ENGINES),
  decidedBy: ownerSchema.nullable(),
  decidedAt: z.string().nullable(),
  declineReason: z.string().nullable(),
  // Approved changes can be undone until then.
  undoUntil: z.string().nullable(),
  createdAt: z.string(),
  // Whether the signed-in person is the one who decides.
  canDecide: z.boolean()
})

export type TProposal = z.infer<typeof proposalSchema>

const proposedValue = z.object({ field: fieldName, to: proposalValueSchema })

/**
 * POST /api/v1/proposals. Made by a person's own AI tool, as that person. The
 * server reads the old values itself; send the version the AI read as
 * `baseVersion` and the answer is 409 `changed_since` if it has moved.
 */
export const proposalCreateSchema = z.object({
  kind: z.enum(PROPOSAL_KINDS),
  targetType: z.enum(PROPOSAL_TARGET_TYPES),
  // Left out when proposing a new record.
  targetId: z.string().min(1).max(64).nullable().optional(),
  baseVersion: z.number().int().positive().optional(),
  // For a new record, every field it starts with.
  changes: z.array(proposedValue).max(30).default([]),
  title: z
    .string()
    .trim()
    .min(1, 'Say what the change is')
    .max(200, 'Keep the title under 200 characters'),
  why: z
    .string()
    .trim()
    .max(500, 'Keep the reason under 500 characters')
    .transform((text) => text || null)
    .nullable()
    .optional(),
  sources: z.array(proposalSourceSchema).max(20).default([]),
  engine: z.enum(AI_ENGINES)
})

export type TProposalCreate = z.input<typeof proposalCreateSchema>

/**
 * POST /api/v1/proposals/:id/approve. As it is, or with values the person
 * edited first. If the record changed since, the answer is 409
 * `changed_since` and carries the proposal with the current values; approving
 * again with that `version` applies it anyway.
 */
export const proposalApproveSchema = z.object({
  changes: z.array(proposedValue).max(30).optional(),
  version: z.number().int().positive().optional()
})

export type TProposalApprove = z.input<typeof proposalApproveSchema>

/** POST /api/v1/proposals/:id/decline. The reason helps the AI next time. */
export const proposalDeclineSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(500, 'Keep the reason under 500 characters')
    .transform((text) => text || null)
    .nullable()
    .optional()
})

export type TProposalDecline = z.input<typeof proposalDeclineSchema>

/**
 * GET /api/v1/proposals. Without a target: what waits for me, newest first.
 * With one: what waits on that record, whoever decides it.
 */
export const proposalListQuerySchema = z.object({
  targetType: z.enum(PROPOSAL_RECORD_TYPES).optional(),
  targetId: z.string().max(64).optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
})

export type TProposalListQuery = z.output<typeof proposalListQuerySchema>

export type TProposalListQueryInput = z.input<typeof proposalListQuerySchema>

export const proposalPageSchema = z.object({
  items: z.array(proposalSchema),
  nextCursor: z.string().nullable(),
  // Everything that matches, not only this page: the sidebar's count.
  total: z.number().int()
})

export type TProposalPage = z.infer<typeof proposalPageSchema>

/**
 * A refusal that carries the proposal as it now stands: 409 `changed_since`
 * with the record's current values.
 */
export const proposalConflictSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
  proposal: proposalSchema.optional()
})
