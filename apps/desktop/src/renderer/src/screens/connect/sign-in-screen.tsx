import { useState, type FormEvent } from 'react'

import { signInRequestSchema } from '@open-sales/shared'

import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { checkFields } from '@/lib/field-errors'

import { ConnectLayout, FormProblem } from './connect-layout'

type TSignInScreenProps = {
  serverHost: string
  workspaceName: string | null
  onSignIn: (input: {
    email: string
    password: string
  }) => Promise<{ ok: boolean; message?: string }>
  onChangeServer: () => void
}

/** Signing in to a server that's already set up. */
export const SignInScreen = ({
  serverHost,
  workspaceName,
  onSignIn,
  onChangeServer
}: TSignInScreenProps) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [problem, setProblem] = useState<string | null>(null)
  const [isSigningIn, setIsSigningIn] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const checked = checkFields(signInRequestSchema, { email, password })
    setErrors(checked.ok ? {} : checked.errors)
    if (!checked.ok) return

    setIsSigningIn(true)
    setProblem(null)
    const result = await onSignIn(checked.data)
    setIsSigningIn(false)
    if (!result.ok) setProblem(result.message ?? null)
  }

  return (
    <ConnectLayout
      intro="Welcome back. Sign in with your work email."
      server={{ host: serverHost, workspaceName, onChange: onChangeServer }}
      title="Sign in"
    >
      <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <Field
          autoFocus
          autoComplete="email"
          error={errors.email}
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Field
          autoComplete="current-password"
          error={errors.password}
          hint="Forgot it? Ask your admin to reset it."
          label="Password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <FormProblem message={problem} />
        <Button
          className="w-full"
          loading={isSigningIn}
          size="lg"
          type="submit"
        >
          Sign in
        </Button>
      </form>
    </ConnectLayout>
  )
}
