import { useCallback, useEffect, useState } from 'react'

import type {
  TConnectionResult,
  TConnectionState,
  TOpenSalesBridge
} from '../../../preload/bridge-types'

type TBridgeConnection = TOpenSalesBridge['connection']

/**
 * The connection step from the main process, plus the actions that move it on.
 * `state` is null while the first answer is on its way.
 */
export const useConnection = (bridge: TBridgeConnection) => {
  const [state, setState] = useState<TConnectionState | null>(null)

  const refresh = useCallback(async () => {
    setState(await bridge.getState())
  }, [bridge])

  useEffect(() => {
    let isCurrent = true
    void bridge.getState().then((next) => {
      if (isCurrent) setState(next)
    })
    // A join link opened the app, and the main process moved on.
    const stopListening = bridge.onStateChange((next) => {
      if (isCurrent) setState(next)
    })
    return () => {
      isCurrent = false
      stopListening()
    }
  }, [bridge])

  // Applies a successful result and hands back the message of a failed one.
  const run = async (action: Promise<TConnectionResult>) => {
    const result = await action
    if (result.ok) setState(result.state)
    return result
  }

  return {
    state,
    refresh,
    chooseServer: (address: string) => run(bridge.chooseServer(address)),
    createAdmin: (input: Parameters<TBridgeConnection['createAdmin']>[0]) =>
      run(bridge.createAdmin(input)),
    signIn: (input: Parameters<TBridgeConnection['signIn']>[0]) =>
      run(bridge.signIn(input)),
    join: (input: Parameters<TBridgeConnection['join']>[0]) =>
      run(bridge.join(input)),
    cancelJoin: async () => setState(await bridge.cancelJoin()),
    forgetServer: async () => setState(await bridge.forgetServer()),
    signOut: async () => setState(await bridge.signOut())
  }
}

export type TConnectionControls = ReturnType<typeof useConnection>
