import { useEffect, useState } from 'react'

import type { TPage } from '@open-sales/shared'

import type { TLoadState } from '@/hooks/use-records'

import type { TApiResult } from '../../../../../preload/bridge-types'

type TPagesResult<TItem> = {
  // Which request this answers, so an old answer never shows for a new filter.
  key: string
  items: TItem[]
  nextCursor: string | null
  problem: string | null
}

/**
 * A paged list from one bridge call, loaded again whenever the filters
 * change. While new results load, the old ones stay on screen. `fetchPage`
 * must be the same function each time, like a bridge's own method.
 */
export const usePages = <TQuery extends { cursor?: string }, TItem>(
  fetchPage: (query: TQuery) => Promise<TApiResult<TPage<TItem>>>,
  query: TQuery
) => {
  const [result, setResult] = useState<TPagesResult<TItem> | null>(null)
  const [reloads, setReloads] = useState(0)
  const key = JSON.stringify([query, reloads])

  useEffect(() => {
    let isCurrent = true
    const [wanted] = JSON.parse(key) as [TQuery]
    // State is only set once the main process answers.
    void fetchPage(wanted).then((answer) => {
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
  }, [fetchPage, key])

  const state: TLoadState =
    result === null ? 'loading' : result.problem ? 'error' : 'ready'

  return {
    items: result?.items ?? [],
    state,
    problem: result?.problem ?? null,
    hasMore: Boolean(result?.nextCursor),
    reload: () => setReloads((count) => count + 1),
    loadMore: async () => {
      if (!result?.nextCursor) return
      const answer = await fetchPage({ ...query, cursor: result.nextCursor })
      if (!answer.ok) return
      setResult({
        ...result,
        items: [...result.items, ...answer.data.items],
        nextCursor: answer.data.nextCursor
      })
    }
  }
}
