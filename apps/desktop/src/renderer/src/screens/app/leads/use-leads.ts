import { useEffect, useMemo, useState } from 'react'

import type { TLead, TLeadListQueryInput } from '@open-sales/shared'

import type { TLoadState } from '@/hooks/use-records'
import { createPreviewLeads } from '@/lib/preview-bridge'

import type { TOpenSalesBridge } from '../../../../../preload/bridge-types'

export type TLeadsBridge = TOpenSalesBridge['leads']

type TRecordsBridge = TOpenSalesBridge['records']

/**
 * The leads bridge a page should use: the one it was handed, else the app's
 * own, else (in a browser tab during development) the pretend one. Null
 * means there's no server to ask, and the page shows its empty state.
 */
export const useLeadsBridge = (
  given: TLeadsBridge | null | undefined,
  records: TRecordsBridge | null
): TLeadsBridge | null =>
  useMemo(
    () =>
      given ??
      window.openSales?.leads ??
      (import.meta.env.DEV
        ? createPreviewLeads(window.location.search, records)
        : null),
    [given, records]
  )

type TListResult = {
  // Which request this answers, so an old answer never shows for a new search.
  key: string
  items: TLead[]
  nextCursor: string | null
  problem: string | null
}

/**
 * One page of leads at a time, loaded again whenever the filters change.
 * While new results load, the old ones stay on screen.
 */
export const useLeadList = (
  bridge: TLeadsBridge | null,
  query: TLeadListQueryInput
) => {
  const [result, setResult] = useState<TListResult | null>(null)
  const [reloads, setReloads] = useState(0)
  const key = JSON.stringify([query, reloads])

  useEffect(() => {
    if (!bridge) return
    let isCurrent = true
    const [wanted] = JSON.parse(key) as [TLeadListQueryInput]
    // State is only set once the main process answers.
    void bridge.list(wanted).then((answer) => {
      if (!isCurrent) return
      setResult(
        answer.ok
          ? { key, ...answer.data, problem: null }
          : { key, items: [], nextCursor: null, problem: answer.message }
      )
    })
    return () => {
      isCurrent = false
    }
  }, [bridge, key])

  const state: TLoadState =
    result === null ? 'loading' : result.problem ? 'error' : 'ready'

  return {
    items: result?.items ?? [],
    state,
    problem: result?.problem ?? null,
    hasMore: Boolean(result?.nextCursor),
    reload: () => setReloads((count) => count + 1),
    loadMore: async () => {
      if (!bridge || !result?.nextCursor) return
      const answer = await bridge.list({ ...query, cursor: result.nextCursor })
      if (!answer.ok) return
      setResult({
        ...result,
        items: [...result.items, ...answer.data.items],
        nextCursor: answer.data.nextCursor
      })
    }
  }
}
