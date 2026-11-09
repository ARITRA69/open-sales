import { useEffect } from 'react'

import { MotionConfig } from 'motion/react'

import { useBrand } from '@/hooks/use-brand'
import { useInputTracking } from '@/hooks/use-input-tracking'
import { ComponentsSheet } from '@/screens/components-sheet/components-sheet'

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
      <ComponentsSheet />
    </MotionConfig>
  )
}
