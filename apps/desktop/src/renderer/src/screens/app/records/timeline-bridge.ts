import type { TRecordsBridge } from '@/hooks/use-records'
import { createPreviewTimeline } from '@/lib/preview-bridge'

import type { TTimelineBridge } from '../../../../../preload/bridge-types'

export type { TTimelineBridge }

// One pretend timeline per pretend records bridge, so what's added stays.
const previews = new WeakMap<TRecordsBridge, TTimelineBridge | null>()

/**
 * Timelines, notes, calls and tasks: the real bridge in the app, a pretend
 * one in the browser preview, and null where there's neither (the pages
 * then show their fields without a timeline).
 */
export const timelineBridgeFor = (
  records: TRecordsBridge
): TTimelineBridge | null => {
  if (window.openSales?.timeline) return window.openSales.timeline
  if (!import.meta.env.DEV) return null
  if (!previews.has(records)) {
    previews.set(
      records,
      createPreviewTimeline(window.location.search, records)
    )
  }
  return previews.get(records) ?? null
}
