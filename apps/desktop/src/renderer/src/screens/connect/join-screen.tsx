import { useState, type FormEvent } from 'react'

import { joinFormSchema, MIN_PASSWORD_LENGTH } from '@open-sales/shared'

import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { checkFields } from '@/lib/field-errors'

import { ConnectLayout, FormProblem } from './connect-layout'

type TJoinScreenProps = {
  serverHost: string
  workspaceName: string | null
  onJoin: (input: {
    name: string
    email: string
    password: string
  }) => Promise<{ ok: boolean; message?: string }>
  onCancel: () => void
}

const EMPTY = { name: '', email: '', password: '' }

/** Opened the team's join link: the person picks a name and password. */
export const JoinScreen = ({
  serverHost,
  workspaceName,
  onJoin,
  onCancel
}: TJoinScreenProps) => {
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [problem, setProblem] = useState<string | null>(null)
  const [isJoining, setIsJoining] = useState(false)

  const setValue = (field: keyof typeof EMPTY) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors(({ [field]: _cleared, ...rest }) => rest)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const checked = checkFields(joinFormSchema, values)
    if (!checked.ok) {
      setErrors(checked.errors)
      return
    }

    setIsJoining(true)
    setProblem(null)
    const result = await onJoin(checked.data)
    setIsJoining(false)
    if (!result.ok) setProblem(result.message ?? null)
  }

  return (
    <ConnectLayout
      intro="Pick your name and a password. Use your work email: it may let you straight in."
      server={{ host: serverHost, workspaceName, onChange: onCancel }}
      title={`Join ${workspaceName ?? 'your team'}`}
    >
      <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <Field
          autoFocus
          autoComplete="name"
          error={errors.name}
          label="Your name"
          value={values.name}
          onChange={(event) => setValue('name')(event.target.value)}
        />
        <Field
          autoComplete="email"
          error={errors.email}
          label="Work email"
          type="email"
          value={values.email}
          onChange={(event) => setValue('email')(event.target.value)}
        />
        <Field
          autoComplete="new-password"
          error={errors.password}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          label="Password"
          type="password"
          value={values.password}
          onChange={(event) => setValue('password')(event.target.value)}
        />
        <FormProblem message={problem} />
        <Button className="w-full" loading={isJoining} size="lg" type="submit">
          Join
        </Button>
      </form>
    </ConnectLayout>
  )
}
