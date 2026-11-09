import { useCallback, useEffect, useState } from 'react'

import type {
  TAiToolsStatus,
  TOpenSalesBridge
} from '../../../preload/bridge-types'

/**
 * Which AI tools this machine has. Looks again when the window comes back into
 * focus, so installing or signing in elsewhere shows up straight away.
 * `status` is null while the first look is on its way, or with no bridge.
 */
export const useAiTools = (bridge: TOpenSalesBridge['aiTools'] | null) => {
  const [status, setStatus] = useState<TAiToolsStatus | null>(null)

  const refresh = useCallback(async () => {
    if (bridge) setStatus(await bridge.getStatus())
  }, [bridge])

  useEffect(() => {
    if (!bridge) return
    let isCurrent = true
    const look = () =>
      void bridge.getStatus().then((next) => {
        if (isCurrent) setStatus(next)
      })
    look()
    window.addEventListener('focus', look)
    return () => {
      isCurrent = false
      window.removeEventListener('focus', look)
    }
  }, [bridge])

  return { status, refresh }
}
