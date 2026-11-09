import { useState, type FormEvent } from 'react'

import { MIN_PASSWORD_LENGTH, setupRequestSchema } from '@open-sales/shared'

import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { checkFields } from '@/lib/field-errors'

import { ConnectLayout, FormProblem } from './connect-layout'

type TCreateAdminScreenProps = {
  serverHost: string
  onCreate: (input: {
    workspaceName: string
    name: string
    email: string
    password: string
  }) => Promise<{ ok: boolean; message?: string }>
  onChangeServer: () => void
}

const EMPTY = { workspaceName: '', name: '', email: '', password: '' }

/** A new server: the first person names the workspace and becomes its admin. */
export const CreateAdminScreen = ({
  serverHost,
  onCreate,
  onChangeServer
}: TCreateAdminScreenProps) => {
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [problem, setProblem] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const setValue = (field: keyof typeof EMPTY) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors(({ [field]: _cleared, ...rest }) => rest)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const checked = checkFields(setupRequestSchema, values)
    if (!checked.ok) {
      setErrors(checked.errors)
      return
    }

    setIsSaving(true)
    setProblem(null)
    const result = await onCreate(checked.data)
    setIsSaving(false)
    if (!result.ok) setProblem(result.message ?? null)
  }

  return (
    <ConnectLayout
      intro="You’re the first person here. You’ll run this workspace and invite your team."
      server={{
        host: serverHost,
        workspaceName: null,
        onChange: onChangeServer
      }}
      step={{ current: 2, total: 2 }}
      title="Create the admin account"
    >
      <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <Field
          autoFocus
          error={errors.workspaceName}
          label="Workspace name"
          placeholder="Your company"
          value={values.workspaceName}
          onChange={(event) => setValue('workspaceName')(event.target.value)}
        />
        <Field
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
        <Button className="w-full" loading={isSaving} size="lg" type="submit">
          Create account
        </Button>
      </form>
    </ConnectLayout>
  )
}
