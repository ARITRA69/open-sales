import type { ReactNode } from 'react'

import { LockIcon, SparklesIcon, Tick02Icon } from '@hugeicons/core-free-icons'

import { Button } from '@/components/ui/button'
import { Icon, type TIcon } from '@/components/ui/icon'
import { Dot } from '@/components/ui/status'
import { useBrand } from '@/hooks/use-brand'

/** The server a connect screen talks to, and a way to pick another. */
export type TConnectServer = {
  host: string
  workspaceName: string | null
  onChange: () => void
}

type TConnectLayoutProps = {
  title: string
  intro?: ReactNode
  // "Step 1 of 2" above the title, while setting up a new server.
  step?: { current: number; total: number }
  server?: TConnectServer
  children: ReactNode
}

/**
 * The page for connecting and signing in: the form on the left, and on the
 * right a panel that says what the product does.
 */
export const ConnectLayout = ({
  title,
  intro,
  step,
  server,
  children
}: TConnectLayoutProps) => (
  <div className="flex h-screen min-h-180 bg-background text-foreground antialiased">
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Drags the window, and leaves room for the traffic lights. */}
      <div aria-hidden className="sales-drag-region h-11 flex-none" />
      <main className="flex flex-1 flex-col items-center overflow-y-auto px-6 pb-6">
        <div className="flex w-90 flex-1 flex-col justify-center gap-6 py-6">
          <BrandMark />
          {server ? <ServerChip server={server} /> : null}
          <div className="flex flex-col gap-1">
            {step ? (
              <span className="text-body-sm font-medium text-muted-foreground">
                Step {step.current} of {step.total}
              </span>
            ) : null}
            <h1 className="m-0 text-title-xl font-bold">{title}</h1>
            {intro ? (
              <p className="m-0 text-sm text-muted-foreground">{intro}</p>
            ) : null}
          </div>
          {children}
        </div>
        <p className="m-0 flex items-center gap-1.5 text-body-sm text-muted-foreground">
          <Icon icon={LockIcon} size={12} />
          Your data stays on your company’s own server.
        </p>
      </main>
    </div>
    <BrandPanel />
  </div>
)

/** The product's mark and name. A server logo replaces the mark later. */
const BrandMark = () => {
  const { productName } = useBrand()

  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className="flex size-7 items-center justify-center rounded-panel bg-primary text-sm font-bold text-primary-foreground"
      >
        {productName.charAt(0)}
      </span>
      <span className="text-sm font-semibold">{productName}</span>
    </div>
  )
}

const ServerChip = ({ server }: { server: TConnectServer }) => (
  <div className="flex items-center gap-2 rounded-row bg-muted py-1.5 pr-1.5 pl-3">
    <Dot size="sm" tone="success" />
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate text-sm font-semibold">
        {server.workspaceName ?? server.host}
      </span>
      {server.workspaceName ? (
        <span className="truncate text-body-sm text-muted-foreground">
          {server.host}
        </span>
      ) : null}
    </span>
    <Button size="sm" variant="ghost" onClick={server.onChange}>
      Change
    </Button>
  </div>
)

const POINTS: { icon: TIcon; title: string; body: string }[] = [
  {
    icon: SparklesIcon,
    title: 'Records that fill themselves in',
    body: 'AI reads your calls and emails and proposes the updates.'
  },
  {
    icon: Tick02Icon,
    title: 'Nothing changes without you',
    body: 'Every AI change is a card you approve, edit or decline.'
  },
  {
    icon: LockIcon,
    title: 'Your server, your AI',
    body: 'Data stays with your company. AI runs on your own Claude Code or Codex.'
  }
]

/** What the product does, beside the form. Decorative: the form says it all. */
const BrandPanel = () => (
  <aside
    aria-hidden
    className="sales-drag-region m-2 ml-0 flex w-1/2 max-w-150 flex-col justify-center gap-8 rounded-dialog bg-muted px-12 py-10"
  >
    <div className="flex flex-col gap-2">
      <h2 className="m-0 text-heading font-bold">
        AI does the work. You approve.
      </h2>
      <p className="m-0 text-sm text-muted-foreground">
        A sales pipeline that keeps itself up to date, on a server you own.
      </p>
    </div>

    <ul className="m-0 flex list-none flex-col gap-4 p-0">
      {POINTS.map((point) => (
        <li key={point.title} className="flex items-start gap-3">
          <span className="flex size-7 flex-none items-center justify-center rounded-panel bg-background text-foreground-soft shadow-(--shadow-tile)">
            <Icon icon={point.icon} size={14} strokeWidth={1.6} />
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold">{point.title}</span>
            <span className="text-body-sm text-muted-foreground">
              {point.body}
            </span>
          </span>
        </li>
      ))}
    </ul>

    <ProposalPreview />
  </aside>
)

/** A picture of an AI proposal, as the Ask panel shows one. Not interactive. */
const ProposalPreview = () => (
  <div
    inert
    className="flex flex-col gap-2 rounded-card bg-background p-3 shadow-(--shadow-float)"
  >
    <span className="text-body-sm text-muted-foreground">
      From your call with Halden Capital
    </span>
    <div className="flex flex-col gap-2 rounded-card bg-accent-soft p-3">
      <span className="flex items-center gap-2 text-sm font-semibold">
        <Dot size="sm" tone="accent" />
        Move Halden Capital to Proposal
      </span>
      <PreviewRow from="Trial" label="Stage" to="Proposal" />
      <PreviewRow from="$18,000" label="Value" to="$25,000" />
      <span className="text-body-sm text-foreground-soft">
        Dan asked for pricing for 25 seats by Friday.
      </span>
      <span className="flex items-center gap-2">
        <Button size="sm">Approve</Button>
        <Button size="sm" variant="white">
          Edit
        </Button>
        <Button className="ml-auto" size="sm" variant="ghost">
          Decline
        </Button>
      </span>
    </div>
  </div>
)

const PreviewRow = ({
  label,
  from,
  to
}: {
  label: string
  from: string
  to: string
}) => (
  <span className="flex flex-col gap-0.5 text-sm">
    <span className="text-body-sm text-muted-foreground">{label}</span>
    <span>
      <span className="text-muted-foreground line-through">{from}</span>{' '}
      <b className="font-semibold">{to}</b>
    </span>
  </span>
)

/** The message shown above a form's button when the server says no. */
export const FormProblem = ({ message }: { message: string | null }) =>
  message ? (
    <p className="m-0 text-sm text-destructive" role="alert">
      {message}
    </p>
  ) : null
