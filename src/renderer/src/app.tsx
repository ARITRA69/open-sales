import { MotionConfig } from 'motion/react'

import { useInputTracking } from '@/hooks/use-input-tracking'
import { ComponentsSheet } from '@/screens/components-sheet/components-sheet'

export const App = () => {
  useInputTracking()

  // Motion follows the system's "reduce motion" setting everywhere.
  return (
    <MotionConfig reducedMotion="user">
      <ComponentsSheet />
    </MotionConfig>
  )
}
