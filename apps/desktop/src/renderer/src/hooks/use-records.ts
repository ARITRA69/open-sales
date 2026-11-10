import { useEffect, useState } from 'react'

import type {
  TApiResult,
  TOpenSalesBridge,
  TRecordKind,
  TRecordTypes
} from '../../../preload/bridge-types'

export type TRecordsBridge = TOpenSalesBridge['records']

export type TLoadState = 'loading' | 'ready' | 'error'

type TListResult<TItem> = {
  // Which request this answers, so an old answer never shows for a new search.
  key: string
  items: TItem[]
  nextCursor: string | null
  problem: string | null
}

/**
 * One page of records at a time, loaded again whenever the filters change.
 * While new results load, the old ones stay on screen.
 */
export const useRecordList = <TKind extends TRecordKind>(
  bridge: TRecordsBridge | null,
  kind: TKind,
  query: TRecordTypes[TKind]['query'],
  reloadKey = 0
) => {
  type TItem = TRecordTypes[TKind]['item']
  const [result, setResult] = useState<TListResult<TItem> | null>(null)
  const [extraReloads, setExtraReloads] = useState(0)
  const key = JSON.stringify([kind, query, reloadKey, extraReloads])

  useEffect(() => {
    if (!bridge) return
    let isCurrent = true
    const [wantedKind, wantedQuery] = JSON.parse(key) as [
      TKind,
      TRecordTypes[TKind]['query']
    ]
    // State is only set once the main process answers.
    void bridge.list(wantedKind, wantedQuery).then((answer) => {
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
    isRefreshing: result !== null && result.key !== key,
    hasMore: Boolean(result?.nextCursor),
    reload: () => setExtraReloads((count) => count + 1),
    loadMore: async () => {
      if (!bridge || !result?.nextCursor) return
      const answer = await bridge.list(kind, {
        ...query,
        cursor: result.nextCursor
      })
      if (!answer.ok) return
      setResult({
        ...result,
        items: [...result.items, ...answer.data.items],
        nextCursor: answer.data.nextCursor
      })
    }
  }
}

/**
 * One call's answer, such as the pipeline or the board. `reload` asks again;
 * the last answer stays until the new one comes.
 */
export const useCall = <TData>(
  call: (() => Promise<TApiResult<TData>>) | null
) => {
  const [answer, setAnswer] = useState<TApiResult<TData> | null>(null)
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    if (!call) return
    let isCurrent = true
    void call().then((next) => {
      if (isCurrent) setAnswer(next)
    })
    return () => {
      isCurrent = false
    }
  }, [call, reloads])

  return {
    data: answer?.ok ? answer.data : null,
    problem: answer && !answer.ok ? answer.message : null,
    state: (answer === null
      ? 'loading'
      : answer.ok
        ? 'ready'
        : 'error') satisfies TLoadState as TLoadState,
    reload: () => setReloads((count) => count + 1)
  }
}

/** A value that settles: what was typed, once typing pauses. */
export const useSettled = <TValue>(value: TValue, delayMs = 250) => {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return settled
}
