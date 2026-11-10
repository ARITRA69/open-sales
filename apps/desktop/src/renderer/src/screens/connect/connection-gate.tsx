import { useConnection } from '@/hooks/use-connection'
import { SignedInApp } from '@/screens/app/signed-in-app'

import type { TOpenSalesBridge } from '../../../../preload/bridge-types'
import { CreateAdminScreen } from './create-admin-screen'
import { JoinScreen } from './join-screen'
import { ServerAddressScreen } from './server-address-screen'
import { ServerUnreachableScreen } from './server-unreachable-screen'
import { SignInScreen } from './sign-in-screen'
import { WaitingApprovalScreen } from './waiting-approval-screen'

const hostOf = (serverUrl: string) => new URL(serverUrl).host

type TConnectionGateProps = {
  bridge: TOpenSalesBridge['connection']
  aiToolsBridge?: TOpenSalesBridge['aiTools'] | null
  // Admins' team tools. Null where there's no way to reach them.
  teamBridge?: TOpenSalesBridge['team'] | null
  // Companies, people and deals.
  recordsBridge?: TOpenSalesBridge['records'] | null
}

/**
 * Shows the step the main process says the person is at: choosing a server,
 * creating the first admin, joining, waiting for approval, signing in, or
 * the app itself.
 */
export const ConnectionGate = ({
  bridge,
  aiToolsBridge = null,
  teamBridge = null,
  recordsBridge = null
}: TConnectionGateProps) => {
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
    case 'join':
      return (
        <JoinScreen
          serverHost={hostOf(state.serverUrl)}
          workspaceName={state.workspaceName}
          onCancel={connection.cancelJoin}
          onJoin={connection.join}
        />
      )
    case 'waiting-approval':
      return (
        <WaitingApprovalScreen
          declined={state.declined}
          email={state.email}
          serverHost={hostOf(state.serverUrl)}
          workspaceName={state.workspaceName}
          onCancel={connection.cancelJoin}
          onCheck={connection.refresh}
        />
      )
    case 'signed-in':
      return (
        <SignedInApp
          aiToolsBridge={aiToolsBridge}
          recordsBridge={recordsBridge}
          serverHost={hostOf(state.serverUrl)}
          teamBridge={teamBridge}
          user={state.user}
          workspaceName={state.workspaceName}
          onSignOut={connection.signOut}
        />
      )
  }
}
