import { useLayoutEffect } from 'react'

const POINTER_ATTRIBUTE = 'data-pointer-input'

// Only keys that move focus bring the keyboard ring back. Typing in a field or
// pressing Escape doesn't mean someone has switched from the mouse.
const FOCUS_KEYS = new Set([
  'Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown'
])

/**
 * Marks <html> while a pointer is in use, which the `keyboard-focus:` variant
 * reads to hide focus rings after a click.
 */
export const useInputTracking = () => {
  useLayoutEffect(() => {
    const root = document.documentElement
    const onPointer = () => root.setAttribute(POINTER_ATTRIBUTE, '')
    const onKey = (event: KeyboardEvent) => {
      if (FOCUS_KEYS.has(event.key)) root.removeAttribute(POINTER_ATTRIBUTE)
    }

    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('keydown', onKey, true)

    return () => {
      root.removeAttribute(POINTER_ATTRIBUTE)
      document.removeEventListener('pointerdown', onPointer, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [])
}
