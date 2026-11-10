import { useState } from 'react'

import type {
  TForecastGroup,
  TForecastPeriod,
  TForecastReport,
  TReportDeal
} from '@open-sales/shared'
import { REPORT_PERIOD_LABELS } from '@open-sales/shared'

import { StatTile } from '@/components/ui/kit'
import { Table } from '@/components/ui/table'
import { formatMoney } from '@/lib/money'

import { askAboutReport } from './ask-about'
import { BarChart, BarLegend } from './bar-chart'
import { DealsTable } from './deals-table'
import {
  amountIn,
  countOf,
  currenciesIn,
  formatMonth,
  formatRange,
  formatTotals
} from './format'
import type { TReportProps } from './pipeline-report'
import { CurrencyNote, ReportCard } from './report-card'
import { NoDeals, ReportFrame } from './report-frame'
import { useReport } from './use-report'

type TBodyProps = Omit<TReportProps<TForecastPeriod>, 'bridge'> & {
  data: TForecastReport
}

const OVERDUE = 'overdue'
const UNDATED = 'undated'

/** A group's weighted amounts, shaped like any other totals. */
const weightedTotals = (group: TForecastGroup) =>
  group.totals.map((total) => ({
    currency: total.currency,
    valueMinor: total.weightedMinor
  }))

const ForecastBody = ({
  data,
  period,
  ownerId,
  ownerName,
  onShowEveryone
}: TBodyProps) => {
  const [pickedCurrency, setPickedCurrency] = useState<string | null>(null)
  const [show, setShow] = useState('all')

  const { months, overdue, undated, range } = data
  const rangeLabel = formatRange(range)
  const periodLabel = REPORT_PERIOD_LABELS[period]
  const inPeriod = months.reduce((sum, month) => sum + month.count, 0)

  if (inPeriod + overdue.count + undated.count === 0) {
    return (
      <NoDeals
        action={ownerId ? 'Show everyone’s deals' : undefined}
        body={`${ownerId ? `${ownerName} has` : 'There are'} no open deals to forecast. An open deal with a close date counts towards the month it should close.`}
        title="Nothing to forecast"
        onAction={onShowEveryone}
      />
    )
  }

  const currencies = currenciesIn(
    [...months, overdue, undated].flatMap((group) => group.totals),
    data.currency
  )
  const currency =
    pickedCurrency && currencies.includes(pickedCurrency)
      ? pickedCurrency
      : (currencies[0] ?? data.currency)
  const weightedIn = (group: TForecastGroup) =>
    amountIn(weightedTotals(group), currency)
  const maxValue = Math.max(
    0,
    ...months.map((month) => amountIn(month.totals, currency))
  )
  // The period's months added up, one total per currency.
  const total: TForecastGroup = {
    count: inPeriod,
    totals: currencies
      .map((code) => ({
        currency: code,
        valueMinor: months.reduce(
          (sum, month) => sum + amountIn(month.totals, code),
          0
        ),
        weightedMinor: months.reduce(
          (sum, month) => sum + amountIn(weightedTotals(month), code),
          0
        )
      }))
      .filter((sum) => sum.valueMinor > 0 || sum.weightedMinor > 0)
  }

  const bucketOf = (deal: TReportDeal) =>
    deal.closeDate === null
      ? UNDATED
      : deal.closeDate < range.from
        ? OVERDUE
        : deal.closeDate.slice(0, 7)
  const shownDeals =
    show === 'all'
      ? data.deals
      : data.deals.filter((deal) => bucketOf(deal) === show)

  const toRow = (id: string, label: string, group: TForecastGroup) => ({
    id,
    month: label,
    deals: group.count.toLocaleString(),
    value: formatTotals(group.totals),
    weighted: formatTotals(weightedTotals(group))
  })

  return (
    <>
      <CurrencyNote
        currencies={currencies}
        currency={currency}
        onCurrencyChange={setPickedCurrency}
      />
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
        <StatTile
          label={
            currencies.length > 1
              ? `Weighted forecast (${currency})`
              : 'Weighted forecast'
          }
          value={formatMoney(weightedIn(total), currency)}
        />
        <StatTile
          label="Open value closing in the period"
          value={formatMoney(amountIn(total.totals, currency), currency)}
        />
        <StatTile
          label="Deals closing in the period"
          value={inPeriod.toLocaleString()}
        />
        <StatTile
          label="Open deals past their close date"
          value={overdue.count.toLocaleString()}
        />
      </div>
      <ReportCard
        note={`${ownerId ? `${ownerName}’s` : 'Everyone’s'} open deals due to close between ${rangeLabel}. Each deal counts for its value times its stage’s win chance.`}
        title="Forecast by close month"
        onAsk={() =>
          askAboutReport({
            report: 'forecast',
            chart: 'Forecast by close month',
            periodId: period,
            periodLabel,
            rangeLabel,
            ownerId,
            ownerName
          })
        }
      >
        <BarLegend
          items={[
            { label: 'Weighted by win chance', tone: 'front' },
            { label: 'Open value', tone: 'back' }
          ]}
        />
        <BarChart
          bars={months.map((month) => {
            const value = amountIn(month.totals, currency)
            return {
              key: month.month,
              label: formatMonth(month.month),
              share: maxValue > 0 ? weightedIn(month) / maxValue : 0,
              backShare: maxValue > 0 ? value / maxValue : 0,
              value:
                month.count > 0
                  ? formatMoney(weightedIn(month), currency)
                  : 'No deals',
              detail:
                month.count > 0
                  ? `of ${formatMoney(value, currency)} · ${countOf(month.count)}`
                  : undefined
            }
          })}
          label="Forecast by close month"
        />
        <Table
          columns={[
            {
              key: 'month',
              label: 'Close month',
              type: 'strong',
              width: 'minmax(0, 1.4fr)'
            },
            { key: 'deals', label: 'Deals', align: 'right' },
            {
              key: 'value',
              label: 'Open value',
              align: 'right',
              width: 'minmax(0, 1.6fr)'
            },
            {
              key: 'weighted',
              label: 'Weighted',
              align: 'right',
              width: 'minmax(0, 1.6fr)'
            }
          ]}
          density="compact"
          label="Forecast by close month, in numbers"
          rows={[
            ...months.map((month) =>
              toRow(month.month, formatMonth(month.month), month)
            ),
            toRow('total', 'Whole period', total),
            ...(overdue.count > 0
              ? [toRow(OVERDUE, 'Past their close date', overdue)]
              : []),
            ...(undated.count > 0
              ? [toRow(UNDATED, 'No close date', undated)]
              : [])
          ]}
          selectable={false}
        />
      </ReportCard>
      <DealsTable
        columns={['stage', 'closeDate', 'value', 'weighted']}
        deals={shownDeals}
        filter={{
          label: 'Closing',
          options: [
            { label: 'All of these', value: 'all' },
            ...months.map((month) => ({
              label: formatMonth(month.month),
              value: month.month
            })),
            { label: 'Past their close date', value: OVERDUE },
            { label: 'No close date', value: UNDATED }
          ],
          value: show,
          onChange: setShow
        }}
        isTruncated={data.dealsTruncated}
        title="Open deals behind the forecast"
      />
    </>
  )
}

/**
 * Forecast: expected revenue by close month, each open deal weighted by its
 * stage's win probability. The server keeps it for managers and admins.
 */
export const ForecastReport = ({
  bridge,
  ...props
}: TReportProps<TForecastPeriod>) => {
  const report = useReport(bridge, 'forecast', {
    period: props.period,
    ownerId: props.ownerId ?? undefined
  })

  return (
    <ReportFrame report={report}>
      {(data) => <ForecastBody data={data} {...props} />}
    </ReportFrame>
  )
}
