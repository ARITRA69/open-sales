import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'

import { ConnectLayout, FormProblem } from './connect-layout'

type TServerAddressScreenProps = {
  onChoose: (address: string) => Promise<{ ok: boolean; message?: string }>
}

/** First launch: where is the company's server? */
export const ServerAddressScreen = ({
  onChoose
}: TServerAddressScreenProps) => {
  const [address, setAddress] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setIsChecking(true)
    setProblem(null)
    const result = await onChoose(address)
    setIsChecking(false)
    if (!result.ok) setProblem(result.message ?? null)
  }

  return (
    <ConnectLayout
      intro="Paste the join link your team shared, or enter your server’s address."
      step={{ current: 1, total: 2 }}
      title="Connect to your team"
    >
      <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <Field
          autoFocus
          autoCapitalize="off"
          autoComplete="url"
          hint="Running it yourself? After docker compose up, use localhost:8787."
          label="Join link or server address"
          placeholder="https://sales.yourcompany.com/join/…"
          spellCheck={false}
          value={address}
          onChange={(event) => setAddress(event.target.value)}
        />
        <FormProblem message={problem} />
        <Button className="w-full" loading={isChecking} size="lg" type="submit">
          Continue
        </Button>
      </form>
    </ConnectLayout>
  )
}
