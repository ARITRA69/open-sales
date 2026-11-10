import { useState } from 'react'

import type {
  TForecastPeriod,
  TReportPeriod,
  TSessionUser
} from '@open-sales/shared'
import {
  canSeeForecast,
  FORECAST_PERIODS,
  REPORT_PERIOD_LABELS,
  REPORT_PERIODS
} from '@open-sales/shared'

import { PageBody } from '@/components/sales/app-shell'
import { PageHeader } from '@/components/ui/page-header'
import { PickPill } from '@/components/ui/pick-pill'
import { StatePanel } from '@/components/ui/state-panel'
import { Tabs } from '@/components/ui/tabs'
import { useHashPath } from '@/hooks/use-hash-route'
import type { TRecordsBridge } from '@/hooks/use-records'
import { useCall } from '@/hooks/use-records'

import { EmptyPage } from '../empty-page'
import { ForecastReport } from './forecast-report'
import { PipelineReport } from './pipeline-report'
import { REPORTS_BRIDGE, type TReportsBridge } from './reports-bridge'
import { WonLostReport } from './won-lost-report'

// Each report has its own address: #/reports/won-lost.
const SECTIONS = [
  { id: 'pipeline', label: 'Pipeline by stage' },
  { id: 'won-lost', label: 'Won and lost' },
  { id: 'forecast', label: 'Forecast' }
] as const

type TSectionId = (typeof SECTIONS)[number]['id']

const EVERYONE = ''

type TReportsPageProps = {
  me: TSessionUser
  // For the list of owners to filter by. Without it, the filter is
  // "Everyone" or "Me".
  recordsBridge?: TRecordsBridge | null
  // The reports themselves. Without it the page stays empty.
  bridge?: TReportsBridge | null
}

/**
 * Reports: pick one, filter it by period and owner, read the chart and the
 * numbers under it, and ask AI about what it shows. The forecast is for
 * managers and admins.
 */
export const ReportsPage = ({
  me,
  recordsBridge = null,
  bridge = REPORTS_BRIDGE
}: TReportsPageProps) => {
  const [sectionId] = useHashPath()
  const users = useCall(recordsBridge?.listUsers ?? null)
  const [period, setPeriod] = useState<TReportPeriod>('this_quarter')
  const [forecastPeriod, setForecastPeriod] =
    useState<TForecastPeriod>('next_3_months')
  const [ownerId, setOwnerId] = useState(EVERYONE)

  if (!bridge) return <EmptyPage page="reports" />

  const sections = SECTIONS.filter(
    (section) => section.id !== 'forecast' || canSeeForecast(me.role)
  )
  // An address the person can't use, such as a member opening the forecast.
  const wanted = SECTIONS.find((section) => section.id === sectionId)
  const isRefused = Boolean(wanted) && !sections.some((s) => s === wanted)
  const active: TSectionId = isRefused
    ? 'forecast'
    : (sections.find((section) => section.id === sectionId)?.id ?? 'pipeline')

  const others = (users.data ?? []).filter((user) => user.id !== me.id)
  const owners = [
    { label: 'Everyone', value: EVERYONE },
    { label: 'Me', value: me.id },
    ...others.map((user) => ({ label: user.name, value: user.id }))
  ]
  const shared = {
    bridge,
    ownerId: ownerId === EVERYONE ? null : ownerId,
    ownerName:
      ownerId === EVERYONE
        ? 'Everyone'
        : ownerId === me.id
          ? me.name
          : (others.find((user) => user.id === ownerId)?.name ?? 'This person'),
    onShowEveryone: () => setOwnerId(EVERYONE)
  }
  const isForecast = active === 'forecast'

  return (
    <PageBody>
      <PageHeader subtitle="How the pipeline is doing." title="Reports" />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Tabs
          active={sections.findIndex((section) => section.id === active)}
          items={sections.map((section) => section.label)}
          label="Reports"
          variant="segmented"
          onChange={(index) => {
            window.location.hash = `#/reports/${sections[index].id}`
          }}
        />
        <span className="flex-1" />
        {isRefused ? null : (
          <div
            aria-label="Filters"
            className="flex items-center gap-2"
            role="toolbar"
          >
            {isForecast ? (
              <PickPill
                className="flex-none"
                label="Period"
                options={FORECAST_PERIODS.map((id) => ({
                  label: REPORT_PERIOD_LABELS[id],
                  value: id
                }))}
                size="md"
                value={forecastPeriod}
                onChange={(next) => setForecastPeriod(next as TForecastPeriod)}
              />
            ) : (
              <PickPill
                className="flex-none"
                label="Period"
                options={REPORT_PERIODS.map((id) => ({
                  label: REPORT_PERIOD_LABELS[id],
                  value: id
                }))}
                size="md"
                value={period}
                onChange={(next) => setPeriod(next as TReportPeriod)}
              />
            )}
            <PickPill
              align="end"
              className="flex-none"
              label="Owner"
              options={owners}
              size="md"
              value={ownerId}
              onChange={setOwnerId}
            />
          </div>
        )}
      </div>
      {isRefused ? (
        <StatePanel
          body="Ask a manager or an admin if you need these numbers."
          kind="noaccess"
          title="The forecast is for managers and admins"
        />
      ) : active === 'pipeline' ? (
        <PipelineReport {...shared} period={period} />
      ) : active === 'won-lost' ? (
        <WonLostReport {...shared} period={period} onPeriodChange={setPeriod} />
      ) : (
        <ForecastReport {...shared} period={forecastPeriod} />
      )}
    </PageBody>
  )
}
