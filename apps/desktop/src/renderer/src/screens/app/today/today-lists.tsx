import type { ReactNode } from 'react'

import { Link } from '@/components/shared/link'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/controls'
import { Tag } from '@/components/ui/status'
import { formatShortDate, toIsoDay } from '@/lib/dates'
import type { TTodayFollowUp, TTodayNudge } from '@/lib/preview-bridge'
import { cn } from '@/lib/utils'

import { askAi } from './ask'

const ROW_CLASS =
  'flex min-h-11 items-center gap-2.5 border-b border-border py-1.5 last:border-b-0'
const TITLE_LINK_CLASS =
  'truncate rounded-sm text-sm font-semibold text-foreground no-underline outline-none hover:underline keyboard-focus:shadow-(--halo-keyboard)'

const Section = ({
  title,
  children
}: {
  title: string
  children: ReactNode
}) => (
  <section className="flex flex-col gap-2">
    <h2 className="m-0 text-sm font-semibold">{title}</h2>
    <ul className="m-0 flex list-none flex-col rounded-card bg-muted px-3 py-0.5">
      {children}
    </ul>
  </section>
)

type TFollowUpsProps = {
  items: TTodayFollowUp[]
  // Ticking one off. Left out until tasks can be completed.
  onDone?: (id: string) => void
  // Passed in so tests can pick the day.
  today?: string
}

/** Tasks and promised replies due today or overdue. Hidden when there are none. */
export const FollowUpsDue = ({
  items,
  onDone,
  today = toIsoDay(new Date())
}: TFollowUpsProps) =>
  items.length === 0 ? null : (
    <Section title="Follow-ups due">
      {items.map((item) => {
        const isOverdue = Boolean(item.dueOn && item.dueOn < today)
        return (
          <li key={item.id} className={ROW_CLASS}>
            {onDone ? (
              <Checkbox
                aria-label={`Done: ${item.title}`}
                checked={false}
                onCheckedChange={() => onDone(item.id)}
              />
            ) : null}
            <span className="flex min-w-0 flex-1 flex-col">
              {item.href ? (
                <Link
                  className={cn(TITLE_LINK_CLASS, 'self-start')}
                  href={item.href}
                >
                  {item.title}
                </Link>
              ) : (
                <span className="truncate text-sm font-semibold">
                  {item.title}
                </span>
              )}
              {item.detail ? (
                <span className="truncate text-body-sm text-muted-foreground">
                  {item.detail}
                </span>
              ) : null}
            </span>
            {item.dueOn ? (
              <Tag dot={isOverdue ? 'destructive' : undefined}>
                {isOverdue
                  ? `Due ${formatShortDate(item.dueOn)}`
                  : item.dueOn === today
                    ? 'Today'
                    : formatShortDate(item.dueOn)}
              </Tag>
            ) : null}
          </li>
        )
      })}
    </Section>
  )

/** Deals idle for longer than their stage allows. Hidden when there are none. */
export const DealsNeedingNudge = ({ items }: { items: TTodayNudge[] }) =>
  items.length === 0 ? null : (
    <Section title="Deals needing a nudge">
      {items.map((item) => (
        <li key={item.id} className={ROW_CLASS}>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex min-w-0 items-baseline gap-2">
              <Link className={TITLE_LINK_CLASS} href={`#/deals/${item.id}`}>
                {item.name}
              </Link>
              <span className="truncate text-body-sm text-muted-foreground">
                {item.companyName}
              </span>
            </span>
            {item.reason ? (
              <span className="truncate text-body-sm text-muted-foreground">
                {item.reason}
              </span>
            ) : null}
          </span>
          <Tag>
            {item.stageName
              ? `Idle ${item.idleDays} days in ${item.stageName}`
              : `Idle ${item.idleDays} days`}
          </Tag>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              askAi({
                prompt: `What should I do next on ${item.name}?`,
                record: { type: 'deal', id: item.id, label: item.name }
              })
            }
          >
            Ask what to do
          </Button>
        </li>
      ))}
    </Section>
  )
