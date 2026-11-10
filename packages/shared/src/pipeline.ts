import { z } from 'zod'

import { dealCreateSchema } from './records'

/*
 * What the Pipeline page adds to deals: the people on a new deal, and the
 * idle rule (in ./stalled, which Today reads too).
 */

export * from './stalled'

// Far more than a real buying committee; stops a runaway request.
const MAX_DEAL_PEOPLE = 50

/**
 * POST /api/v1/deals, with the people involved. They must work at the
 * deal's company.
 */
export const dealCreateWithPeopleSchema = dealCreateSchema.extend({
  personIds: z.array(z.string().min(1)).max(MAX_DEAL_PEOPLE).optional()
})

export type TDealCreateWithPeople = z.input<typeof dealCreateWithPeopleSchema>

export const DEAL_PERSON_ROLES = [
  'champion',
  'decision_maker',
  'evaluator',
  'blocker'
] as const

/** Someone on a deal, as its people list shows them. */
export const dealPersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string().nullable(),
  email: z.string().nullable(),
  // Their part in the decision, once someone says.
  role: z.enum(DEAL_PERSON_ROLES).nullable()
})

export type TDealPerson = z.infer<typeof dealPersonSchema>

/** GET /api/v1/deals/:id/people. Who's on the deal, A–Z. */
export const dealPeopleResponseSchema = z.object({
  people: z.array(dealPersonSchema)
})

export type TDealPeopleResponse = z.infer<typeof dealPeopleResponseSchema>
