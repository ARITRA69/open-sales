import { useState } from 'react'

import type { TPipelineReport, TReportPeriod } from '@open-sales/shared'
import { REPORT_PERIOD_LABELS } from '@open-sales/shared'

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
import { CurrencyNote, ReportCard } from './report-card'
import { NoDeals, ReportFrame } from './report-frame'
import type { TReportsBridge } from './reports-bridge'
import { useReport } from './use-report'

export type TReportProps<TPeriod> = {
  bridge: TReportsBridge
  period: TPeriod
  // Null for everyone.
  ownerId: string | null
  ownerName: string
  // Drops the owner filter, from an empty state.
  onShowEveryone: () => void
}

type TBodyProps = Omit<TReportProps<TReportPeriod>, 'bridge'> & {
  data: TPipelineReport
}

const ALL_STAGES = ''

const PipelineBody = ({
  data,
  period,
  ownerId,
  ownerName,
  onShowEveryone
}: TBodyProps) => {
  const [pickedCurrency, setPickedCurrency] = useState<string | null>(null)
  const [stageId, setStageId] = useState(ALL_STAGES)

  const { stages } = data
  const currencies = currenciesIn(
    stages.flatMap((stage) => stage.openTotals),
    data.currency
  )
  const currency =
    pickedCurrency && currencies.includes(pickedCurrency)
      ? pickedCurrency
      : (currencies[0] ?? data.currency)
  const rangeLabel = formatRange(data.range)
  const periodLabel = REPORT_PERIOD_LABELS[period]
  const whose = ownerId ? `${ownerName}’s` : 'everyone’s'

  if (stages.every((stage) => stage.openCount === 0 && stage.entered === 0)) {
    return (
      <NoDeals
        action={ownerId ? 'Show everyone’s deals' : undefined}
        body={
          ownerId
            ? `${ownerName} has no open deals, and none of theirs changed stage between ${rangeLabel}.`
            : `There are no open deals, and none changed stage between ${rangeLabel}. Deals you add on the Pipeline page show here by stage.`
        }
        title="No deals in the pipeline"
        onAction={onShowEveryone}
      />
    )
  }

  const openCount = stages.reduce((sum, stage) => sum + stage.openCount, 0)
  const maxValue = Math.max(
    0,
    ...stages.map((stage) => amountIn(stage.openTotals, currency))
  )
  const maxCount = Math.max(0, ...stages.map((stage) => stage.openCount))
  const allTotals = currencies.map((code) => ({
    currency: code,
    valueMinor: stages.reduce(
      (sum, stage) => sum + amountIn(stage.openTotals, code),
      0
    )
  }))
  const shownDeals =
    stageId === ALL_STAGES
      ? data.deals
      : data.deals.filter((deal) => deal.stage.id === stageId)

  return (
    <>
      <CurrencyNote
        currencies={currencies}
        currency={currency}
        onCurrencyChange={setPickedCurrency}
      />
      <ReportCard
        note={`What’s open now in ${whose} pipeline. “Moved on” follows the deals that entered each stage between ${rangeLabel}.`}
        title="Open deals by stage"
        onAsk={() =>
          askAboutReport({
            report: 'pipeline',
            chart: 'Pipeline by stage',
            periodId: period,
            periodLabel,
            rangeLabel,
            ownerId,
            ownerName
          })
        }
      >
        <BarChart
          bars={stages.map((stage) => {
            const amount = amountIn(stage.openTotals, currency)
            return {
              key: stage.stageId,
              label: stage.name,
              // By value; by number of deals when none has a value yet.
              share:
                maxValue > 0
                  ? amount / maxValue
                  : maxCount > 0
                    ? stage.openCount / maxCount
                    : 0,
              value: countOf(stage.openCount),
              detail: amount > 0 ? formatMoney(amount, currency) : undefined,
              note:
                stage.entered === 0
                  ? 'No deals entered this stage in the period'
                  : `${formatShare(stage.conversion)} moved on: ${stage.movedOn} of ${countOf(stage.entered)} that entered`
            }
          })}
          label="Open deals by stage"
        />
        <Table
          columns={[
            {
              key: 'stage',
              label: 'Stage',
              type: 'strong',
              width: 'minmax(0, 1.4fr)'
            },
            {
              key: 'chance',
              label: 'Win chance',
              type: 'muted',
              align: 'right'
            },
            { key: 'open', label: 'Open deals', align: 'right' },
            {
              key: 'value',
              label: 'Open value',
              align: 'right',
              width: 'minmax(0, 1.6fr)'
            },
            { key: 'entered', label: 'Entered', align: 'right' },
            { key: 'movedOn', label: 'Moved on', align: 'right' },
            { key: 'conversion', label: 'Conversion', align: 'right' }
          ]}
          density="compact"
          label="Pipeline by stage, in numbers"
          rows={[
            ...stages.map((stage) => ({
              id: stage.stageId,
              stage: stage.name,
              chance: `${stage.winProbability}%`,
              open: stage.openCount.toLocaleString(),
              value: formatTotals(stage.openTotals),
              entered: stage.entered.toLocaleString(),
              movedOn: stage.movedOn.toLocaleString(),
              conversion: formatShare(stage.conversion)
            })),
            {
              id: 'all',
              stage: 'All stages',
              chance: '',
              open: openCount.toLocaleString(),
              value: formatTotals(allTotals),
              entered: '',
              movedOn: '',
              conversion: ''
            }
          ]}
          selectable={false}
        />
      </ReportCard>
      <DealsTable
        columns={['stage', 'value', 'closeDate']}
        deals={shownDeals}
        filter={{
          label: 'Stage',
          options: [
            { label: 'All stages', value: ALL_STAGES },
            ...stages.map((stage) => ({
              label: stage.name,
              value: stage.stageId
            }))
          ],
          value: stageId,
          onChange: setStageId
        }}
        isTruncated={data.dealsTruncated}
        title="Open deals"
      />
    </>
  )
}

/**
 * Pipeline by stage: how many deals, and how much, sit in each stage now,
 * and how deals that entered a stage during the period moved on.
 */
export const PipelineReport = ({
  bridge,
  ...props
}: TReportProps<TReportPeriod>) => {
  const report = useReport(bridge, 'pipeline', {
    period: props.period,
    ownerId: props.ownerId ?? undefined
  })

  return (
    <ReportFrame report={report}>
      {(data) => <PipelineBody data={data} {...props} />}
    </ReportFrame>
  )
}
