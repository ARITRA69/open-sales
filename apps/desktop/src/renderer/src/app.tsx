import { useEffect } from 'react'

import { MotionConfig } from 'motion/react'

import { useBrand } from '@/hooks/use-brand'
import { useInputTracking } from '@/hooks/use-input-tracking'
import {
  createPreviewAiTools,
  createPreviewBridge,
  createPreviewTeam
} from '@/lib/preview-bridge'
import { ComponentsSheet } from '@/screens/components-sheet/components-sheet'
import { ConnectionGate } from '@/screens/connect/connection-gate'

// The real bridge in Electron. In a browser tab during development,
// `?preview=<step>` swaps in a pretend server; otherwise there's none.
const CONNECTION =
  window.openSales?.connection ??
  (import.meta.env.DEV ? createPreviewBridge(window.location.search) : null)
const TEAM =
  window.openSales?.team ??
  (import.meta.env.DEV ? createPreviewTeam(window.location.search) : null)
const AI_TOOLS =
  window.openSales?.aiTools ??
  (import.meta.env.DEV ? createPreviewAiTools(window.location.search) : null)

export const App = () => {
  useInputTracking()
  const { productName } = useBrand()

  // The window title follows the brand, which a branded server can change.
  useEffect(() => {
    document.title = productName
  }, [productName])

  // Motion follows the system's "reduce motion" setting everywhere.
  return (
    <MotionConfig reducedMotion="user">
      {/* No bridge in a plain browser tab or a test: show the UI without a server. */}
      {CONNECTION ? (
        <ConnectionGate
          aiToolsBridge={AI_TOOLS}
          bridge={CONNECTION}
          teamBridge={TEAM}
        />
      ) : (
        <ComponentsSheet />
      )}
    </MotionConfig>
  )
}
