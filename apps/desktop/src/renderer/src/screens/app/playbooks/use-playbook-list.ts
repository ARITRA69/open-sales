import { useEffect, useState } from 'react'

import type { TPlaybook, TPlaybookListQueryInput } from '@open-sales/shared'

import type { TLoadState } from '@/hooks/use-records'

import type { TPlaybooksBridge } from './playbooks-bridge'

type TListResult = {
  // Which request this answers, so an old answer never shows for a new search.
  key: string
  items: TPlaybook[]
  nextCursor: string | null
  problem: string | null
}

/**
 * The library, loaded again whenever the search or the view changes. While
 * new results load, the old ones stay on screen.
 */
export const usePlaybookList = (
  bridge: TPlaybooksBridge | null,
  query: TPlaybookListQueryInput
) => {
  const [result, setResult] = useState<TListResult | null>(null)
  const [reloads, setReloads] = useState(0)
  const key = JSON.stringify([query, reloads])

  useEffect(() => {
    if (!bridge) return
    let isCurrent = true
    const [wanted] = JSON.parse(key) as [TPlaybookListQueryInput]
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
