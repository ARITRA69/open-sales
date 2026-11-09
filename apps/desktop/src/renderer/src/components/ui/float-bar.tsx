import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { motion } from 'motion/react'

import { useLocale } from '@/hooks/use-locale'
import { cn } from '@/lib/utils'

import { Icon } from './icon'

export type TFloatBarAction = { label: string; onClick?: () => void }

type TFloatBarProps = {
  // `toast` says something happened; `select` acts on selected rows.
  kind?: 'toast' | 'select'
  text?: string
  // For `select`: how many things are selected.
  count?: number
  actions?: TFloatBarAction[]
  onClose?: () => void
  // Centred near the bottom of its positioned parent, over the page.
  floating?: boolean
  className?: string
}

const BAR_BUTTON =
  'flex h-7 items-center rounded-full outline-none transition-colors duration-150 keyboard-focus:shadow-(--halo-keyboard)'

/**
 * A dark pill for a short message or for acting on a selection. It rises in
 * when it appears and sinks away inside an AnimatePresence.
 */
export const FloatBar = ({
  kind = 'toast',
  text,
  count = 0,
  actions = [],
  onClose,
  floating = false,
  className
}: TFloatBarProps) => {
  const { t } = useLocale()

  const isSelection = kind === 'select'

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        floating
          ? 'pointer-events-none absolute inset-x-0 bottom-6 z-30 flex justify-center'
          : 'inline-flex',
        className
      )}
      data-slot="float-bar"
      exit={{ opacity: 0, y: 12 }}
      initial={{ opacity: 0, y: 12 }}
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
    >
      <div
        aria-label={isSelection ? t('Selection') : undefined}
        className="pointer-events-auto inline-flex h-10 items-center gap-1 rounded-full bg-primary pr-1.5 pl-4 whitespace-nowrap text-primary-foreground shadow-(--shadow-menu)"
        role={isSelection ? 'toolbar' : 'status'}
      >
        <span className="pr-2 text-sm font-semibold tabular-nums">
          {text ?? (isSelection ? t('{count} selected', { count }) : '')}
        </span>
        {actions.map((action) => (
          <button
            key={action.label}
            className={cn(
              BAR_BUTTON,
              'bg-on-primary-fill px-3 text-body-sm font-semibold text-primary-foreground hover:bg-primary-active'
            )}
            type="button"
            onClick={action.onClick}
          >
            {action.label}
          </button>
        ))}
        <button
          aria-label={isSelection ? t('Clear selection') : t('Dismiss')}
          className={cn(
            BAR_BUTTON,
            'w-7 justify-center text-primary-foreground hover:bg-on-primary-fill'
          )}
          type="button"
          onClick={onClose}
        >
          <Icon icon={Cancel01Icon} size={14} />
        </button>
      </div>
    </motion.div>
  )
}
