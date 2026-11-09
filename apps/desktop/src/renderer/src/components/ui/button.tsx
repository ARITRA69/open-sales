import type { ComponentProps, MouseEvent, ReactNode } from 'react'

import { cva, type VariantProps } from 'class-variance-authority'

import { Link } from '@/components/shared/link'
import { useLocale } from '@/hooks/use-locale'
import { cn } from '@/lib/utils'

import { AnimatedLabel } from './animated-label'
import { Icon, type TIcon } from './icon'

export const buttonVariants = cva(
  [
    'relative inline-flex flex-none items-center justify-center rounded-full font-semibold whitespace-nowrap no-underline outline-none select-none',
    'transition-[background-color,color,box-shadow,text-decoration-color] duration-200 ease-(--ease-out-soft)',
    'keyboard-focus:shadow-(--halo-keyboard)',
    'disabled:cursor-not-allowed disabled:bg-secondary disabled:text-faint disabled:shadow-none',
    'aria-busy:cursor-progress'
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary-hover active:bg-secondary-active',
        white:
          'bg-background text-foreground shadow-(--shadow-tile) hover:shadow-(--shadow-tile-hover)',
        ghost:
          'bg-transparent text-foreground hover:bg-secondary active:bg-secondary-active disabled:bg-transparent aria-expanded:bg-secondary',
        danger:
          'bg-destructive text-destructive-foreground hover:bg-destructive-hover',
        link: 'h-auto rounded-sm bg-transparent px-0.5 text-foreground underline decoration-faint underline-offset-4 hover:decoration-current disabled:bg-transparent disabled:decoration-input'
      },
      size: {
        sm: 'h-8 gap-1.5 px-3.5 text-body-sm',
        md: 'h-9 gap-2 px-4 text-sm',
        lg: 'h-10 gap-2 px-5 text-sm'
      },
      iconOnly: { true: 'aspect-square px-0', false: '' }
    },
    compoundVariants: [{ variant: 'link', className: 'h-auto px-0.5' }],
    defaultVariants: { variant: 'primary', size: 'md', iconOnly: false }
  }
)

type TButtonOwnProps = {
  variant?: NonNullable<VariantProps<typeof buttonVariants>['variant']>
  // 40 for a page's main actions, 36 in panels and cards, 32 in tight rows.
  size?: 'sm' | 'md' | 'lg'
  leadIcon?: TIcon
  trailIcon?: TIcon
  // Anything else for the start or end of the button, like a smaller chevron.
  lead?: ReactNode
  trail?: ReactNode
  // Shows a spinner in place of the label and ignores clicks until it's done.
  loading?: boolean
  // Turns the button into a link that looks the same.
  href?: string
  hidden?: boolean
}

export type TButtonProps = TButtonOwnProps &
  Omit<ComponentProps<'button'>, keyof TButtonOwnProps>

const Spinner = ({ size }: { size: number }) => (
  <svg
    aria-hidden
    className="animate-spin"
    fill="none"
    height={size}
    viewBox="0 0 20 20"
    width={size}
  >
    <circle
      cx="10"
      cy="10"
      r="7.5"
      stroke="currentColor"
      strokeOpacity="0.25"
      strokeWidth="2.5"
    />
    <path
      d="M17.5 10A7.5 7.5 0 0 0 10 2.5"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2.5"
    />
  </svg>
)

/**
 * The app's button. Pill shaped, never wraps, and never grows or shrinks on
 * press. With no children it is an icon button and needs an `aria-label`.
 */
export const Button = ({
  variant = 'primary',
  size = 'md',
  leadIcon,
  trailIcon,
  lead,
  trail,
  loading = false,
  href,
  hidden = false,
  className,
  children,
  type = 'button',
  onClick,
  'aria-label': ariaLabel,
  ...buttonProps
}: TButtonProps) => {
  const { t } = useLocale()

  if (hidden) return null

  const iconSize = size === 'sm' ? 14 : 16
  const isIconOnly = !children
  const textLabel = typeof children === 'string' ? children : undefined

  const classes = cn(
    buttonVariants({ variant, size, iconOnly: isIconOnly }),
    className
  )

  const content = (
    <>
      <span
        className={cn(
          'inline-flex max-w-full min-w-0 items-center gap-[inherit] transition-opacity duration-150',
          loading && 'opacity-0'
        )}
        data-slot="button-content"
      >
        {lead}
        {leadIcon ? (
          <Icon className="flex-none" icon={leadIcon} size={iconSize} />
        ) : null}
        {textLabel ? (
          <AnimatedLabel>{textLabel}</AnimatedLabel>
        ) : children ? (
          <span className="min-w-0 truncate">{children}</span>
        ) : null}
        {trailIcon ? (
          <Icon className="flex-none" icon={trailIcon} size={iconSize} />
        ) : null}
        {trail}
      </span>
      {loading ? (
        <span
          className="absolute inset-0 flex items-center justify-center"
          data-slot="button-spinner"
        >
          <Spinner size={iconSize} />
        </span>
      ) : null}
    </>
  )

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (loading) {
      event.preventDefault()
      return
    }
    onClick?.(event)
  }

  if (href) {
    return (
      <Link aria-label={ariaLabel} className={classes} href={href}>
        {content}
      </Link>
    )
  }

  return (
    <button
      {...buttonProps}
      aria-busy={loading || undefined}
      aria-label={
        loading && textLabel
          ? t('{label}, working on it', { label: textLabel })
          : ariaLabel
      }
      className={classes}
      data-slot="button"
      data-variant={variant}
      type={type}
      onClick={handleClick}
    >
      {content}
    </button>
  )
}
