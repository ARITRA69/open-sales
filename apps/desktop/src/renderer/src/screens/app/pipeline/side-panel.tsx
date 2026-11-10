import type { KeyboardEvent, ReactNode } from 'react'

import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { motion } from 'motion/react'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

const PANEL_SPRING = {
  type: 'spring' as const,
  stiffness: 420,
  damping: 40,
  mass: 0.9
}

type TSidePanelProps = {
  title: string
  onClose: () => void
  children: ReactNode
  // Buttons along the bottom, the main one last.
  footer?: ReactNode
}

/**
 * A form docked on the right of a page. Unlike a dialog it leaves the page
 * beside it visible and usable; the page gives up the width as it slides in.
 * Escape closes it.
 */
export const SidePanel = ({
  title,
  onClose,
  children,
  footer
}: TSidePanelProps) => {
  const handleKeyDown = (event: KeyboardEvent) => {
    // An open list or calendar inside takes Escape first.
    if (event.key !== 'Escape' || event.defaultPrevented) return
    event.stopPropagation()
    onClose()
  }

  return (
    <motion.aside
      animate={{ width: 'auto', opacity: 1 }}
      aria-label={title}
      className="h-full flex-none overflow-hidden bg-background text-foreground shadow-(--shadow-panel-edge)"
      data-slot="side-panel"
      exit={{ width: 0, opacity: 0 }}
      initial={{ width: 0, opacity: 0 }}
      role="dialog"
      transition={PANEL_SPRING}
      onKeyDown={handleKeyDown}
    >
      <div className="flex h-full w-90 flex-col">
        <header className="flex flex-none items-center gap-2 pt-4 pr-3 pb-3 pl-5">
          <h2 className="m-0 min-w-0 flex-1 truncate text-heading font-bold">
            {title}
          </h2>
          <Button
            aria-label={`Close ${title}`}
            lead={<Icon icon={Cancel01Icon} />}
            size="sm"
            variant="ghost"
            onClick={onClose}
          />
        </header>
        <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto px-5 pb-4">
          {children}
        </div>
        {footer ? (
          <footer className="flex flex-none justify-end gap-2 border-t border-border px-5 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </motion.aside>
  )
}
