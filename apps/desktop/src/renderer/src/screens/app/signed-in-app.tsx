import type { Role, TSessionUser } from '@open-sales/shared'

import { AppShell } from '@/components/sales/app-shell'
import {
  SalesSidebar,
  type TSalesNavId,
  type TSidebarAccount
} from '@/components/sales/sales-sidebar'
import { useHashRoute } from '@/hooks/use-hash-route'
import { getInitials } from '@/lib/initials'
import { ComponentsSheet } from '@/screens/components-sheet/components-sheet'

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
  onSignOut: () => void
}

/** The app once someone is signed in: the sidebar, and the page they're on. */
export const SignedInApp = ({
  user,
  workspaceName,
  serverHost,
  onSignOut
}: TSignedInAppProps) => {
  const route = useHashRoute(ROUTES, 'today')
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
              email={user.email}
              name={user.name}
              roleLabel={account.roleLabel}
              serverHost={serverHost}
              workspaceName={workspaceName}
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
        <SalesSidebar account={account} active={route} onSignOut={onSignOut} />
      }
      title={page.title}
    >
      {page.body}
    </AppShell>
  )
}
