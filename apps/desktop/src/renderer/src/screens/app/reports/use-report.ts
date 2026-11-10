import { useEffect, useState } from 'react'

import type {
  TForecastQueryInput,
  TForecastReport,
  TPipelineReport,
  TReportQueryInput,
  TWonLostReport
} from '@open-sales/shared'

import type { TApiResult } from '../../../../../preload/bridge-types'
import type { TReportsBridge } from './reports-bridge'

type TReports = {
  pipeline: { query: TReportQueryInput; data: TPipelineReport }
  'won-lost': { query: TReportQueryInput; data: TWonLostReport }
  forecast: { query: TForecastQueryInput; data: TForecastReport }
}

export type TReportKind = keyof TReports

type TAnswer<TData> = { key: string; answer: TApiResult<TData> }

const load = (bridge: TReportsBridge, kind: TReportKind, query: object) => {
  switch (kind) {
    case 'pipeline':
      return bridge.getPipeline(query)
    case 'won-lost':
      return bridge.getWonLost(query)
    case 'forecast':
      return bridge.getForecast(query)
  }
}

/**
 * One report, loaded again whenever its filters change. The last answer
 * stays on screen while the next one loads (`isRefreshing`).
 */
export const useReport = <TKind extends TReportKind>(
  bridge: TReportsBridge,
  kind: TKind,
  query: TReports[TKind]['query']
) => {
  type TData = TReports[TKind]['data']
  const [result, setResult] = useState<TAnswer<TData> | null>(null)
  const [reloads, setReloads] = useState(0)
  const key = JSON.stringify([kind, query, reloads])

  useEffect(() => {
    let isCurrent = true
    const [wantedKind, wantedQuery] = JSON.parse(key) as [TKind, object]
    // State is only set once the main process answers.
    void load(bridge, wantedKind, wantedQuery).then((answer) => {
      if (isCurrent) setResult({ key, answer: answer as TApiResult<TData> })
    })
    return () => {
      isCurrent = false
    }
  }, [bridge, key])

  const answer = result?.answer ?? null

  return {
    data: answer?.ok ? answer.data : null,
    state:
      answer === null
        ? ('loading' as const)
        : answer.ok
          ? ('ready' as const)
          : ('error' as const),
    // The server's code, like `forbidden` for a member asking for the forecast.
    code: answer && !answer.ok ? (answer.code ?? null) : null,
    isRefreshing: result !== null && result.key !== key,
    reload: () => setReloads((count) => count + 1)
  }
}
