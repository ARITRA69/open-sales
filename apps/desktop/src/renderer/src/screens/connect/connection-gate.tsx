import type { Role } from '@open-sales/shared'

import { useConnection } from '@/hooks/use-connection'
import { getInitials } from '@/lib/initials'
import { ComponentsSheet } from '@/screens/components-sheet/components-sheet'

import type { TOpenSalesBridge } from '../../../../preload/bridge-types'
import { CreateAdminScreen } from './create-admin-screen'
import { ServerAddressScreen } from './server-address-screen'
import { ServerUnreachableScreen } from './server-unreachable-screen'
import { SignInScreen } from './sign-in-screen'

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  manager: 'Manager',
  member: 'Member'
}

const hostOf = (serverUrl: string) => new URL(serverUrl).host

type TConnectionGateProps = {
  bridge: TOpenSalesBridge['connection']
}

/**
 * Shows the step the main process says the person is at: choosing a server,
 * creating the first admin, signing in, or the app itself.
 */
export const ConnectionGate = ({ bridge }: TConnectionGateProps) => {
  const connection = useConnection(bridge)
  const { state } = connection

  // The first answer takes a moment; a blank window beats a flash of a form.
  if (!state) return null

  switch (state.step) {
    case 'choose-server':
      return <ServerAddressScreen onChoose={connection.chooseServer} />
    case 'server-unreachable':
      return (
        <ServerUnreachableScreen
          message={state.message}
          onChangeServer={connection.forgetServer}
          onRetry={connection.refresh}
        />
      )
    case 'create-admin':
      return (
        <CreateAdminScreen
          serverHost={hostOf(state.serverUrl)}
          onChangeServer={connection.forgetServer}
          onCreate={connection.createAdmin}
        />
      )
    case 'sign-in':
      return (
        <SignInScreen
          serverHost={hostOf(state.serverUrl)}
          workspaceName={state.workspaceName}
          onChangeServer={connection.forgetServer}
          onSignIn={connection.signIn}
        />
      )
    case 'signed-in':
      return (
        <ComponentsSheet
          account={{
            name: state.user.name,
            email: state.user.email,
            initials: getInitials(state.user.name),
            roleLabel: ROLE_LABELS[state.user.role]
          }}
          onSignOut={connection.signOut}
        />
      )
  }
}
