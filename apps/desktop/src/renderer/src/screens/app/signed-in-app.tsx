import type { Role, TSessionUser } from '@open-sales/shared'

import { AppShell } from '@/components/sales/app-shell'
import {
  SalesSidebar,
  type TSalesNavId,
  type TSidebarAccount
} from '@/components/sales/sales-sidebar'
import { useAiTools } from '@/hooks/use-ai-tools'
import { useHashRoute } from '@/hooks/use-hash-route'
import { summariseAiTools } from '@/lib/ai-tool-summary'
import { getInitials } from '@/lib/initials'
import { ComponentsSheet } from '@/screens/components-sheet/components-sheet'

import type { TOpenSalesBridge } from '../../../../preload/bridge-types'
import { EMPTY_PAGES, EmptyPage } from './empty-page'
import { SettingsPage } from './settings-page'
import { TodayPage } from './today-page'

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
  onSignOut: () => void
}

/** The app once someone is signed in: the sidebar, and the page they're on. */
export const SignedInApp = ({
  user,
  workspaceName,
  serverHost,
  aiToolsBridge = null,
  onSignOut
}: TSignedInAppProps) => {
  const route = useHashRoute(ROUTES, 'today')
  const aiTools = useAiTools(aiToolsBridge)
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
              workspaceName={workspaceName}
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
              workspaceName={workspaceName}
              onCheckAiTools={aiTools.refresh}
              onSignOut={onSignOut}
            />
          )
        }
      default:
        return {
          title: EMPTY_PAGES[route].title,
          body: <EmptyPage page={route} />
        }
    }
  })()

  return (
    <AppShell
      sidebar={
        <SalesSidebar
          account={account}
          active={route}
          aiTool={aiToolsBridge ? summariseAiTools(aiTools.status) : null}
          onSignOut={onSignOut}
        />
      }
      title={page.title}
    >
      {page.body}
    </AppShell>
  )
}
