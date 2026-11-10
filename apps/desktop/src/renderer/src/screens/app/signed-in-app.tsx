import type { Role, TSessionUser } from '@open-sales/shared'

import { AppShell } from '@/components/sales/app-shell'
import {
  SalesSidebar,
  type TSalesNavId,
  type TSidebarAccount
} from '@/components/sales/sales-sidebar'
import { useAiTools } from '@/hooks/use-ai-tools'
import { useHashRoute } from '@/hooks/use-hash-route'
import { useTeam } from '@/hooks/use-team'
import { getInitials } from '@/lib/initials'
import { ComponentsSheet } from '@/screens/components-sheet/components-sheet'

import type { TOpenSalesBridge } from '../../../../preload/bridge-types'
import { EMPTY_PAGES, EmptyPage, type TEmptyPageId } from './empty-page'
import { AccountsPage } from './records/accounts-page'
import { PeoplePage } from './records/people-page'
import { PipelinePage } from './records/pipeline-page'
import { SettingsPage } from './settings-page'
import { TodayPage } from './today-page'
import { useToday } from './today/use-today'

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  manager: 'Manager',
  member: 'Member'
}

// `components` is the developers' sheet of every UI part, at #/components.
type TRoute = TSalesNavId | 'components'

const ROUTES: readonly TRoute[] = [
  'today',
  'pipeline',
  'renewals',
  'leads',
  'accounts',
  'people',
  'reports',
  'playbooks',
  'settings',
  'components'
]

type TSignedInAppProps = {
  user: TSessionUser
  workspaceName: string | null
  serverHost: string
  // Checks for Claude Code and Codex. Null where there's no way to check.
  aiToolsBridge?: TOpenSalesBridge['aiTools'] | null
  // Admins' team tools: the join link and approvals.
  teamBridge?: TOpenSalesBridge['team'] | null
  // Companies, people and deals. Without it those pages stay empty.
  recordsBridge?: TOpenSalesBridge['records'] | null
  // AI's proposals. Found on `window.openSales` unless a test passes one.
  proposalsBridge?: TOpenSalesBridge['proposals'] | null
  onSignOut: () => void
}

const emptyPage = (route: TEmptyPageId) => ({
  title: EMPTY_PAGES[route].title,
  body: <EmptyPage page={route} />
})

/** The app once someone is signed in: the sidebar, and the page they're on. */
export const SignedInApp = ({
  user,
  workspaceName,
  serverHost,
  aiToolsBridge = null,
  teamBridge = null,
  recordsBridge = null,
  proposalsBridge,
  onSignOut
}: TSignedInAppProps) => {
  const route = useHashRoute(ROUTES, 'today')
  const aiTools = useAiTools(aiToolsBridge)
  const isAdmin = user.role === 'admin'
  const team = useTeam(teamBridge, isAdmin)
  const today = useToday(recordsBridge, proposalsBridge)
  const account: TSidebarAccount = {
    name: user.name,
    email: user.email,
    initials: getInitials(user.name),
    roleLabel: ROLE_LABELS[user.role]
  }

  if (route === 'components') {
    return <ComponentsSheet account={account} onSignOut={onSignOut} />
  }

  const page = (() => {
    switch (route) {
      case 'today':
        return {
          title: 'Today',
          body: (
            <TodayPage
              firstName={user.name.split(' ')[0]}
              followUps={today.extras?.followUps}
              nudges={today.extras?.nudges}
              pendingPeople={isAdmin ? team.pending : []}
              recordsBridge={recordsBridge}
              today={today}
              workspaceName={workspaceName}
              onDecide={team.decide}
            />
          )
        }
      case 'settings':
        return {
          title: 'Settings',
          body: (
            <SettingsPage
              aiTools={aiTools.status}
              email={user.email}
              name={user.name}
              roleLabel={account.roleLabel}
              serverHost={serverHost}
              team={isAdmin && teamBridge ? team : null}
              workspaceName={workspaceName}
              onCheckAiTools={aiTools.refresh}
              onSignOut={onSignOut}
            />
          )
        }
      case 'accounts':
        return recordsBridge
          ? {
              title: 'Accounts',
              body: <AccountsPage bridge={recordsBridge} me={user} />
            }
          : emptyPage(route)
      case 'people':
        return recordsBridge
          ? { title: 'People', body: <PeoplePage bridge={recordsBridge} /> }
          : emptyPage(route)
      case 'pipeline':
        return recordsBridge
          ? {
              title: 'Pipeline',
              body: <PipelinePage bridge={recordsBridge} me={user} />
            }
          : emptyPage(route)
      default:
        return emptyPage(route)
    }
  })()

  return (
    <AppShell
      sidebar={
        <SalesSidebar
          account={account}
          active={route}
          // Today's badge: proposals waiting for this person and, for
          // admins, people waiting to join.
          waiting={today.waitingCount + (isAdmin ? team.pending.length : 0)}
          onSignOut={onSignOut}
        />
      }
      title={page.title}
    >
      {page.body}
    </AppShell>
  )
}
