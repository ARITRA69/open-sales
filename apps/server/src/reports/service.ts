import type {
  TForecastGroup,
  TForecastQuery,
  TForecastReport,
  TForecastTotal,
  TMoneyTotal,
  TPipelineReport,
  TReportDeal,
  TReportQuery,
  TReportRange,
  TWonLostReport
} from '@open-sales/shared'
import {
  canSeeForecast,
  dayAfter,
  monthsInRange,
  REPORT_DEALS_LIMIT,
  resolveForecastRange,
  resolveReportPeriod
} from '@open-sales/shared'
import type { SQL } from 'drizzle-orm'
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  isNull,
  lt,
  or,
  sql
} from 'drizzle-orm'

import type { TDatabase } from '../db/client'
import {
  company,
  deal,
  lostReason,
  pipeline,
  stage,
  user,
  workspace
} from '../db/schema'
import type { TActor } from '../records/common'
import {
  isoOrNull,
  NotAllowedError,
  RecordNotFoundError
} from '../records/common'

/*
 * Reports only read. Each query below is written for one of the indexes in
 * docs/data-model.md, named beside it. Two things keep those indexes usable:
 * `status` is written into the SQL rather than sent as a value, so Postgres
 * can match the partial indexes, and period edges are worked out once, not
 * per row.
 */

const IS_OPEN = sql`${deal.status} = 'open'`
const IS_CLOSED = sql`${deal.status} in ('won', 'lost')`

/** Midnight at the start of a day ("2026-11-01") where the team is. */
const startOfDay = (day: string, timeZone: string) =>
  sql`(${day}::timestamp at time zone ${timeZone})`

/** Sums come back from Postgres as text. */
const toNumber = (value: string | number | null) => Number(value ?? 0)

/** The workspace's currency first, then A to Z. */
const byCurrency =
  (first: string) =>
  <TTotal extends { currency: string }>(a: TTotal, b: TTotal) =>
    a.currency === first
      ? -1
      : b.currency === first
        ? 1
        : a.currency.localeCompare(b.currency)

type TDealJoined = {
  row: typeof deal.$inferSelect
  companyName: string
  ownerName: string
  stageName: string
  winProbability: number
}

const toReportDeal = ({
  row,
  companyName,
  ownerName,
  stageName,
  winProbability
}: TDealJoined): TReportDeal => ({
  id: row.id,
  name: row.name,
  companyName,
  ownerName,
  stage: { id: row.stageId, name: stageName, winProbability },
  status: row.status,
  valueMinor: row.valueMinor,
  currency: row.currency,
  closeDate: row.closeDate,
  closedAt: isoOrNull(row.closedAt),
  lostReasonId: row.lostReasonId
})

export const createReportsService = (db: TDatabase) => {
  /** What every report starts from: the pipeline, the currency, the days. */
  const readSettings = async (rangeFrom: (today: string) => TReportRange) => {
    const [[settings], [found]] = await Promise.all([
      db
        .select({ currency: workspace.currency, timeZone: workspace.timeZone })
        .from(workspace)
        .limit(1),
      db
        .select({ id: pipeline.id })
        .from(pipeline)
        .where(eq(pipeline.isDefault, true))
    ])
    if (!found) throw new RecordNotFoundError('pipeline')
    const { currency, timeZone } = settings ?? {
      currency: 'USD',
      timeZone: 'UTC'
    }
    // en-CA writes dates as 2026-11-30.
    const today = new Intl.DateTimeFormat('en-CA', { timeZone }).format(
      new Date()
    )
    const range = rangeFrom(today)
    return {
      pipelineId: found.id,
      currency,
      timeZone,
      range,
      // The first moment of the period, and the first moment after it.
      startsAt: startOfDay(range.from, timeZone),
      endsAt: startOfDay(dayAfter(range.to), timeZone)
    }
  }

  /** The deals behind a report, one more than the cap to see if it's hit. */
  const listDeals = async (where: SQL | undefined, order: SQL[]) => {
    const rows = await db
      .select({
        row: deal,
        companyName: company.name,
        ownerName: user.name,
        stageName: stage.name,
        winProbability: stage.winProbability
      })
      .from(deal)
      .innerJoin(company, eq(company.id, deal.companyId))
      .innerJoin(user, eq(user.id, deal.ownerId))
      .innerJoin(stage, eq(stage.id, deal.stageId))
      .where(where)
      .orderBy(...order, asc(deal.id))
      .limit(REPORT_DEALS_LIMIT + 1)
    return {
      deals: rows.slice(0, REPORT_DEALS_LIMIT).map(toReportDeal),
      dealsTruncated: rows.length > REPORT_DEALS_LIMIT
    }
  }

  const ownedBy = (ownerId: string | undefined) =>
    ownerId ? eq(deal.ownerId, ownerId) : undefined

  return {
    /**
     * Open deals by stage as they stand now, and of the deals that entered
     * each stage during the period, how many have since moved further along.
     */
    pipeline: async (
      _me: TActor,
      query: TReportQuery
    ): Promise<TPipelineReport> => {
      const settings = await readSettings((today) =>
        resolveReportPeriod(query.period, today)
      )
      // deal_board_idx, or deal_owner_status_idx for one person's deals.
      const isOpenHere = and(
        eq(deal.pipelineId, settings.pipelineId),
        IS_OPEN,
        isNull(deal.archivedAt),
        ownedBy(query.ownerId)
      )
      const ownerFilter = query.ownerId
        ? sql`and d.owner_id = ${query.ownerId}`
        : sql``

      const [stages, open, moves, listed] = await Promise.all([
        db
          .select({
            id: stage.id,
            name: stage.name,
            winProbability: stage.winProbability
          })
          .from(stage)
          .where(
            and(
              eq(stage.pipelineId, settings.pipelineId),
              eq(stage.kind, 'open'),
              isNull(stage.archivedAt)
            )
          )
          .orderBy(asc(stage.position)),
        db
          .select({
            stageId: deal.stageId,
            currency: deal.currency,
            count: count(),
            valueMinor: sql<string>`coalesce(sum(${deal.valueMinor}), 0)`
          })
          .from(deal)
          .where(isOpenHere)
          .groupBy(deal.stageId, deal.currency),
        /*
         * `entered`: each deal's first move into each open stage during the
         * period (deal_stage_change_to_idx: to_stage_id, changed_at). The
         * stages are handed over as a list, so Postgres reads that index
         * rather than every move. A deal has moved on if a later move took
         * it to a stage further along that isn't Lost
         * (deal_stage_change_deal_idx: deal_id, changed_at).
         */
        db.execute<{ stage_id: string; entered: number; moved_on: number }>(sql`
          with entered as (
            select c.to_stage_id as stage_id, c.deal_id,
              min(c.changed_at) as entered_at
            from deal_stage_change c
            where c.to_stage_id = any(array(
                select id from stage
                where pipeline_id = ${settings.pipelineId}
                  and kind = 'open'
                  and archived_at is null
              ))
              and c.changed_at >= ${settings.startsAt}
              and c.changed_at < ${settings.endsAt}
            group by c.to_stage_id, c.deal_id
          )
          select e.stage_id,
            count(*)::int as entered,
            (count(*) filter (where exists (
              select 1
              from deal_stage_change next
              join stage later on later.id = next.to_stage_id
              where next.deal_id = e.deal_id
                and next.changed_at >= e.entered_at
                and later.kind <> 'lost'
                and later.position > here.position
            )))::int as moved_on
          from entered e
          join stage here on here.id = e.stage_id
          join deal d on d.id = e.deal_id
          where d.archived_at is null ${ownerFilter}
          group by e.stage_id
        `),
        listDeals(isOpenHere, [sql`${deal.valueMinor} desc nulls last`])
      ])

      return {
        range: settings.range,
        currency: settings.currency,
        ...listed,
        stages: stages.map((row) => {
          const totals = open.filter((total) => total.stageId === row.id)
          const moved = moves.find((move) => move.stage_id === row.id)
          const entered = moved?.entered ?? 0
          const movedOn = moved?.moved_on ?? 0
          return {
            stageId: row.id,
            name: row.name,
            winProbability: row.winProbability,
            openCount: totals.reduce((sum, total) => sum + total.count, 0),
            openTotals: totals
              .map(
                (total): TMoneyTotal => ({
                  currency: total.currency,
                  valueMinor: toNumber(total.valueMinor)
                })
              )
              .sort(byCurrency(settings.currency)),
            entered,
            movedOn,
            conversion: entered > 0 ? movedOn / entered : null
          }
        })
      }
    },

    /** Deals closed during the period: revenue won, win rate, lost reasons. */
    wonLost: async (
      _me: TActor,
      query: TReportQuery
    ): Promise<TWonLostReport> => {
      const settings = await readSettings((today) =>
        resolveReportPeriod(query.period, today)
      )
      // deal_closed_at_idx: closed_at, where status is won or lost.
      const closedInPeriod = and(
        IS_CLOSED,
        gte(deal.closedAt, settings.startsAt),
        lt(deal.closedAt, settings.endsAt),
        isNull(deal.archivedAt),
        eq(deal.pipelineId, settings.pipelineId),
        ownedBy(query.ownerId)
      )

      const [groups, reasons, listed] = await Promise.all([
        db
          .select({
            status: deal.status,
            lostReasonId: deal.lostReasonId,
            currency: deal.currency,
            count: count(),
            valueMinor: sql<string>`coalesce(sum(${deal.valueMinor}), 0)`
          })
          .from(deal)
          .where(closedInPeriod)
          .groupBy(deal.status, deal.lostReasonId, deal.currency),
        // Archived reasons too: old deals still carry them.
        db
          .select({
            id: lostReason.id,
            label: lostReason.label,
            position: lostReason.position
          })
          .from(lostReason)
          .orderBy(asc(lostReason.position)),
        listDeals(closedInPeriod, [desc(deal.closedAt)])
      ])

      const summarise = (rows: typeof groups) => {
        const totals = new Map<string, number>()
        for (const row of rows) {
          totals.set(
            row.currency,
            (totals.get(row.currency) ?? 0) + toNumber(row.valueMinor)
          )
        }
        return {
          count: rows.reduce((sum, row) => sum + row.count, 0),
          totals: [...totals]
            .map(([currency, valueMinor]) => ({ currency, valueMinor }))
            .sort(byCurrency(settings.currency))
        }
      }

      const won = summarise(groups.filter((row) => row.status === 'won'))
      const lostRows = groups.filter((row) => row.status === 'lost')
      const lost = summarise(lostRows)
      const closed = won.count + lost.count
      const reasonIds = [...new Set(lostRows.map((row) => row.lostReasonId))]

      return {
        range: settings.range,
        currency: settings.currency,
        ...listed,
        won,
        lost,
        winRate: closed > 0 ? won.count / closed : null,
        reasons: reasonIds
          .map((reasonId) => ({
            reasonId,
            label:
              reasons.find((reason) => reason.id === reasonId)?.label ??
              'No reason given',
            position:
              reasons.find((reason) => reason.id === reasonId)?.position ??
              Number.MAX_SAFE_INTEGER,
            ...summarise(
              lostRows.filter((row) => row.lostReasonId === reasonId)
            )
          }))
          .sort((a, b) => b.count - a.count || a.position - b.position)
          .map(({ position: _position, ...reason }) => reason)
      }
    },

    /**
     * Open deals due to close from today to the period's end, by month,
     * weighted by their stage's win probability. Deals whose close date
     * has passed are counted apart. Managers and admins only.
     */
    forecast: async (
      me: TActor,
      query: TForecastQuery
    ): Promise<TForecastReport> => {
      if (!canSeeForecast(me.role)) {
        throw new NotAllowedError('Only managers and admins see the forecast.')
      }
      const settings = await readSettings((today) =>
        resolveForecastRange(query.period, today)
      )
      const { range } = settings
      const until = dayAfter(range.to)
      // deal_close_date_idx: close_date, where open and not archived; or
      // deal_owner_status_idx (owner_id, status, close_date) for one person.
      const isOpenHere = and(
        eq(deal.pipelineId, settings.pipelineId),
        IS_OPEN,
        isNull(deal.archivedAt),
        ownedBy(query.ownerId)
      )
      const inRange = and(
        gte(deal.closeDate, range.from),
        lt(deal.closeDate, until)
      )
      const isOverdue = lt(deal.closeDate, range.from)
      const isUndated = isNull(deal.closeDate)

      const sums = {
        currency: deal.currency,
        count: count(),
        valueMinor: sql<string>`coalesce(sum(${deal.valueMinor}), 0)`,
        // Whole minor units: half a cent rounds up.
        weightedMinor: sql<string>`coalesce(round(sum(${deal.valueMinor} * ${stage.winProbability} / 100.0)), 0)`
      }
      const summed = (where: SQL | undefined) =>
        db
          .select(sums)
          .from(deal)
          .innerJoin(stage, eq(stage.id, deal.stageId))
          .where(and(isOpenHere, where))
          .groupBy(deal.currency)
      const month = sql<string>`to_char(${deal.closeDate}, 'YYYY-MM')`

      const [byMonth, overdue, undated, listed] = await Promise.all([
        db
          .select({ month, ...sums })
          .from(deal)
          .innerJoin(stage, eq(stage.id, deal.stageId))
          .where(and(isOpenHere, inRange))
          .groupBy(month, deal.currency),
        summed(isOverdue),
        summed(isUndated),
        listDeals(and(isOpenHere, or(lt(deal.closeDate, until), isUndated)), [
          sql`${deal.closeDate} asc nulls last`
        ])
      ])

      const toGroup = (
        rows: {
          currency: string
          count: number
          valueMinor: string
          weightedMinor: string
        }[]
      ): TForecastGroup => ({
        count: rows.reduce((sum, row) => sum + row.count, 0),
        totals: rows
          .map(
            (row): TForecastTotal => ({
              currency: row.currency,
              valueMinor: toNumber(row.valueMinor),
              weightedMinor: toNumber(row.weightedMinor)
            })
          )
          .sort(byCurrency(settings.currency))
      })

      return {
        range,
        currency: settings.currency,
        ...listed,
        months: monthsInRange(range).map((name) => ({
          month: name,
          ...toGroup(byMonth.filter((row) => row.month === name))
        })),
        overdue: toGroup(overdue),
        undated: toGroup(undated)
      }
    }
  }
}

export type TReportsService = ReturnType<typeof createReportsService>
