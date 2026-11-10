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
import { BrowserPage } from './browser/browser-page'
import { EMPTY_PAGES, EmptyPage, type TEmptyPageId } from './empty-page'
import { McpPage } from './mcp/mcp-page'
import { AccountsPage } from './records/accounts-page'
import { PeoplePage } from './records/people-page'
import { PipelinePage } from './records/pipeline-page'
import { SettingsPage } from './settings-page'
import { TodayPage } from './today-page'

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  manager: 'Manager',
  member: 'Member'
}

// `components` is the developers' sheet of every UI part, at #/components.
// `mcp` is Connect AI, which has no sidebar item of its own.
type TRoute = TSalesNavId | 'components' | 'mcp'

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
  'components',
  'browser',
  'mcp'
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
  onSignOut
}: TSignedInAppProps) => {
  const route = useHashRoute(ROUTES, 'today')
  const aiTools = useAiTools(aiToolsBridge)
  const isAdmin = user.role === 'admin'
  const team = useTeam(teamBridge, isAdmin)
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
              pendingPeople={isAdmin ? team.pending : []}
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
      case 'browser':
        return { title: 'Browser', body: <BrowserPage /> }
      case 'mcp':
        return { title: 'Connect AI', body: <McpPage /> }
      default:
        return emptyPage(route)
    }
  })()

  return (
    <AppShell
      sidebar={
        <SalesSidebar
          account={account}
          active={route === 'mcp' ? undefined : route}
          // For admins, Today's badge counts people waiting to join.
          waiting={isAdmin ? team.pending.length : 0}
          onSignOut={onSignOut}
        />
      }
      title={page.title}
    >
      {page.body}
    </AppShell>
  )
}
