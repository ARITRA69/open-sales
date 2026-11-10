import type {
  TForecastGroup,
  TForecastQueryInput,
  TForecastReport,
  TMoneyTotal,
  TPipelineReport,
  TReportDeal,
  TReportQueryInput,
  TReportRange,
  TWonLostReport
} from '@open-sales/shared'
import {
  monthsInRange,
  resolveForecastRange,
  resolveReportPeriod
} from '@open-sales/shared'

import type {
  TApiResult,
  TOpenSalesBridge
} from '../../../preload/bridge-types'
import { toIsoDay } from './dates'

/*
 * Pretend reports for the browser preview (`?preview=signed-in#/reports`).
 * The numbers are worked out from the deals below the way the server works
 * them out from its tables, so the filters change them. The open deals are
 * the ones on the preview's Pipeline board.
 */

const CURRENCY = 'USD'

const OWNERS: Record<string, string> = {
  preview: 'Asha Menon',
  dan: 'Dan Okafor',
  lena: 'Lena Ortiz'
}

const STAGES = [
  { id: 'qualified', name: 'Qualified', kind: 'open', winProbability: 10 },
  { id: 'discovery', name: 'Discovery', kind: 'open', winProbability: 25 },
  { id: 'proposal', name: 'Proposal', kind: 'open', winProbability: 50 },
  { id: 'negotiation', name: 'Negotiation', kind: 'open', winProbability: 75 },
  { id: 'won', name: 'Won', kind: 'won', winProbability: 100 },
  { id: 'lost', name: 'Lost', kind: 'lost', winProbability: 0 }
] as const

type TStageId = (typeof STAGES)[number]['id']

const LOST_REASONS: Record<string, string> = {
  price: 'Price',
  competitor: 'Chose a competitor',
  timing: 'Bad timing'
}

type TPretendDeal = {
  id: string
  name: string
  companyName: string
  ownerId: string
  valueMinor: number | null
  currency: string
  // Every move, oldest first: the stage it went to, and how many days ago.
  moves: [TStageId, number][]
  // Days from today to its close date, for open deals. Null for none.
  closesIn: number | null
  lostReasonId: string | null
}

const open = (
  id: string,
  name: string,
  companyName: string,
  ownerId: string,
  valueMinor: number | null,
  closesIn: number | null,
  moves: [TStageId, number][]
): TPretendDeal => ({
  id,
  name,
  companyName,
  ownerId,
  valueMinor,
  currency: CURRENCY,
  moves,
  closesIn,
  lostReasonId: null
})

/** A closed deal: it climbed to `reached`, a stage every 12 days, then closed. */
const closed = (
  id: string,
  name: string,
  companyName: string,
  ownerId: string,
  valueMinor: number,
  closedDaysAgo: number,
  outcome: 'won' | 'lost',
  reached: TStageId,
  lostReasonId: string | null = null,
  currency = CURRENCY
): TPretendDeal => {
  const climbed = STAGES.slice(
    0,
    STAGES.findIndex((stage) => stage.id === reached) + 1
  )
  return {
    id,
    name,
    companyName,
    ownerId,
    valueMinor,
    currency,
    moves: [
      ...climbed.map((stage, index): [TStageId, number] => [
        stage.id,
        closedDaysAgo + (climbed.length - index) * 12
      ]),
      [outcome, closedDaysAgo]
    ],
    closesIn: null,
    lostReasonId
  }
}

const DEALS: TPretendDeal[] = [
  open('d1', 'Platform rollout', 'Halden Capital', 'preview', 4_800_000, 18, [
    ['qualified', 40],
    ['discovery', 30],
    ['proposal', 16]
  ]),
  open('d2', 'Analytics add-on', 'Halden Capital', 'preview', 1_200_000, 55, [
    ['qualified', 3]
  ]),
  open('d3', 'Store pilot', 'Lumen Retail', 'dan', 2_500_000, -6, [
    ['qualified', 20],
    ['discovery', 8]
  ]),
  open('d4', 'Fleet tracking', 'Northwind Freight', 'lena', 9_000_000, 9, [
    ['qualified', 45],
    ['discovery', 33],
    ['proposal', 20],
    ['negotiation', 5]
  ]),
  open('d5', 'Clinic scheduling', 'Orbit Health', 'preview', null, null, [
    ['qualified', 20]
  ]),
  open('d6', 'District licence', 'Pinecrest Schools', 'dan', 1_800_000, 75, [
    ['qualified', 9],
    ['discovery', 2]
  ]),
  closed(
    'c1',
    'Headquarters rollout',
    'Halden Capital',
    'preview',
    6_400_000,
    12,
    'won',
    'negotiation'
  ),
  closed(
    'c2',
    'Regional stores',
    'Lumen Retail',
    'dan',
    3_800_000,
    30,
    'won',
    'negotiation'
  ),
  closed(
    'c3',
    'Depot sensors',
    'Northwind Freight',
    'lena',
    2_200_000,
    48,
    'won',
    'proposal',
    null,
    'EUR'
  ),
  closed(
    'c4',
    'Staff rota',
    'Orbit Health',
    'preview',
    1_500_000,
    75,
    'won',
    'negotiation'
  ),
  closed(
    'c5',
    'Campus Wi-Fi audit',
    'Pinecrest Schools',
    'dan',
    950_000,
    110,
    'won',
    'proposal'
  ),
  closed(
    'c6',
    'Yard management',
    'Northwind Freight',
    'lena',
    4_100_000,
    160,
    'won',
    'negotiation'
  ),
  closed(
    'c7',
    'Treasury reporting',
    'Halden Capital',
    'preview',
    2_700_000,
    230,
    'won',
    'negotiation'
  ),
  closed(
    'c8',
    'Loyalty app',
    'Lumen Retail',
    'dan',
    3_000_000,
    8,
    'lost',
    'proposal',
    'price'
  ),
  closed(
    'c9',
    'Route planning',
    'Northwind Freight',
    'lena',
    1_800_000,
    22,
    'lost',
    'negotiation',
    'competitor'
  ),
  closed(
    'c10',
    'Patient portal',
    'Orbit Health',
    'preview',
    5_200_000,
    35,
    'lost',
    'proposal',
    'price'
  ),
  closed(
    'c11',
    'Library system',
    'Pinecrest Schools',
    'dan',
    1_200_000,
    60,
    'lost',
    'discovery',
    'timing'
  ),
  closed(
    'c12',
    'Risk dashboard',
    'Halden Capital',
    'preview',
    2_400_000,
    95,
    'lost',
    'proposal',
    'competitor'
  ),
  closed(
    'c13',
    'Returns desk',
    'Lumen Retail',
    'dan',
    800_000,
    140,
    'lost',
    'qualified',
    'price'
  ),
  closed(
    'c14',
    'Cold chain',
    'Northwind Freight',
    'lena',
    3_300_000,
    200,
    'lost',
    'discovery',
    'timing'
  )
]

const DAY_MS = 24 * 60 * 60 * 1000

/** The local day a number of days from now, as "2026-11-30". */
const dayFromNow = (days: number) =>
  toIsoDay(new Date(Date.now() + days * DAY_MS))

const stageOf = (id: TStageId) =>
  STAGES.find((stage) => stage.id === id) ?? STAGES[0]
const positionOf = (id: TStageId) =>
  STAGES.findIndex((stage) => stage.id === id)

const lastMove = (deal: TPretendDeal) => deal.moves[deal.moves.length - 1]
const statusOf = (deal: TPretendDeal) => stageOf(lastMove(deal)[0]).kind
const closeDateOf = (deal: TPretendDeal) =>
  statusOf(deal) === 'open'
    ? deal.closesIn === null
      ? null
      : dayFromNow(deal.closesIn)
    : dayFromNow(-lastMove(deal)[1])

const isWithin = (day: string, range: TReportRange) =>
  day >= range.from && day <= range.to

const toReportDeal = (deal: TPretendDeal): TReportDeal => {
  const stage = stageOf(lastMove(deal)[0])
  return {
    id: deal.id,
    name: deal.name,
    companyName: deal.companyName,
    ownerName: OWNERS[deal.ownerId] ?? 'Someone',
    stage: {
      id: stage.id,
      name: stage.name,
      winProbability: stage.winProbability
    },
    status: stage.kind,
    valueMinor: deal.valueMinor,
    currency: deal.currency,
    closeDate: closeDateOf(deal),
    closedAt:
      stage.kind === 'open'
        ? null
        : new Date(Date.now() - lastMove(deal)[1] * DAY_MS).toISOString(),
    lostReasonId: deal.lostReasonId
  }
}

/** One total per currency, the workspace's first. */
const totalsOf = (deals: TPretendDeal[]): TMoneyTotal[] => {
  const totals = new Map<string, number>()
  for (const deal of deals) {
    if (deal.valueMinor === null) continue
    totals.set(
      deal.currency,
      (totals.get(deal.currency) ?? 0) + deal.valueMinor
    )
  }
  return [...totals]
    .map(([currency, valueMinor]) => ({ currency, valueMinor }))
    .sort((a, b) =>
      a.currency === CURRENCY ? -1 : b.currency === CURRENCY ? 1 : 0
    )
}

const groupOf = (deals: TPretendDeal[]) => ({
  count: deals.length,
  totals: totalsOf(deals)
})

const forecastGroupOf = (deals: TPretendDeal[]): TForecastGroup => ({
  count: deals.length,
  totals: totalsOf(deals).map((total) => ({
    ...total,
    weightedMinor: Math.round(
      deals
        .filter((deal) => deal.currency === total.currency)
        .reduce(
          (sum, deal) =>
            sum +
            ((deal.valueMinor ?? 0) *
              stageOf(lastMove(deal)[0]).winProbability) /
              100,
          0
        )
    )
  }))
})

const pause = () => new Promise((resolve) => setTimeout(resolve, 300))

const ok = async <TData>(data: TData): Promise<TApiResult<TData>> => {
  await pause()
  return { ok: true, data }
}

const ownedBy = (ownerId: string | undefined) => (deal: TPretendDeal) =>
  !ownerId || deal.ownerId === ownerId

const pipelineReport = (query: TReportQueryInput = {}): TPipelineReport => {
  const range = resolveReportPeriod(
    query.period ?? 'this_quarter',
    dayFromNow(0)
  )
  const deals = DEALS.filter(ownedBy(query.ownerId))
  const openDeals = deals.filter((deal) => statusOf(deal) === 'open')

  return {
    range,
    currency: CURRENCY,
    deals: [...openDeals]
      .sort((a, b) => (b.valueMinor ?? -1) - (a.valueMinor ?? -1))
      .map(toReportDeal),
    dealsTruncated: false,
    stages: STAGES.filter((stage) => stage.kind === 'open').map((stage) => {
      const here = openDeals.filter((deal) => lastMove(deal)[0] === stage.id)
      // The first move into this stage during the period, if there was one.
      const entered = deals
        .map((deal) => ({
          deal,
          at: deal.moves.findIndex(
            ([to, daysAgo]) =>
              to === stage.id && isWithin(dayFromNow(-daysAgo), range)
          )
        }))
        .filter(({ at }) => at >= 0)
      const movedOn = entered.filter(({ deal, at }) =>
        deal.moves
          .slice(at + 1)
          .some(
            ([to]) => to !== 'lost' && positionOf(to) > positionOf(stage.id)
          )
      )
      return {
        stageId: stage.id,
        name: stage.name,
        winProbability: stage.winProbability,
        openCount: here.length,
        openTotals: totalsOf(here),
        entered: entered.length,
        movedOn: movedOn.length,
        conversion: entered.length > 0 ? movedOn.length / entered.length : null
      }
    })
  }
}

const wonLostReport = (query: TReportQueryInput = {}): TWonLostReport => {
  const range = resolveReportPeriod(
    query.period ?? 'this_quarter',
    dayFromNow(0)
  )
  const closedDeals = DEALS.filter(ownedBy(query.ownerId))
    .filter((deal) => statusOf(deal) !== 'open')
    .filter((deal) => isWithin(dayFromNow(-lastMove(deal)[1]), range))
    .sort((a, b) => lastMove(a)[1] - lastMove(b)[1])
  const won = closedDeals.filter((deal) => statusOf(deal) === 'won')
  const lost = closedDeals.filter((deal) => statusOf(deal) === 'lost')
  const reasonIds = [...new Set(lost.map((deal) => deal.lostReasonId))]

  return {
    range,
    currency: CURRENCY,
    deals: closedDeals.map(toReportDeal),
    dealsTruncated: false,
    won: groupOf(won),
    lost: groupOf(lost),
    winRate: closedDeals.length > 0 ? won.length / closedDeals.length : null,
    reasons: reasonIds
      .map((reasonId) => ({
        reasonId,
        label: (reasonId && LOST_REASONS[reasonId]) || 'No reason given',
        ...groupOf(lost.filter((deal) => deal.lostReasonId === reasonId))
      }))
      .sort((a, b) => b.count - a.count)
  }
}

const forecastReport = (query: TForecastQueryInput = {}): TForecastReport => {
  const range = resolveForecastRange(
    query.period ?? 'next_3_months',
    dayFromNow(0)
  )
  const openDeals = DEALS.filter(ownedBy(query.ownerId)).filter(
    (deal) => statusOf(deal) === 'open'
  )
  const dated = openDeals.map((deal) => ({ deal, day: closeDateOf(deal) }))
  const inMonth = (month: string) =>
    dated
      .filter(({ day }) => day !== null && isWithin(day, range))
      .filter(({ day }) => day?.startsWith(month))
      .map(({ deal }) => deal)

  return {
    range,
    currency: CURRENCY,
    deals: dated
      .filter(({ day }) => day === null || day <= range.to)
      .sort((a, b) => (a.day ?? '9').localeCompare(b.day ?? '9'))
      .map(({ deal }) => toReportDeal(deal)),
    dealsTruncated: false,
    months: monthsInRange(range).map((month) => ({
      month,
      ...forecastGroupOf(inMonth(month))
    })),
    overdue: forecastGroupOf(
      dated
        .filter(({ day }) => day !== null && day < range.from)
        .map(({ deal }) => deal)
    ),
    undated: forecastGroupOf(
      dated.filter(({ day }) => day === null).map(({ deal }) => deal)
    )
  }
}

/** The pretend reports bridge, or null outside the preview. */
export const createPreviewReports = (
  search: string
): TOpenSalesBridge['reports'] | null => {
  if (!new URLSearchParams(search).has('preview')) return null

  return {
    getPipeline: (query) => ok(pipelineReport(query)),
    getWonLost: (query) => ok(wonLostReport(query)),
    getForecast: (query) => ok(forecastReport(query))
  }
}
