import type { ReactNode } from 'react'

import { cva, type VariantProps } from 'class-variance-authority'

import { useLocale } from '@/hooks/use-locale'
import { cn } from '@/lib/utils'

const dotVariants = cva('inline-block flex-none rounded-full', {
  variants: {
    tone: {
      accent: 'bg-accent',
      success: 'bg-success',
      destructive: 'bg-destructive',
      faint: 'bg-faint',
      input: 'bg-input'
    },
    size: { sm: 'size-1.5', md: 'size-2' }
  },
  defaultVariants: { tone: 'accent', size: 'md' }
})

export type TDotTone = NonNullable<VariantProps<typeof dotVariants>['tone']>

type TDotProps = { tone?: TDotTone; size?: 'sm' | 'md'; className?: string }

/** A small round mark: unread, needs you, connected and so on. */
export const Dot = ({ tone, size, className }: TDotProps) => (
  <span
    aria-hidden
    className={cn(dotVariants({ tone, size }), className)}
    data-slot="dot"
  />
)

type TStatusDotProps = {
  tone?: TDotTone
  // `meta` is the smaller grey line used inside cards and rows.
  variant?: 'default' | 'meta'
  dotSize?: 'sm' | 'md'
  children: ReactNode
  className?: string
}

/** A dot and plain words: the usual way to show a status. */
export const StatusDot = ({
  tone,
  variant = 'default',
  dotSize,
  children,
  className
}: TStatusDotProps) => (
  <span
    className={cn(
      'inline-flex items-center gap-2 whitespace-nowrap',
      variant === 'default'
        ? 'text-sm font-medium text-foreground'
        : 'text-body-sm text-muted-foreground',
      className
    )}
    data-slot="status-dot"
  >
    <Dot size={dotSize} tone={tone} />
    {children}
  </span>
)

const tagVariants = cva(
  'inline-flex h-5.5 items-center gap-1 rounded-full px-2 text-body-sm font-semibold whitespace-nowrap text-foreground-soft transition-colors duration-200',
  {
    variants: {
      tone: {
        secondary: 'bg-secondary',
        raised: 'bg-background shadow-(--shadow-tile)',
        // Soft tones only where the status is the main thing on screen.
        success: 'bg-success-soft',
        accent: 'bg-accent-soft text-foreground'
      }
    },
    defaultVariants: { tone: 'secondary' }
  }
)

type TTagProps = VariantProps<typeof tagVariants> & {
  dot?: TDotTone
  children: ReactNode
  className?: string
}

/** A short label in a pill. The accent tone always carries a dot. */
export const Tag = ({ tone, dot, children, className }: TTagProps) => {
  const shownDot = dot ?? (tone === 'accent' ? 'accent' : undefined)

  return (
    <span className={cn(tagVariants({ tone }), className)} data-slot="tag">
      {shownDot ? <Dot size="sm" tone={shownDot} /> : null}
      {children}
    </span>
  )
}

type TStatusPillProps = { children: ReactNode; className?: string }

/** What AI is busy with right now, like "Drafting the email". */
export const StatusPill = ({ children, className }: TStatusPillProps) => (
  <span
    className={cn(
      'inline-flex h-7 items-center gap-1.5 rounded-full bg-accent-soft pr-3 pl-2.5 text-sm font-semibold whitespace-nowrap text-foreground',
      className
    )}
    data-slot="status-pill"
    role="status"
  >
    <span
      aria-hidden
      className="size-3.5 flex-none animate-spin rounded-full border-2 border-input border-t-accent"
    />
    <span className="min-w-0 truncate">{children}</span>
  </span>
)

type TNumberBadgeProps = { children: ReactNode; className?: string }

/** A count in a dark circle, like unread items. */
export const NumberBadge = ({ children, className }: TNumberBadgeProps) => (
  <span
    className={cn(
      'inline-flex h-4.5 min-w-4.5 flex-none items-center justify-center rounded-full bg-accent px-1 text-xs font-bold text-accent-foreground tabular-nums',
      className
    )}
    data-slot="number-badge"
  >
    {children}
  </span>
)

type TProgressTrackProps = {
  steps?: number
  done: number
  // The step after the finished ones shows half-filled while it runs.
  inProgress?: boolean
  label?: string
  className?: string
}

/** Progress in a handful of steps, like a five-step onboarding. */
export const ProgressTrack = ({
  steps = 5,
  done,
  inProgress = false,
  label,
  className
}: TProgressTrackProps) => {
  const { t } = useLocale()

  return (
    <span
      aria-label={label ?? t('Progress')}
      aria-valuemax={steps}
      aria-valuemin={0}
      aria-valuenow={done}
      className={cn('flex gap-1', className)}
      data-slot="progress-track"
      role="progressbar"
    >
      {Array.from({ length: steps }, (_, step) => (
        <span
          key={step}
          className={cn(
            'h-1 flex-1 rounded-full transition-colors duration-300',
            step < done
              ? 'bg-accent'
              : step === done && inProgress
                ? 'bg-faint'
                : 'bg-input'
          )}
        />
      ))}
    </span>
  )
}

const RING_RADIUS = 15
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

type TProgressRingProps = {
  // From 0 to 1.
  value: number
  size?: number
  label?: string
  className?: string
}

export const ProgressRing = ({
  value,
  size = 32,
  label,
  className
}: TProgressRingProps) => {
  const { t } = useLocale()

  const clamped = Math.min(Math.max(value, 0), 1)

  return (
    <svg
      aria-label={label ?? t('Progress')}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={Math.round(clamped * 100)}
      className={cn('flex-none -rotate-90', className)}
      data-slot="progress-ring"
      height={size}
      role="progressbar"
      viewBox="0 0 40 40"
      width={size}
    >
      <circle
        className="stroke-input"
        cx="20"
        cy="20"
        fill="none"
        r={RING_RADIUS}
        strokeWidth="5"
      />
      <circle
        className="stroke-accent transition-[stroke-dashoffset] duration-500 ease-(--ease-out-soft)"
        cx="20"
        cy="20"
        fill="none"
        r={RING_RADIUS}
        strokeDasharray={RING_LENGTH}
        strokeDashoffset={RING_LENGTH * (1 - clamped)}
        strokeLinecap="round"
        strokeWidth="5"
      />
    </svg>
  )
}
