import { useState } from 'react'

import { Button } from '@/components/ui/button'

import { ConnectLayout } from './connect-layout'

type TServerUnreachableScreenProps = {
  message: string
  onRetry: () => Promise<void>
  onChangeServer: () => void
}

/** The saved server didn't answer. Try again, or pick another. */
export const ServerUnreachableScreen = ({
  message,
  onRetry,
  onChangeServer
}: TServerUnreachableScreenProps) => {
  const [isRetrying, setIsRetrying] = useState(false)

  const handleRetry = async () => {
    setIsRetrying(true)
    await onRetry()
    setIsRetrying(false)
  }

  return (
    <ConnectLayout intro={message} title="Can’t reach your server">
      <div className="flex flex-col gap-4">
        <Button
          className="w-full"
          loading={isRetrying}
          size="lg"
          onClick={handleRetry}
        >
          Try again
        </Button>
        <Button variant="link" onClick={onChangeServer}>
          Use a different server
        </Button>
      </div>
    </ConnectLayout>
  )
}
