import { useLayoutEffect, useRef, useState } from 'react'

import { AnimatePresence, motion, useIsPresent } from 'motion/react'

import { cn } from '@/lib/utils'

const WIDTH_TRANSITION = {
  type: 'spring' as const,
  stiffness: 380,
  damping: 34,
  mass: 0.7
}
const TEXT_TRANSITION = { duration: 0.16, ease: [0.22, 0.8, 0.24, 1] as const }

const LabelText = ({ text }: { text: string }) => {
  // Text on its way out is only there to fade; assistive tech should skip it.
  const isPresent = useIsPresent()

  return (
    <motion.span
      animate={{ opacity: 1, y: 0 }}
      aria-hidden={isPresent ? undefined : true}
      className="col-start-1 row-start-1 min-w-0 truncate"
      exit={{ opacity: 0, y: -3 }}
      initial={{ opacity: 0, y: 3 }}
      transition={TEXT_TRANSITION}
    >
      {text}
    </motion.span>
  )
}

type TAnimatedLabelProps = {
  children: string
  className?: string
}

/**
 * Text that changes smoothly: the old words fade up and out, the new ones fade
 * in, and the width eases to fit so nothing around it jumps. When there isn't
 * room, the text ends in an ellipsis.
 */
export const AnimatedLabel = ({ children, className }: TAnimatedLabelProps) => {
  const sizerRef = useRef<HTMLSpanElement>(null)

  const [width, setWidth] = useState<number | 'auto'>('auto')

  // A hidden copy of the text, drawn from an attribute so it isn't readable
  // text, sets the target width. It is watched, so the width also follows the
  // web font arriving after the first paint.
  useLayoutEffect(() => {
    const sizer = sizerRef.current
    if (!sizer) return

    // Layout sizes, not getBoundingClientRect: a dialog or menu that is still
    // scaling in would make the text measure too narrow.
    const apply = (measured: number) =>
      setWidth(measured > 0 ? Math.ceil(measured) : 'auto')

    if (typeof ResizeObserver === 'undefined') {
      apply(sizer.offsetWidth)
      return
    }

    const observer = new ResizeObserver(([entry]) =>
      apply(entry.contentRect.width)
    )
    observer.observe(sizer)
    return () => observer.disconnect()
  }, [children])

  return (
    <motion.span
      animate={{ width }}
      className={cn(
        'relative inline-grid max-w-full min-w-0 overflow-hidden align-top whitespace-nowrap',
        className
      )}
      initial={false}
      transition={WIDTH_TRANSITION}
    >
      <span
        ref={sizerRef}
        aria-hidden
        className="invisible absolute top-0 left-0 whitespace-nowrap after:content-[attr(data-text)]"
        data-text={children}
      />
      <AnimatePresence initial={false} mode="popLayout">
        <LabelText key={children} text={children} />
      </AnimatePresence>
    </motion.span>
  )
}
