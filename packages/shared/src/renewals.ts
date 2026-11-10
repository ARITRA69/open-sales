import { z } from 'zod'

import { currencySchema, ownerSchema } from './records'

/*
 * Contracts and their renewals: what /api/v1/contracts takes and returns.
 * A contract starts from a won deal and has a renewal date. Starting the
 * renewal makes a deal of kind `renewal` linked to it; "won't renew" ends
 * it with a reason. The table is in docs/data-model.md.
 */

/**
 * `active` until someone acts on it; `renewing` while its renewal deal is
 * open; `renewed` once that deal is won; `ended` when it's lost, or when
 * someone says it won't renew.
 */
export const CONTRACT_STATUSES = [
  'active',
  'renewing',
  'renewed',
  'ended'
] as const

export type TContractStatus = (typeof CONTRACT_STATUSES)[number]

/** How far ahead the renewal list looks, in days. */
export const RENEWAL_WINDOWS = [30, 60, 90] as const

export type TRenewalWindow = (typeof RENEWAL_WINDOWS)[number]

const MAX_REASON = 500

const dayField = (message: string) => z.iso.date(message)

const versionField = z.number().int().positive()

const moneyField = z
  .number('Enter the contract’s value')
  .int('Use whole cents')
  .nonnegative('A contract can’t be worth less than nothing')
  .max(Number.MAX_SAFE_INTEGER)

const namedSchema = z.object({ id: z.string(), name: z.string() })

export const contractSchema = z.object({
  id: z.string(),
  version: z.number().int(),
  company: namedSchema,
  // The company's owner: contracts follow their company.
  owner: ownerSchema,
  // The won deal that started it.
  deal: namedSchema.nullable(),
  // The newest deal renewing it, once a renewal has been started.
  renewalDeal: namedSchema
    .extend({ status: z.enum(['open', 'won', 'lost']) })
    .nullable(),
  // Minor units: 1250000 is $12,500.00.
  valueMinor: z.number().int(),
  currency: z.string(),
  // Calendar days, "2026-11-30".
  startsOn: z.string(),
  renewsOn: z.string(),
  status: z.enum(CONTRACT_STATUSES),
  // Why it ended: the "won't renew" reason, or the lost deal's.
  endReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  // Whether the signed-in person may change it. The server checks again.
  canEdit: z.boolean()
})

export type TContract = z.infer<typeof contractSchema>

/** POST /api/v1/contracts. A won deal starts one contract. */
export const contractCreateSchema = z
  .object({
    dealId: z.string().min(1, 'Choose the won deal'),
    startsOn: dayField('Enter the start date'),
    renewsOn: dayField('Enter the renewal date'),
    valueMinor: moneyField,
    // Defaults to the deal's currency.
    currency: currencySchema.optional()
  })
  .refine((contract) => contract.renewsOn > contract.startsOn, {
    path: ['renewsOn'],
    message: 'The renewal date must be after the start date'
  })

export type TContractCreate = z.input<typeof contractCreateSchema>

/**
 * POST /api/v1/contracts/:id/start-renewal. Anything left out is filled in
 * from the contract: its value, its renewal date as the close date, and
 * the pipeline's first stage.
 */
export const renewalStartSchema = z.object({
  version: versionField,
  valueMinor: moneyField.nullable().optional(),
  closeDate: dayField('Enter a date').nullable().optional(),
  stageId: z.string().min(1).optional()
})

export type TRenewalStart = z.input<typeof renewalStartSchema>

/** POST /api/v1/contracts/:id/end. "Won't renew", and why. */
export const contractEndSchema = z.object({
  version: versionField,
  reason: z
    .string()
    .trim()
    .min(1, 'Say why they won’t renew')
    .max(MAX_REASON, `Keep it under ${MAX_REASON} characters`)
})

export type TContractEnd = z.input<typeof contractEndSchema>

/** POST /api/v1/contracts/:id/reopen. An ended contract is active again. */
export const contractReopenSchema = z.object({ version: versionField })

const pagingFields = {
  // "me": only contracts at companies I own.
  owner: z.enum(['me', 'anyone']).default('anyone'),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
}

/**
 * GET /api/v1/contracts. `upcoming` is what still needs someone: active and
 * renewing contracts due within the window, overdue ones included, soonest
 * first. `closed` is renewed and ended contracts, newest renewal date first;
 * the window doesn't apply.
 */
export const contractListQuerySchema = z.object({
  view: z.enum(['upcoming', 'closed']).default('upcoming'),
  window: z.coerce
    .number()
    .pipe(z.union(RENEWAL_WINDOWS.map((days) => z.literal(days))))
    .default(90),
  ...pagingFields
})

export type TContractListQuery = z.output<typeof contractListQuerySchema>

export type TContractListQueryInput = z.input<typeof contractListQuerySchema>

/** A won deal nobody has added a contract for yet. */
export const contractCandidateSchema = z.object({
  deal: namedSchema,
  company: namedSchema,
  owner: ownerSchema,
  valueMinor: z.number().int().nullable(),
  currency: z.string(),
  closeDate: z.string().nullable(),
  // Dates to start from. A won renewal picks up where the contract it
  // renewed leaves off, for the same length of time; anything else starts
  // on its close date and runs a year.
  suggestedStartsOn: z.string(),
  suggestedRenewsOn: z.string(),
  canEdit: z.boolean()
})

export type TContractCandidate = z.infer<typeof contractCandidateSchema>

/** GET /api/v1/contracts/candidates. Newest deals first. */
export const contractCandidateQuerySchema = z.object({
  ...pagingFields,
  limit: pagingFields.limit.default(20)
})

export type TContractCandidateQuery = z.output<
  typeof contractCandidateQuerySchema
>

export type TContractCandidateQueryInput = z.input<
  typeof contractCandidateQuerySchema
>

/* Calendar days, as "2026-11-30". Worked out in UTC so no time zone moves them. */

const DAY_MS = 24 * 60 * 60 * 1000

const toUtc = (day: string) => {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date))
}

const toDay = (date: Date) => date.toISOString().slice(0, 10)

/** The same day a number of months on, or that month's last day: 31 Jan + 1 → 28 Feb. */
export const addMonthsToDay = (day: string, months: number): string => {
  const from = toUtc(day)
  const target = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, 1)
  )
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate()
  target.setUTCDate(Math.min(from.getUTCDate(), lastDay))
  return toDay(target)
}

export const addDaysToDay = (day: string, days: number): string =>
  toDay(new Date(toUtc(day).getTime() + days * DAY_MS))

/** Whole days from one day to another; negative when `to` is earlier. */
export const daysBetween = (from: string, to: string): number =>
  Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / DAY_MS)

/**
 * A contract's length in whole months, or null when it isn't a whole
 * number of them (1 Jan to 15 Mar).
 */
export const termMonths = (
  startsOn: string,
  renewsOn: string
): number | null => {
  const from = toUtc(startsOn)
  const to = toUtc(renewsOn)
  const months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth())
  return months > 0 && addMonthsToDay(startsOn, months) === renewsOn
    ? months
    : null
}
