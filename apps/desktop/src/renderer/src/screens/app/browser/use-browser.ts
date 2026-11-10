import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'

import type {
  TBrowserBridge,
  TBrowserState
} from '../../../../../preload/bridge-types'

/** The browser's tabs and what's waiting on the person. Null until it loads. */
export const useBrowserState = (bridge: TBrowserBridge | null) => {
  const [state, setState] = useState<TBrowserState | null>(null)

  useEffect(() => {
    if (!bridge) return
    let hasNews = false
    const stopListening = bridge.onStateChange((next) => {
      hasNews = true
      setState(next)
    })
    // The first answer mustn't overwrite anything newer that arrived first.
    void bridge.getState().then((first) => {
      if (!hasNews) setState(first)
    })
    return () => {
      hasNews = true
      stopListening()
    }
  }, [bridge])

  return state
}

// Anything of the app's that opens over the page: menus, pickers, dialogs.
const OVERLAY_SELECTOR =
  '[data-radix-popper-content-wrapper], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'

/**
 * A number while one of the app's menus or dialogs is open, null otherwise.
 * It's a new number each time one opens. The live page is a view laid over
 * the app's window, so it would cover them: the page shows a still picture
 * of the tab for as long as one is up.
 */
export const useAppOverlay = () => {
  const [coverId, setCoverId] = useState<number | null>(null)

  useEffect(() => {
    let opened = 0
    let isOpen = false
    const look = () => {
      const isOpenNow = document.querySelector(OVERLAY_SELECTOR) !== null
      if (isOpenNow === isOpen) return
      isOpen = isOpenNow
      setCoverId(isOpenNow ? ++opened : null)
    }
    const observer = new MutationObserver(look)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  return coverId
}

/**
 * Tells the app where the live page goes: over `areaRef`, for as long as
 * `isLive`. It follows the area as the window, the sidebar or the strips
 * above it change size, and hides the page when the area goes away.
 */
export const useLivePageArea = (
  bridge: TBrowserBridge,
  areaRef: RefObject<HTMLElement | null>,
  isLive: boolean
) => {
  useLayoutEffect(() => {
    const area = areaRef.current
    if (!isLive || !area) return
    const report = () => {
      const box = area.getBoundingClientRect()
      bridge.setBounds({
        x: box.left,
        y: box.top,
        width: box.width,
        height: box.height
      })
    }
    report()
    const observer = new ResizeObserver(report)
    observer.observe(area)
    window.addEventListener('resize', report)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', report)
      bridge.setBounds(null)
    }
  }, [bridge, areaRef, isLive])
}
