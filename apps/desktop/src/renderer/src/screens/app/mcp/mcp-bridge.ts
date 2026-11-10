import { createPreviewMcp } from '@/lib/preview-bridge'

import type { TMcpBridge } from '../../../../../preload/bridge-types'

/**
 * How the Connect AI page reaches the app's MCP server: the real bridge in
 * the app, pretend data in the browser preview (`?preview=signed-in#/mcp`),
 * and nothing in a test or a plain browser tab.
 */
export const getMcpBridge = (): TMcpBridge | null => {
  if (typeof window === 'undefined') return null
  return (
    window.openSales?.mcp ??
    (import.meta.env.DEV ? createPreviewMcp(window.location.search) : null)
  )
}
