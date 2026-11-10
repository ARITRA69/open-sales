import { z } from 'zod'

import { DEAL_STATUSES } from './records'

/*
 * Reports: what GET /api/v1/reports/* takes and returns. They only read.
 *
 * Money is never converted: every total is a list with one entry per
 * currency, in minor units, the workspace's currency first. Counts cover
 * every currency. Period edges are whole days in the workspace's time zone.
 */

/** Looking back: the pipeline's conversion, and won and lost. */
export const REPORT_PERIODS = [
  'this_month',
  'last_month',
  'this_quarter',
  'last_quarter',
  'this_year',
  'last_12_months'
] as const

export type TReportPeriod = (typeof REPORT_PERIODS)[number]

/** Looking ahead: the forecast. Each starts with this month. */
export const FORECAST_PERIODS = [
  'this_quarter',
  'next_3_months',
  'next_6_months',
  'next_12_months'
] as const

export type TForecastPeriod = (typeof FORECAST_PERIODS)[number]

export const REPORT_PERIOD_LABELS: Record<
  TReportPeriod | TForecastPeriod,
  string
> = {
  this_month: 'This month',
  last_month: 'Last month',
  this_quarter: 'This quarter',
  last_quarter: 'Last quarter',
  this_year: 'This year',
  last_12_months: 'Last 12 months',
  next_3_months: 'Next 3 months',
  next_6_months: 'Next 6 months',
  next_12_months: 'Next 12 months'
}

const pad = (value: number) => String(value).padStart(2, '0')

// Days as UTC dates, so the sums never meet a clock change.
const toDay = (date: Date) =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
const dayAt = (year: number, month: number, day: number) =>
  toDay(new Date(Date.UTC(year, month, day)))

/** The day after "2026-11-30": where a period that ends then stops. */
export const dayAfter = (day: string): string => {
  const [year, month, date] = day.split('-').map(Number)
  return dayAt(year, month - 1, date + 1)
}

/**
 * The first and last day of a period, both included, given today's date
 * ("2026-11-10") where the team is.
 */
export const resolveReportPeriod = (
  period: TReportPeriod | TForecastPeriod,
  today: string
): TReportRange => {
  const [year, monthNumber, date] = today.split('-').map(Number)
  const month = monthNumber - 1
  const quarterStart = month - (month % 3)
  // Whole months: the first day of one to the last day of another.
  const months = (first: number, count: number) => ({
    from: dayAt(year, first, 1),
    to: dayAt(year, first + count, 0)
  })

  switch (period) {
    case 'this_month':
      return months(month, 1)
    case 'last_month':
      return months(month - 1, 1)
    case 'this_quarter':
      return months(quarterStart, 3)
    case 'last_quarter':
      return months(quarterStart - 3, 3)
    case 'this_year':
      return months(0, 12)
    case 'last_12_months':
      // A year ending today: 11 Nov 2025 to 10 Nov 2026.
      return { from: dayAt(year - 1, month, date + 1), to: today }
    case 'next_3_months':
      return months(month, 3)
    case 'next_6_months':
      return months(month, 6)
    case 'next_12_months':
      return months(month, 12)
  }
}

/** Every month a range touches, as "2026-11", in order. */
export const monthsInRange = ({ from, to }: TReportRange): string[] => {
  const [fromYear, fromMonth] = from.split('-').map(Number)
  const [toYear, toMonth] = to.split('-').map(Number)
  const count = (toYear - fromYear) * 12 + (toMonth - fromMonth) + 1
  return Array.from({ length: Math.max(0, count) }, (_, index) =>
    dayAt(fromYear, fromMonth - 1 + index, 1).slice(0, 7)
  )
}

// Everyone, unless one person is named.
const ownerIdField = z.string().trim().min(1).max(200).optional()

/** Query string for the pipeline and won-and-lost reports. */
export const reportQuerySchema = z.object({
  period: z.enum(REPORT_PERIODS).default('this_quarter'),
  ownerId: ownerIdField
})

export type TReportQuery = z.output<typeof reportQuerySchema>

export type TReportQueryInput = z.input<typeof reportQuerySchema>

/** Query string for the forecast. */
export const forecastQuerySchema = z.object({
  period: z.enum(FORECAST_PERIODS).default('next_3_months'),
  ownerId: ownerIdField
})

export type TForecastQuery = z.output<typeof forecastQuerySchema>

export type TForecastQueryInput = z.input<typeof forecastQuerySchema>

/** The days a report covers, both included, in the workspace's time zone. */
export const reportRangeSchema = z.object({
  from: z.string(),
  to: z.string()
})

export type TReportRange = z.infer<typeof reportRangeSchema>

/** One currency's share of a total. Totals are never added across currencies. */
export const moneyTotalSchema = z.object({
  currency: z.string(),
  valueMinor: z.number().int()
})

export type TMoneyTotal = z.infer<typeof moneyTotalSchema>

/** A deal behind a report's numbers: enough to list it and link to it. */
export const reportDealSchema = z.object({
  id: z.string(),
  name: z.string(),
  companyName: z.string(),
  ownerName: z.string(),
  stage: z.object({
    id: z.string(),
    name: z.string(),
    winProbability: z.number().int()
  }),
  status: z.enum(DEAL_STATUSES),
  valueMinor: z.number().int().nullable(),
  currency: z.string(),
  closeDate: z.string().nullable(),
  closedAt: z.string().nullable(),
  lostReasonId: z.string().nullable()
})

export type TReportDeal = z.infer<typeof reportDealSchema>

// What every report carries.
const reportFields = {
  range: reportRangeSchema,
  // The workspace's currency: listed first in every total.
  currency: z.string(),
  // The deals the numbers come from, capped at REPORT_DEALS_LIMIT.
  deals: z.array(reportDealSchema),
  // True when there were more deals than the cap.
  dealsTruncated: z.boolean()
}

/** How many deals a report lists at most. The totals always count them all. */
export const REPORT_DEALS_LIMIT = 500

/**
 * GET /api/v1/reports/pipeline. Open deals by stage as they stand now, and
 * how deals that entered each stage during the period moved on.
 */
export const pipelineReportSchema = z.object({
  ...reportFields,
  stages: z.array(
    z.object({
      stageId: z.string(),
      name: z.string(),
      winProbability: z.number().int(),
      // Open deals in the stage now.
      openCount: z.number().int(),
      openTotals: z.array(moneyTotalSchema),
      // Deals that came into the stage during the period.
      entered: z.number().int(),
      // Of those, the ones that have since moved further along (or won).
      movedOn: z.number().int(),
      // movedOn / entered, 0 to 1. Null when none entered.
      conversion: z.number().nullable()
    })
  )
})

export type TPipelineReport = z.infer<typeof pipelineReportSchema>

const closedGroupSchema = z.object({
  count: z.number().int(),
  totals: z.array(moneyTotalSchema)
})

/** GET /api/v1/reports/won-lost. Deals closed during the period. */
export const wonLostReportSchema = z.object({
  ...reportFields,
  won: closedGroupSchema,
  lost: closedGroupSchema,
  // won / (won + lost) by number of deals, 0 to 1. Null when none closed.
  winRate: z.number().nullable(),
  // Lost deals by reason, most common first.
  reasons: z.array(
    closedGroupSchema.extend({
      // Null for lost deals that carry no reason.
      reasonId: z.string().nullable(),
      label: z.string()
    })
  )
})

export type TWonLostReport = z.infer<typeof wonLostReportSchema>

const forecastTotalSchema = moneyTotalSchema.extend({
  // The value times each deal's stage win probability.
  weightedMinor: z.number().int()
})

export type TForecastTotal = z.infer<typeof forecastTotalSchema>

const forecastGroupSchema = z.object({
  count: z.number().int(),
  totals: z.array(forecastTotalSchema)
})

export type TForecastGroup = z.infer<typeof forecastGroupSchema>

/**
 * GET /api/v1/reports/forecast. Open deals by the month they should close,
 * weighted by their stage's win probability. Managers and admins only.
 */
export const forecastReportSchema = z.object({
  ...reportFields,
  // Every month of the period, including ones with no deals.
  months: z.array(forecastGroupSchema.extend({ month: z.string() })),
  // Open deals whose close date has already passed the period's start.
  overdue: forecastGroupSchema,
  // Open deals with no close date.
  undated: forecastGroupSchema
})

export type TForecastReport = z.infer<typeof forecastReportSchema>
