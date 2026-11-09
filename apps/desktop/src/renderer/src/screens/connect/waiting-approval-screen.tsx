import { useEffect } from 'react'

import { Button } from '@/components/ui/button'
import { StatusPill } from '@/components/ui/status'

import { ConnectLayout } from './connect-layout'

// How often to ask whether an admin has let them in.
const CHECK_EVERY_MS = 4000

type TWaitingApprovalScreenProps = {
  serverHost: string
  workspaceName: string | null
  email: string
  declined: boolean
  // Asks the main process again; it moves on by itself once approved.
  onCheck: () => Promise<void>
  onCancel: () => void
}

/** Joined from outside the trusted domain: an admin has to say yes. */
export const WaitingApprovalScreen = ({
  serverHost,
  workspaceName,
  email,
  declined,
  onCheck,
  onCancel
}: TWaitingApprovalScreenProps) => {
  useEffect(() => {
    if (declined) return
    const timer = setInterval(() => void onCheck(), CHECK_EVERY_MS)
    return () => clearInterval(timer)
  }, [declined, onCheck])

  const team = workspaceName ?? 'your team'

  return (
    <ConnectLayout
      intro={
        declined
          ? `An admin at ${team} didn’t approve ${email}. If that’s a mistake, ask them to look again.`
          : `We’ve asked the admins at ${team} to let ${email} in. This screen moves on by itself once they do.`
      }
      server={{ host: serverHost, workspaceName, onChange: onCancel }}
      title={declined ? 'Not approved' : 'Waiting for approval'}
    >
      <div className="flex flex-col gap-4">
        {declined ? null : (
          <StatusPill className="self-start">Waiting for an admin</StatusPill>
        )}
        <Button
          className="w-full"
          size="lg"
          variant="secondary"
          onClick={onCancel}
        >
          {declined ? 'Use a different server' : 'Cancel'}
        </Button>
      </div>
    </ConnectLayout>
  )
}
