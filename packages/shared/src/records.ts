import { z } from 'zod'

import { phoneSchema } from './phone'

/*
 * Companies ("Accounts"), people and deals: what the API takes and returns.
 * The tables behind them are in docs/data-model.md. Every record carries a
 * `version`; an update must send the version it was made against, and the
 * server refuses it (409 `changed_since`) if someone changed it since.
 */

const MAX_NAME = 200
const MAX_TEXT = 5000

const requiredName = (message: string) =>
  z
    .string()
    .trim()
    .min(1, message)
    .max(MAX_NAME, `Keep it under ${MAX_NAME} characters`)

// Optional text: an empty box means "not set", stored as null.
const optionalText = (max = MAX_NAME) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters`)
    .transform((text) => text || null)
    .nullable()

/**
 * "https://www.Halden.com/about" → "halden.com". What people paste is a URL
 * as often as a domain.
 */
export const normaliseDomain = (input: string): string =>
  input
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#:].*$/, '')
    .replace(/\.$/, '')

const domainField = z
  .string()
  .transform(normaliseDomain)
  .pipe(
    z
      .string()
      .regex(/^$|^([a-z0-9-]+\.)+[a-z]{2,}$/, 'Enter a domain like halden.com')
  )
  .transform((domain) => domain || null)
  .nullable()

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.union([z.literal(''), z.email('Enter a valid email address')]))
  .transform((email) => email || null)
  .nullable()

const urlField = optionalText(500).pipe(
  z
    .url({
      protocol: /^https?$/,
      message: 'Enter a link starting with https://'
    })
    .nullable()
)

/** ISO 4217, like "USD". */
export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Use a three-letter code like USD')

/** A calendar day, "2026-11-30". */
const dayField = z.iso.date('Enter a date').nullable()

const versionField = z.number().int().positive()

/** Who a record belongs to, as lists show it. */
export const ownerSchema = z.object({ id: z.string(), name: z.string() })

export type TOwner = z.infer<typeof ownerSchema>

// Fields every record returns.
const recordFields = {
  id: z.string(),
  version: z.number().int(),
  customFields: z.record(z.string(), z.unknown()),
  source: z.string(),
  lastActivityAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
  // Whether the signed-in person may change it. The server checks again.
  canEdit: z.boolean()
}

/* Companies */

export const companySchema = z.object({
  ...recordFields,
  name: z.string(),
  domain: z.string().nullable(),
  industry: z.string().nullable(),
  description: z.string().nullable(),
  owner: ownerSchema
})

export type TCompany = z.infer<typeof companySchema>

const companyFields = {
  name: requiredName('Enter the company’s name'),
  domain: domainField.optional(),
  industry: optionalText().optional(),
  description: optionalText(MAX_TEXT).optional(),
  // Only managers and admins may name someone else; it defaults to you.
  ownerId: z.string().min(1).optional()
}

/** POST /api/v1/companies. */
export const companyCreateSchema = z.object(companyFields)

export type TCompanyCreate = z.input<typeof companyCreateSchema>

/** PATCH /api/v1/companies/:id. Send only what changed, and the version. */
export const companyUpdateSchema = z
  .object(companyFields)
  .partial()
  .extend({ version: versionField })

export type TCompanyUpdate = z.input<typeof companyUpdateSchema>

/* People */

export const personSchema = z.object({
  ...recordFields,
  name: z.string(),
  title: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  company: z.object({ id: z.string(), name: z.string() })
})

export type TPerson = z.infer<typeof personSchema>

const personFields = {
  // Everyone works somewhere: see "People without a company" in the data model.
  companyId: z.string().min(1, 'Choose their company'),
  name: requiredName('Enter their name'),
  title: optionalText().optional(),
  email: emailField.optional(),
  // Stored as E.164: "+442079460000".
  phone: phoneSchema.optional(),
  linkedinUrl: urlField.optional()
}

/** POST /api/v1/people. */
export const personCreateSchema = z.object(personFields)

export type TPersonCreate = z.input<typeof personCreateSchema>

/** PATCH /api/v1/people/:id. */
export const personUpdateSchema = z
  .object(personFields)
  .partial()
  .extend({ version: versionField })

export type TPersonUpdate = z.input<typeof personUpdateSchema>

/* Deals */

export const DEAL_STATUSES = ['open', 'won', 'lost'] as const

export type TDealStatus = (typeof DEAL_STATUSES)[number]

export const dealSchema = z.object({
  ...recordFields,
  name: z.string(),
  company: z.object({ id: z.string(), name: z.string() }),
  owner: ownerSchema,
  pipelineId: z.string(),
  stageId: z.string(),
  status: z.enum(DEAL_STATUSES),
  // Minor units: 1250000 is $12,500.00.
  valueMinor: z.number().int().nullable(),
  currency: z.string(),
  closeDate: z.string().nullable(),
  nextStep: z.string().nullable(),
  stageEnteredAt: z.string(),
  closedAt: z.string().nullable(),
  lostReasonId: z.string().nullable(),
  lostNote: z.string().nullable()
})

export type TDeal = z.infer<typeof dealSchema>

const dealFields = {
  name: requiredName('Name the deal'),
  // Defaults to the first stage of the default pipeline.
  stageId: z.string().min(1).optional(),
  valueMinor: z
    .number()
    .int('Use whole cents')
    .nonnegative('A deal can’t be worth less than nothing')
    .max(Number.MAX_SAFE_INTEGER)
    .nullable()
    .optional(),
  // Defaults to the workspace's currency.
  currency: currencySchema.optional(),
  closeDate: dayField.optional(),
  nextStep: optionalText(500).optional(),
  // Defaults to the company's owner. Only managers and admins may choose.
  ownerId: z.string().min(1).optional(),
  // Needed when the stage is a Lost stage.
  lostReasonId: z.string().min(1).nullable().optional(),
  lostNote: optionalText(MAX_TEXT).optional()
}

/** POST /api/v1/deals. */
export const dealCreateSchema = z.object({
  ...dealFields,
  companyId: z.string().min(1, 'Choose the company')
})

export type TDealCreate = z.input<typeof dealCreateSchema>

/** PATCH /api/v1/deals/:id. Moving stage is changing `stageId`. */
export const dealUpdateSchema = z
  .object(dealFields)
  .partial()
  .extend({ version: versionField })

export type TDealUpdate = z.input<typeof dealUpdateSchema>

/* Lists */

/** Query string for the lists. Paging is by cursor, never by page number. */
export const listQuerySchema = z.object({
  // Matches names (and emails, for people) containing this.
  q: z.string().trim().max(100).optional(),
  // "me": only records I own.
  owner: z.enum(['me', 'anyone']).default('anyone'),
  archived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
})

export type TListQuery = z.output<typeof listQuerySchema>

export type TListQueryInput = z.input<typeof listQuerySchema>

export const dealListQuerySchema = listQuerySchema.extend({
  companyId: z.string().optional(),
  status: z.enum(DEAL_STATUSES).optional()
})

export type TDealListQuery = z.output<typeof dealListQuerySchema>

export type TDealListQueryInput = z.input<typeof dealListQuerySchema>

export const pageSchema = <TItem extends z.ZodType>(item: TItem) =>
  z.object({
    items: z.array(item),
    // Pass back as `cursor` for the next page; null on the last.
    nextCursor: z.string().nullable()
  })

export type TPage<TItem> = { items: TItem[]; nextCursor: string | null }

/* Pipeline */

export const STAGE_KINDS = ['open', 'won', 'lost'] as const

export const stageSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: z.number().int(),
  kind: z.enum(STAGE_KINDS),
  winProbability: z.number().int(),
  stalledAfterDays: z.number().int().nullable(),
  goal: z.string().nullable(),
  exitCriteria: z.string().nullable()
})

export type TStage = z.infer<typeof stageSchema>

export const lostReasonSchema = z.object({ id: z.string(), label: z.string() })

export type TLostReason = z.infer<typeof lostReasonSchema>

/** GET /api/v1/pipeline. The default pipeline, its stages and lost reasons. */
export const pipelineSchema = z.object({
  id: z.string(),
  name: z.string(),
  currency: z.string(),
  stages: z.array(stageSchema),
  lostReasons: z.array(lostReasonSchema)
})

export type TPipeline = z.infer<typeof pipelineSchema>

/** GET /api/v1/pipeline/board. Open deals, and each stage's count and value. */
export const boardSchema = z.object({
  columns: z.array(
    z.object({
      stageId: z.string(),
      count: z.number().int(),
      valueMinor: z.number().int(),
      deals: z.array(dealSchema)
    })
  )
})

export type TBoard = z.infer<typeof boardSchema>

/** GET /api/v1/users. Everyone active on the team, A–Z: who can own records. */
export const usersResponseSchema = z.object({ users: z.array(ownerSchema) })

export type TUsersResponse = z.infer<typeof usersResponseSchema>

/** POST /api/v1/<records>/:id/archive and /restore. */
export const archiveRequestSchema = z.object({ version: versionField })
