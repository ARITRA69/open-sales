import { createPreviewBrowser } from '@/lib/preview-bridge'

import type { TBrowserBridge } from '../../../../../preload/bridge-types'

/**
 * How the Browser page reaches the tabs: the real bridge in the app, a
 * pretend one in the browser preview (`?preview=signed-in#/browser`), and
 * nothing in a test or a plain browser tab.
 */
export const getBrowserBridge = (): TBrowserBridge | null => {
  if (typeof window === 'undefined') return null
  return (
    window.openSales?.browser ??
    (import.meta.env.DEV ? createPreviewBrowser(window.location.search) : null)
  )
}

/**
 * Whether real pages are drawn over the Browser page by the app. In the
 * preview there are none, so a picture of the page is shown in their place.
 */
export const hasLiveTabs = () =>
  typeof window !== 'undefined' && Boolean(window.openSales?.browser)
