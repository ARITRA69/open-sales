import { useState } from 'react'

import type { TReportPeriod, TWonLostReport } from '@open-sales/shared'
import { REPORT_PERIOD_LABELS } from '@open-sales/shared'

import { StatTile } from '@/components/ui/kit'
import { Table } from '@/components/ui/table'
import { formatMoney } from '@/lib/money'

import { askAboutReport } from './ask-about'
import { BarChart } from './bar-chart'
import { DealsTable } from './deals-table'
import {
  amountIn,
  countOf,
  currenciesIn,
  formatRange,
  formatShare,
  formatTotals
} from './format'
import type { TReportProps } from './pipeline-report'
import { CurrencyNote, ReportCard } from './report-card'
import { NoDeals, ReportFrame } from './report-frame'
import { useReport } from './use-report'

type TBodyProps = Omit<TReportProps<TReportPeriod>, 'bridge'> & {
  data: TWonLostReport
  onPeriodChange: (period: TReportPeriod) => void
}

// Lost deals with no reason still need a filter value.
const NO_REASON = 'none'

const WonLostBody = ({
  data,
  period,
  ownerId,
  ownerName,
  onShowEveryone,
  onPeriodChange
}: TBodyProps) => {
  const [pickedCurrency, setPickedCurrency] = useState<string | null>(null)
  const [show, setShow] = useState('all')

  const { won, lost, reasons } = data
  const closed = won.count + lost.count
  const rangeLabel = formatRange(data.range)
  const periodLabel = REPORT_PERIOD_LABELS[period]
  const whose = ownerId ? `${ownerName}’s` : 'everyone’s'

  if (closed === 0) {
    const canWiden = period !== 'last_12_months'
    return (
      <NoDeals
        action={
          canWiden
            ? 'Show the last 12 months'
            : ownerId
              ? 'Show everyone’s deals'
              : undefined
        }
        body={`${ownerId ? `${ownerName} didn’t close any deals` : 'No deals were won or lost'} between ${rangeLabel}. Closing a deal on the Pipeline page adds it here.`}
        title="No deals closed in this period"
        onAction={
          canWiden ? () => onPeriodChange('last_12_months') : onShowEveryone
        }
      />
    )
  }

  const currencies = currenciesIn(
    [...won.totals, ...lost.totals],
    data.currency
  )
  const currency =
    pickedCurrency && currencies.includes(pickedCurrency)
      ? pickedCurrency
      : (currencies[0] ?? data.currency)
  const ask = (chart: string) => () =>
    askAboutReport({
      report: 'won-lost',
      chart,
      periodId: period,
      periodLabel,
      rangeLabel,
      ownerId,
      ownerName
    })

  const reasonLabels = Object.fromEntries(
    reasons
      .filter((reason) => reason.reasonId !== null)
      .map((reason) => [reason.reasonId, reason.label])
  )
  const shownDeals = data.deals.filter((deal) => {
    if (show === 'all') return true
    if (show === 'won' || show === 'lost') return deal.status === show
    return (
      deal.status === 'lost' &&
      (deal.lostReasonId ?? NO_REASON) === show.replace(/^reason:/, '')
    )
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
            currencies.length > 1 ? `Revenue won (${currency})` : 'Revenue won'
          }
          value={formatMoney(amountIn(won.totals, currency), currency)}
        />
        <StatTile
          label={`Win rate: ${won.count} of ${closed} closed`}
          value={formatShare(data.winRate)}
        />
        <StatTile label="Deals won" value={won.count.toLocaleString()} />
        <StatTile label="Deals lost" value={lost.count.toLocaleString()} />
      </div>
      <ReportCard
        note={`${whose === 'everyone’s' ? 'Everyone’s' : whose} deals closed between ${rangeLabel}. Win rate is deals won out of all deals closed.`}
        title="Won and lost"
        onAsk={ask('Won and lost')}
      >
        <BarChart
          bars={[
            { key: 'won', label: 'Won', group: won },
            { key: 'lost', label: 'Lost', group: lost }
          ].map(({ key, label, group }) => ({
            key,
            label,
            share: group.count / closed,
            value: countOf(group.count),
            detail:
              group.count > 0
                ? formatMoney(amountIn(group.totals, currency), currency)
                : undefined
          }))}
          label="Deals won and lost"
        />
        <Table
          columns={[
            { key: 'outcome', label: 'Outcome', type: 'strong' },
            { key: 'deals', label: 'Deals', align: 'right' },
            { key: 'share', label: 'Share of closed', align: 'right' },
            {
              key: 'value',
              label: 'Value',
              align: 'right',
              width: 'minmax(0, 1.6fr)'
            }
          ]}
          density="compact"
          label="Won and lost, in numbers"
          rows={[
            { id: 'won', outcome: 'Won', group: won },
            { id: 'lost', outcome: 'Lost', group: lost }
          ].map(({ id, outcome, group }) => ({
            id,
            outcome,
            deals: group.count.toLocaleString(),
            share: formatShare(group.count / closed),
            value: formatTotals(group.totals)
          }))}
          selectable={false}
        />
      </ReportCard>
      <ReportCard
        note={`The reason picked when each deal was closed as lost, between ${rangeLabel}.`}
        title="Why deals were lost"
        onAsk={ask('Why deals were lost')}
      >
        {lost.count === 0 ? (
          <p className="m-0 rounded-card bg-muted px-3 py-2.5 text-sm text-muted-foreground">
            No deals were lost in this period.
          </p>
        ) : (
          <>
            <BarChart
              bars={reasons.map((reason) => ({
                key: reason.reasonId ?? NO_REASON,
                label: reason.label,
                share: reason.count / lost.count,
                value: countOf(reason.count),
                detail: formatMoney(amountIn(reason.totals, currency), currency)
              }))}
              label="Lost deals by reason"
            />
            <Table
              columns={[
                {
                  key: 'reason',
                  label: 'Reason',
                  type: 'strong',
                  width: 'minmax(0, 1.4fr)'
                },
                { key: 'deals', label: 'Deals', align: 'right' },
                { key: 'share', label: 'Share of lost', align: 'right' },
                {
                  key: 'value',
                  label: 'Value lost',
                  align: 'right',
                  width: 'minmax(0, 1.6fr)'
                }
              ]}
              density="compact"
              label="Lost deals by reason, in numbers"
              rows={reasons.map((reason) => ({
                id: reason.reasonId ?? NO_REASON,
                reason: reason.label,
                deals: reason.count.toLocaleString(),
                share: formatShare(reason.count / lost.count),
                value: formatTotals(reason.totals)
              }))}
              selectable={false}
            />
          </>
        )}
      </ReportCard>
      <DealsTable
        columns={['outcome', 'reason', 'value', 'closedOn']}
        deals={shownDeals}
        filter={{
          label: 'Show',
          options: [
            { label: 'Won and lost', value: 'all' },
            { label: 'Won', value: 'won' },
            { label: 'Lost', value: 'lost' },
            ...reasons.map((reason) => ({
              label: `Lost: ${reason.label}`,
              value: `reason:${reason.reasonId ?? NO_REASON}`
            }))
          ],
          value: show,
          onChange: setShow
        }}
        isTruncated={data.dealsTruncated}
        reasonLabels={reasonLabels}
        title="Deals closed"
      />
    </>
  )
}

type TWonLostReportProps = TReportProps<TReportPeriod> & {
  onPeriodChange: (period: TReportPeriod) => void
}

/**
 * Won and lost: revenue won, the win rate, and why deals were lost, for the
 * deals closed during the period.
 */
export const WonLostReport = ({ bridge, ...props }: TWonLostReportProps) => {
  const report = useReport(bridge, 'won-lost', {
    period: props.period,
    ownerId: props.ownerId ?? undefined
  })

  return (
    <ReportFrame report={report}>
      {(data) => <WonLostBody data={data} {...props} />}
    </ReportFrame>
  )
}
