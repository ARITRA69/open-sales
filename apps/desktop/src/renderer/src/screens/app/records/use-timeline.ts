import { useEffect, useState } from 'react'

import type { TTimelineItem } from '@open-sales/shared'

import type { TLoadState } from '@/hooks/use-records'

import type { TTimelineRecord } from '../../../../../preload/bridge-types'
import type { TTimelineBridge } from './timeline-bridge'

type TResult = {
  // Which request this answers, so one record's items never show on another.
  key: string
  items: TTimelineItem[]
  nextCursor: string | null
  problem: string | null
}

/**
 * A record's timeline: what's upcoming, then history, a page at a time.
 * `reload` starts again from the top, which is what every change does.
 */
export const useTimeline = (
  bridge: TTimelineBridge | null,
  { type, id }: TTimelineRecord
) => {
  const [result, setResult] = useState<TResult | null>(null)
  const [reloads, setReloads] = useState(0)
  const key = `${type}:${id}:${reloads}`

  useEffect(() => {
    if (!bridge) return
    let isCurrent = true
    // State is only set once the main process answers.
    void bridge.read({ type, id }).then((answer) => {
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
  }, [bridge, type, id, key])

  // Another record's items never show while this one loads.
  const shown = result?.key.startsWith(`${type}:${id}:`) ? result : null
  const state: TLoadState =
    shown === null ? 'loading' : shown.problem ? 'error' : 'ready'

  return {
    items: shown?.items ?? [],
    state,
    problem: shown?.problem ?? null,
    hasMore: Boolean(shown?.nextCursor),
    reload: () => setReloads((count) => count + 1),
    loadMore: async () => {
      if (!bridge || !shown?.nextCursor) return
      const answer = await bridge.read(
        { type, id },
        { cursor: shown.nextCursor }
      )
      if (!answer.ok) return
      setResult((current) =>
        current?.key === shown.key
          ? {
              ...current,
              items: [...current.items, ...answer.data.items],
              nextCursor: answer.data.nextCursor
            }
          : current
      )
    }
  }
}

export type TTimelineState = ReturnType<typeof useTimeline>
