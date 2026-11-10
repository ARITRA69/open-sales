import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

type TInfoSectionProps = {
  title: string
  // A small count beside the title, such as how many rows there are.
  count?: number
  intro?: ReactNode
  children: ReactNode
}

/**
 * A titled grey card of rows, for pages that explain or list things rather
 * than edit them (Connect AI, AI in the browser).
 */
export const InfoSection = ({
  title,
  count,
  intro,
  children
}: TInfoSectionProps) => (
  <section className="flex flex-col gap-2" data-slot="info-section">
    <div className="flex flex-col">
      <h2 className="m-0 flex items-baseline gap-2 text-sm font-semibold">
        {title}
        {count === undefined ? null : (
          <span className="text-body-sm text-muted-foreground tabular-nums">
            {count}
          </span>
        )}
      </h2>
      {intro ? (
        <p className="m-0 text-body-sm text-muted-foreground">{intro}</p>
      ) : null}
    </div>
    <div className="flex flex-col rounded-card bg-muted px-3">{children}</div>
  </section>
)

type TInfoRowProps = { children: ReactNode; className?: string }

/** One row of an `InfoSection`, with a hairline under all but the last. */
export const InfoRow = ({ children, className }: TInfoRowProps) => (
  <div
    className={cn(
      'flex min-h-9 items-center gap-4 border-b border-border py-2 text-sm last:border-b-0',
      className
    )}
    data-slot="info-row"
  >
    {children}
  </div>
)
