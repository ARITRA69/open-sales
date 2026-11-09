import type { ReactNode } from 'react'

import { cva, type VariantProps } from 'class-variance-authority'
import { Avatar as AvatarPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

const avatarVariants = cva(
  'inline-flex flex-none items-center justify-center overflow-hidden rounded-full font-semibold text-primary-foreground select-none',
  {
    variants: {
      size: {
        24: 'size-6 text-[10px]',
        28: 'size-7 text-[11px]',
        36: 'size-9 text-body-sm'
      },
      tone: {
        foreground: 'bg-foreground',
        soft: 'bg-foreground-soft',
        muted: 'bg-muted-foreground'
      }
    },
    defaultVariants: { size: 36, tone: 'soft' }
  }
)

type TAvatarProps = VariantProps<typeof avatarVariants> & {
  initials: string
  // A photo. The initials show until it loads, or if it can't.
  src?: string
  className?: string
}

export const Avatar = ({
  initials,
  src,
  size,
  tone,
  className
}: TAvatarProps) => (
  <AvatarPrimitive.Root
    className={cn(avatarVariants({ size, tone }), className)}
    data-slot="avatar"
  >
    {src ? (
      <AvatarPrimitive.Image
        alt=""
        className="size-full object-cover"
        src={src}
      />
    ) : null}
    <AvatarPrimitive.Fallback>{initials}</AvatarPrimitive.Fallback>
  </AvatarPrimitive.Root>
)

type TKeyProps = {
  // `raised` lifts the key off a white surface; `plain` sits on grey.
  tone?: 'grey' | 'raised' | 'plain'
  children: ReactNode
  className?: string
}

/** A keyboard shortcut, like ⌘K. */
export const Key = ({ tone = 'grey', children, className }: TKeyProps) => (
  <kbd
    className={cn(
      'inline-flex h-6 min-w-6 flex-none items-center justify-center rounded-sm px-1.5 font-sans text-xs font-semibold text-muted-foreground',
      tone === 'grey' && 'bg-secondary',
      tone === 'raised' && 'bg-background shadow-(--shadow-key)',
      tone === 'plain' && 'bg-background',
      className
    )}
    data-slot="key"
  >
    {children}
  </kbd>
)

type TDividerLabelProps = { children: ReactNode; className?: string }

/** A hairline with words in the middle, like "or". */
export const DividerLabel = ({ children, className }: TDividerLabelProps) => (
  <div
    className={cn('flex items-center gap-3', className)}
    data-slot="divider-label"
    role="separator"
  >
    <span className="h-px flex-1 bg-border" />
    <span className="text-body-sm font-medium whitespace-nowrap text-muted-foreground">
      {children}
    </span>
    <span className="h-px flex-1 bg-border" />
  </div>
)
