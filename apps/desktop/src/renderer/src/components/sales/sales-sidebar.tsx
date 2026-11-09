import {
  BookOpen01Icon,
  Building06Icon,
  ChartBarLineIcon,
  InboxIcon,
  KanbanIcon,
  RefreshIcon,
  Settings01Icon,
  Sun03Icon,
  UserGroupIcon
} from '@hugeicons/core-free-icons'

import { Link } from '@/components/shared/link'
import { Avatar } from '@/components/ui/bits'
import { Icon, type TIcon } from '@/components/ui/icon'
import { Menu } from '@/components/ui/menu'
import { Dot } from '@/components/ui/status'
import { useBrand } from '@/hooks/use-brand'
import type { TAiToolSummary } from '@/lib/ai-tool-summary'
import { cn } from '@/lib/utils'

import { AiToolStack } from './ai-tool-logo'

export type TSalesNavId =
  | 'today'
  | 'pipeline'
  | 'renewals'
  | 'leads'
  | 'accounts'
  | 'people'
  | 'reports'
  | 'playbooks'
  | 'settings'

type TSalesNavItem = {
  id: TSalesNavId
  label: string
  icon: TIcon
  href: string
}

const SALES_NAV_ITEMS: TSalesNavItem[] = [
  { id: 'today', label: 'Today', icon: Sun03Icon, href: '#/today' },
  { id: 'pipeline', label: 'Pipeline', icon: KanbanIcon, href: '#/pipeline' },
  { id: 'renewals', label: 'Renewals', icon: RefreshIcon, href: '#/renewals' },
  { id: 'leads', label: 'Leads', icon: InboxIcon, href: '#/leads' },
  {
    id: 'accounts',
    label: 'Accounts',
    icon: Building06Icon,
    href: '#/accounts'
  },
  { id: 'people', label: 'People', icon: UserGroupIcon, href: '#/people' },
  {
    id: 'reports',
    label: 'Reports',
    icon: ChartBarLineIcon,
    href: '#/reports'
  },
  {
    id: 'playbooks',
    label: 'Playbooks',
    icon: BookOpen01Icon,
    href: '#/playbooks'
  }
]

const NAV_LINK_CLASS =
  'hover:bg-secondary rounded-panel text-sm flex h-7.5 flex-none items-center gap-2.5 px-2.5 font-medium transition-colors'
const NAV_LINK_ACTIVE_CLASS =
  'bg-background hover:bg-background font-semibold shadow-(--shadow-tile)'

type TSalesNavLinkProps = {
  item: TSalesNavItem
  isActive: boolean
  waitingCount?: number
}

const SalesNavLink = ({ item, isActive, waitingCount }: TSalesNavLinkProps) => (
  <Link
    aria-current={isActive ? 'page' : undefined}
    className={cn(NAV_LINK_CLASS, isActive && NAV_LINK_ACTIVE_CLASS)}
    href={item.href}
  >
    <Icon className="flex-none" icon={item.icon} size={16} strokeWidth={1.6} />
    <span className="truncate">{item.label}</span>
    {waitingCount ? (
      <span
        aria-label={`${waitingCount} waiting on you`}
        className="ml-auto flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-accent px-1 text-xs font-bold text-accent-foreground"
      >
        {waitingCount}
      </span>
    ) : null}
  </Link>
)

/** The signed-in person, as the sidebar shows them. */
export type TSidebarAccount = {
  name: string
  email: string
  initials: string
  roleLabel: string
}

type TSalesSidebarProps = {
  active?: TSalesNavId
  // How many proposals are waiting for this person. It shows on Today.
  waiting?: number
  // The AI tool line above Settings. Null hides it (no way to check).
  aiTool?: TAiToolSummary | null
  account: TSidebarAccount
  // Turns the person's name into a menu with Sign out.
  onSignOut?: () => void
}

const AccountSummary = ({ account }: { account: TSidebarAccount }) => (
  <>
    <Avatar initials={account.initials} size={24} />
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-body-sm leading-4 font-semibold">
        {account.name}
      </span>
      <span className="truncate text-xs leading-3.5 text-muted-foreground">
        {account.roleLabel}
      </span>
    </span>
  </>
)

export const SalesSidebar = ({
  active,
  waiting = 0,
  aiTool = {
    label: 'Claude Code ready',
    detail: 'Claude Code is ready',
    tone: 'success',
    tools: [{ id: 'claude-code', muted: false }]
  },
  account,
  onSignOut
}: TSalesSidebarProps) => {
  const { productName } = useBrand()

  return (
    <nav
      aria-label={productName}
      className="box-border flex h-full w-50 flex-none flex-col gap-3 border-r border-border bg-muted px-2 pb-2 text-foreground"
    >
      {/* The traffic lights and window controls sit here, and it drags the window. */}
      <div aria-hidden className="sales-drag-region -mx-2 h-11 flex-none" />

      <div className="flex min-h-0 flex-1 flex-col gap-0.5">
        {SALES_NAV_ITEMS.map((item) => (
          <SalesNavLink
            key={item.id}
            isActive={item.id === active}
            item={item}
            waitingCount={item.id === 'today' ? waiting : undefined}
          />
        ))}
      </div>

      <div className="flex flex-col gap-0.5">
        {aiTool ? (
          <Link
            className="flex h-8 items-center gap-2 rounded-panel px-2.5 text-body-sm font-medium text-foreground-soft transition-colors hover:bg-secondary"
            href="#/settings"
            title={`${aiTool.detail}. Open Settings for details.`}
          >
            {aiTool.tools.length > 0 ? (
              <AiToolStack tone={aiTool.tone} tools={aiTool.tools} />
            ) : (
              <Dot size="sm" tone={aiTool.tone} />
            )}
            <span className="truncate">{aiTool.label}</span>
          </Link>
        ) : null}
        <SalesNavLink
          isActive={active === 'settings'}
          item={{
            id: 'settings',
            label: 'Settings',
            icon: Settings01Icon,
            href: '#/settings'
          }}
        />
        {onSignOut ? (
          <Menu
            align="start"
            header={
              <p className="m-0 truncate px-2 py-1.5 text-body-sm text-muted-foreground">
                {account.email}
              </p>
            }
            items={[{ label: 'Sign out', onSelect: onSignOut }]}
            label="Your account"
            side="top"
            trigger={
              <button
                className="flex w-full items-center gap-2 rounded-panel px-2.5 py-1 text-left transition-colors outline-none hover:bg-secondary keyboard-focus:shadow-(--halo-keyboard)"
                type="button"
              >
                <AccountSummary account={account} />
              </button>
            }
          />
        ) : (
          <div className="flex items-center gap-2 px-2.5 py-1">
            <AccountSummary account={account} />
          </div>
        )}
      </div>
    </nav>
  )
}
