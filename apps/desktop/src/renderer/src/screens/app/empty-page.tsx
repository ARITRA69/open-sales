import {
  BookOpen01Icon,
  Building06Icon,
  ChartBarLineIcon,
  InboxIcon,
  KanbanIcon,
  RefreshIcon,
  UserGroupIcon
} from '@hugeicons/core-free-icons'

import { PageBody } from '@/components/sales/app-shell'
import type { TIcon } from '@/components/ui/icon'
import { PageHeader } from '@/components/ui/page-header'
import { StatePanel } from '@/components/ui/state-panel'

/** The pages that have nothing to show until the server holds sales data. */
export type TEmptyPageId =
  | 'pipeline'
  | 'renewals'
  | 'leads'
  | 'accounts'
  | 'people'
  | 'reports'
  | 'playbooks'

type TEmptyPageCopy = {
  title: string
  subtitle: string
  icon: TIcon
  emptyTitle: string
  emptyBody: string
}

export const EMPTY_PAGES: Record<TEmptyPageId, TEmptyPageCopy> = {
  pipeline: {
    title: 'Pipeline',
    subtitle: 'Your deals, by stage.',
    icon: KanbanIcon,
    emptyTitle: 'No deals yet',
    emptyBody:
      'Deals you create or import will show here, one column per stage.'
  },
  renewals: {
    title: 'Renewals',
    subtitle: 'Contracts that renew soon.',
    icon: RefreshIcon,
    emptyTitle: 'No renewals coming up',
    emptyBody: 'Contracts renewing in the next 90 days will show here.'
  },
  leads: {
    title: 'Leads',
    subtitle: 'New leads to work.',
    icon: InboxIcon,
    emptyTitle: 'No new leads',
    emptyBody: 'Leads from imports and your web form will arrive here.'
  },
  accounts: {
    title: 'Accounts',
    subtitle: 'Every company you sell to.',
    icon: Building06Icon,
    emptyTitle: 'No accounts yet',
    emptyBody:
      'Companies you add or import will show here, each with one owner.'
  },
  people: {
    title: 'People',
    subtitle: 'The people at your accounts.',
    icon: UserGroupIcon,
    emptyTitle: 'No people yet',
    emptyBody: 'Contacts at your accounts will show here.'
  },
  reports: {
    title: 'Reports',
    subtitle: 'How the pipeline is doing.',
    icon: ChartBarLineIcon,
    emptyTitle: 'No numbers yet',
    emptyBody: 'Reports fill in once there are deals in the pipeline.'
  },
  playbooks: {
    title: 'Playbooks',
    subtitle: 'Shared AI instructions for your team.',
    icon: BookOpen01Icon,
    emptyTitle: 'No playbooks yet',
    emptyBody:
      'Managers write playbooks, and anyone can run one on a deal or account.'
  }
}

/** A page with its header and an empty state, until its data exists. */
export const EmptyPage = ({ page }: { page: TEmptyPageId }) => {
  const copy = EMPTY_PAGES[page]

  return (
    <PageBody>
      <PageHeader subtitle={copy.subtitle} title={copy.title} />
      <StatePanel
        action=""
        body={copy.emptyBody}
        icon={copy.icon}
        title={copy.emptyTitle}
      />
    </PageBody>
  )
}
