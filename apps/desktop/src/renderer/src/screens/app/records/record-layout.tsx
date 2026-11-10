import type { ReactNode } from 'react'

import { LockIcon } from '@hugeicons/core-free-icons'

import { Link } from '@/components/shared/link'
import { Icon } from '@/components/ui/icon'
import { PageHeader, type THeaderLink } from '@/components/ui/page-header'

type TRecordLayoutProps = {
  // Back to the list this record is in.
  backLink: THeaderLink
  title: string
  // One quiet line under the name: what it is, in a few words.
  subtitle?: string
  // Edit, Reassign and the like. The timeline has its own buttons.
  actions?: ReactNode
  // The record's fields, down the left.
  fields: ReactNode
  // Tabs and the timeline, in the middle.
  children: ReactNode
}

/**
 * One layout for every record: its fields on the left and its timeline in
 * the middle, leaving the right of the window for the Ask AI panel. When
 * that panel (or a small window) squeezes the page, the fields move above
 * the timeline instead of crushing it.
 */
export const RecordLayout = ({
  backLink,
  title,
  subtitle,
  actions,
  fields,
  children
}: TRecordLayoutProps) => (
  <div
    className="@container box-border flex min-h-0 flex-1 scrollbar-thin flex-col overflow-y-auto"
    data-slot="record-page"
  >
    <div className="border-b border-border px-6 pt-5 pb-4">
      <PageHeader
        actions={actions}
        backLink={backLink}
        subtitle={subtitle}
        title={title}
      />
    </div>
    <div className="flex flex-1 flex-col @3xl:flex-row">
      <aside
        aria-label="Details"
        className="box-border flex flex-none flex-col gap-4 border-b border-border px-6 py-4 @3xl:w-72 @3xl:border-r @3xl:border-b-0"
        data-slot="record-fields"
      >
        {fields}
      </aside>
      {/* Kept to a readable width: the space beyond it is the Ask AI panel's. */}
      <section
        aria-label="Timeline"
        className="box-border flex max-w-220 min-w-0 flex-1 flex-col gap-4 px-6 pt-4 pb-8"
        data-slot="record-main"
      >
        {children}
      </section>
    </div>
  </div>
)

export type TFieldRow = {
  label: string
  // Nothing, or an empty string, shows as "Not set".
  value?: ReactNode
}

/** A record's fields, read-only: the label on the left, the value beside it. */
export const FieldList = ({ rows }: { rows: TFieldRow[] }) => (
  <dl className="m-0 flex flex-col gap-2.5" data-slot="field-list">
    {rows.map((row) => (
      <div key={row.label} className="grid grid-cols-3 gap-2">
        <dt className="text-sm text-muted-foreground">{row.label}</dt>
        <dd className="col-span-2 m-0 min-w-0 text-sm wrap-break-word text-foreground">
          {row.value ? row.value : <span className="text-faint">Not set</span>}
        </dd>
      </div>
    ))}
  </dl>
)

/**
 * What someone sees in place of Edit when a record isn't theirs to change:
 * a quiet line saying whose it is.
 */
export const OwnedBy = ({ name }: { name: string }) => (
  <p
    className="m-0 flex items-center gap-1.5 text-body-sm text-muted-foreground"
    data-slot="owned-by"
  >
    <Icon className="flex-none" icon={LockIcon} size={14} />
    {`Owned by ${name}`}
  </p>
)

/** A link to another record, inside a field or a timeline line. */
export const RecordLink = ({
  href,
  children
}: {
  href: string
  children: ReactNode
}) => (
  <Link
    className="rounded-sm font-medium text-foreground underline decoration-input underline-offset-4 transition-colors duration-150 outline-none hover:decoration-current keyboard-focus:shadow-(--halo-keyboard)"
    href={href}
  >
    {children}
  </Link>
)

/** A heading inside a record page: "Coming up", "Open deals". */
export const SectionTitle = ({ children }: { children: ReactNode }) => (
  <h2 className="m-0 text-body-sm font-semibold text-muted-foreground">
    {children}
  </h2>
)
