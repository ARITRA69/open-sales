import { z } from 'zod'

import { phoneSchema } from './phone'
import { ownerSchema, pageSchema } from './records'

/*
 * Leads: people who've shown interest and wait in the inbox until someone
 * works them. Converting one makes (or finds) its account and person, and
 * optionally a deal. See "Work new leads" in docs/user-flows.md; who may do
 * what is in roles.ts.
 */

const MAX_NAME = 200
const MAX_TEXT = 5000

export const LEAD_STATUSES = [
  'new',
  'qualified',
  'disqualified',
  'converted'
] as const

export type TLeadStatus = (typeof LEAD_STATUSES)[number]

/** Where a lead came from. Stored as text, so more can be added. */
export const LEAD_SOURCES = ['manual', 'import', 'web_form', 'email'] as const

export type TLeadSource = (typeof LEAD_SOURCES)[number]

/** Still to be worked: not yet converted or turned away. */
export const isOpenLead = (status: TLeadStatus): boolean =>
  status === 'new' || status === 'qualified'

const optionalText = (max = MAX_NAME) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters`)
    .transform((text) => text || null)
    .nullable()

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.union([z.literal(''), z.email('Enter a valid email address')]))
  .transform((email) => email || null)
  .nullable()

const versionField = z.number().int().positive()

export const leadSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  companyName: z.string().nullable(),
  title: z.string().nullable(),
  // What they wrote.
  message: z.string().nullable(),
  source: z.string(),
  status: z.enum(LEAD_STATUSES),
  // Null until someone is given it or takes it.
  owner: ownerSchema.nullable(),
  // The AI's note on fit, once something has written one.
  fitNote: z.string().nullable(),
  disqualifiedReason: z.string().nullable(),
  // Set on convert.
  convertedCompanyId: z.string().nullable(),
  convertedPersonId: z.string().nullable(),
  convertedDealId: z.string().nullable(),
  version: z.number().int(),
  // When it arrived.
  createdAt: z.string(),
  updatedAt: z.string(),
  // Whether the signed-in person may qualify, disqualify or convert it, and
  // whether they may give it to someone (managers and admins) or take it.
  // The server checks again.
  canWork: z.boolean(),
  canAssign: z.boolean(),
  canTake: z.boolean()
})

export type TLead = z.infer<typeof leadSchema>

export const leadPageSchema = pageSchema(leadSchema)

/** POST /api/v1/leads. Adding a lead by hand. */
export const leadCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter their name')
    .max(MAX_NAME, `Keep it under ${MAX_NAME} characters`),
  email: emailField.optional(),
  // Stored as E.164: "+442079460000".
  phone: phoneSchema.optional(),
  companyName: optionalText().optional(),
  title: optionalText().optional(),
  message: optionalText(MAX_TEXT).optional(),
  // Left out, it's yours. Null leaves it for anyone to take. Only managers
  // and admins may name someone else.
  ownerId: z.string().min(1).nullable().optional()
})

export type TLeadCreate = z.input<typeof leadCreateSchema>

/** GET /api/v1/leads. Newest first, paged by cursor. */
export const leadListQuerySchema = z.object({
  // Matches names, emails and company names containing this.
  q: z.string().trim().max(100).optional(),
  // "me": mine. "none": nobody's yet.
  owner: z.enum(['anyone', 'me', 'none']).default('anyone'),
  // "open": new and qualified, the ones still to work.
  status: z.enum(['open', 'any', ...LEAD_STATUSES]).default('open'),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
})

export type TLeadListQuery = z.output<typeof leadListQuerySchema>

export type TLeadListQueryInput = z.input<typeof leadListQuerySchema>

/** POST /api/v1/leads/:id/qualify and /reopen. */
export const leadVersionSchema = z.object({ version: versionField })

/** POST /api/v1/leads/:id/assign. Null takes it back from whoever has it. */
export const leadAssignSchema = z.object({
  version: versionField,
  ownerId: z.string().min(1).nullable()
})

export type TLeadAssign = z.input<typeof leadAssignSchema>

/** POST /api/v1/leads/:id/disqualify. */
export const leadDisqualifySchema = z.object({
  version: versionField,
  reason: z
    .string()
    .trim()
    .min(1, 'Say why, in a few words')
    .max(500, 'Keep it under 500 characters')
})

export type TLeadDisqualify = z.input<typeof leadDisqualifySchema>

/** GET /api/v1/leads/:id/match. */
export const leadMatchQuerySchema = z.object({
  // The company name to look for, if the person changed the lead's.
  companyName: z.string().trim().max(MAX_NAME).optional()
})

export type TLeadMatchQuery = z.input<typeof leadMatchQuerySchema>

export const LEAD_MATCH_KINDS = ['person', 'domain', 'name'] as const

/**
 * What converting this lead would do, shown before the person confirms. The
 * account was spotted by someone there already having the lead's email
 * (`person`), by the email's domain, or by its name.
 */
export const leadMatchSchema = z.object({
  // The account it would join, or null to make a new one.
  company: z
    .object({
      id: z.string(),
      name: z.string(),
      owner: ownerSchema,
      matchedBy: z.enum(LEAD_MATCH_KINDS)
    })
    .nullable(),
  // Someone who already has the lead's email: convert links to them rather
  // than adding the same person twice.
  person: z.object({ id: z.string(), name: z.string() }).nullable(),
  // Whether this person may add a deal as part of converting.
  canAddDeal: z.boolean()
})

export type TLeadMatch = z.infer<typeof leadMatchSchema>

/** POST /api/v1/leads/:id/convert. */
export const leadConvertSchema = z.object({
  version: versionField,
  // The account the person was shown (from /match), or null if they were
  // told a new one would be made. If that's no longer what the server finds,
  // it answers 409 `match_changed` rather than doing something unseen.
  companyId: z.string().min(1).nullable(),
  // The new account's name, when the lead's is missing or wrong.
  companyName: z.string().trim().max(MAX_NAME).optional(),
  // Leave out, or null, to convert without a deal.
  deal: z
    .object({
      name: z
        .string()
        .trim()
        .min(1, 'Name the deal')
        .max(MAX_NAME, `Keep it under ${MAX_NAME} characters`),
      valueMinor: z
        .number()
        .int('Use whole cents')
        .nonnegative('A deal can’t be worth less than nothing')
        .max(Number.MAX_SAFE_INTEGER)
        .nullable()
        .optional()
    })
    .nullable()
    .optional()
})

export type TLeadConvert = z.input<typeof leadConvertSchema>

/** What converting did, with links for the app to offer. */
export const leadConvertedSchema = z.object({
  lead: leadSchema,
  company: z.object({
    id: z.string(),
    name: z.string(),
    // Unchanged when the account already existed, whoever converted.
    owner: ownerSchema,
    // False when the account was already there and the person joined it.
    isNew: z.boolean()
  }),
  person: z.object({ id: z.string(), name: z.string(), isNew: z.boolean() }),
  deal: z.object({ id: z.string(), name: z.string() }).nullable()
})

export type TLeadConverted = z.infer<typeof leadConvertedSchema>

/*
 * Matching a lead to a company by its email's domain. Free-mail addresses
 * say nothing about where someone works, so they never match or make a
 * company: see "People without a company" in docs/data-model.md.
 */

const FREE_MAIL_DOMAINS = new Set([
  'aol.com',
  'fastmail.com',
  'gmail.com',
  'gmx.com',
  'gmx.net',
  'googlemail.com',
  'hey.com',
  'hotmail.co.uk',
  'hotmail.com',
  'icloud.com',
  'live.com',
  'mac.com',
  'mail.com',
  'me.com',
  'msn.com',
  'outlook.com',
  'pm.me',
  'proton.me',
  'protonmail.com',
  'qq.com',
  'rediffmail.com',
  'yahoo.co.in',
  'yahoo.co.uk',
  'yahoo.com',
  'yandex.com',
  'yandex.ru',
  'zoho.com'
])

export const isFreeMailDomain = (domain: string): boolean =>
  FREE_MAIL_DOMAINS.has(domain.toLowerCase())

/**
 * "Dana@Halden.com" → "halden.com": the company domain an email points at,
 * or null for no email or a free-mail address.
 */
export const companyDomainOfEmail = (email: string | null): string | null => {
  const domain = email?.trim().toLowerCase().split('@')[1]
  if (!domain || isFreeMailDomain(domain)) return null
  return domain
}
