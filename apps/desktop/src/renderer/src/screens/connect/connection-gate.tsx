import { useConnection } from '@/hooks/use-connection'
import { SignedInApp } from '@/screens/app/signed-in-app'

import type { TOpenSalesBridge } from '../../../../preload/bridge-types'
import { CreateAdminScreen } from './create-admin-screen'
import { ServerAddressScreen } from './server-address-screen'
import { ServerUnreachableScreen } from './server-unreachable-screen'
import { SignInScreen } from './sign-in-screen'

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
        <SignedInApp
          serverHost={hostOf(state.serverUrl)}
          user={state.user}
          workspaceName={state.workspaceName}
          onSignOut={connection.signOut}
        />
      )
  }
}
