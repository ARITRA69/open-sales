import { useState, type FormEvent } from 'react'

import type { TLead, TOwner, TSessionUser } from '@open-sales/shared'
import { canChangeAnything, leadCreateSchema } from '@open-sales/shared'

import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { PhoneField } from '@/components/ui/phone-field'
import { checkFields } from '@/lib/field-errors'

import type { TLeadsBridge } from './use-leads'

// The owner list's choice for "leave it for anyone to take".
export const NOBODY = 'nobody'

type TNewLeadForm = {
  name: string
  email: string
  phone: string
  companyName: string
  title: string
  message: string
  ownerId: string
}

type TNewLeadDialogProps = {
  bridge: TLeadsBridge
  me: TSessionUser
  users: TOwner[]
  onCreated: (lead: TLead) => void
  onClose: () => void
}

/**
 * Adding a lead by hand: someone met at an event, or who rang. It's yours
 * unless a manager or admin gives it to someone else.
 */
export const NewLeadDialog = ({
  bridge,
  me,
  users,
  onCreated,
  onClose
}: TNewLeadDialogProps) => {
  const [form, setForm] = useState<TNewLeadForm>({
    name: '',
    email: '',
    phone: '',
    companyName: '',
    title: '',
    message: '',
    ownerId: me.id
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [problem, setProblem] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const set = (field: keyof TNewLeadForm) => (value: string) =>
    setForm((previous) => ({ ...previous, [field]: value }))
  const mayChooseOwner = canChangeAnything(me.role) && users.length > 0

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const { ownerId, ...fields } = form
    const input = {
      ...fields,
      ownerId: mayChooseOwner && ownerId === NOBODY ? null : ownerId
    }
    const checked = checkFields(leadCreateSchema, input)
    setErrors(checked.ok ? {} : checked.errors)
    if (!checked.ok) return

    setIsSaving(true)
    const answer = await bridge.create(input)
    setIsSaving(false)
    if (answer.ok) onCreated(answer.data)
    else setProblem(answer.message)
  }

  return (
    <Dialog
      open
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button form="new-lead-form" loading={isSaving} type="submit">
            Add lead
          </Button>
        </>
      }
      title="New lead"
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <form
        noValidate
        className="flex flex-col gap-3"
        id="new-lead-form"
        onSubmit={handleSubmit}
      >
        <Field
          autoFocus
          error={errors.name}
          label="Name"
          placeholder="Dana Whitfield"
          value={form.name}
          onChange={(event) => set('name')(event.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            autoCapitalize="off"
            error={errors.email}
            label="Email"
            placeholder="dana@brightwell.co"
            spellCheck={false}
            type="email"
            value={form.email}
            onChange={(event) => set('email')(event.target.value)}
          />
          <PhoneField
            error={errors.phone}
            label="Phone"
            value={form.phone}
            onChange={set('phone')}
          />
          <Field
            error={errors.companyName}
            label="Company"
            placeholder="Brightwell Logistics"
            value={form.companyName}
            onChange={(event) => set('companyName')(event.target.value)}
          />
          <Field
            error={errors.title}
            label="Job title"
            placeholder="Operations Director"
            value={form.title}
            onChange={(event) => set('title')(event.target.value)}
          />
        </div>
        <Field
          error={errors.message}
          kind="textarea"
          label="What they said"
          placeholder="What they asked for, and where you met."
          rows={3}
          value={form.message}
          onChange={(event) => set('message')(event.target.value)}
        />
        {mayChooseOwner ? (
          <Field
            searchable
            kind="select"
            label="Owner"
            options={[
              { label: 'Nobody yet', value: NOBODY },
              ...users.map((user) => ({ label: user.name, value: user.id }))
            ]}
            value={form.ownerId}
            onValueChange={set('ownerId')}
          />
        ) : null}
        {problem ? (
          <p className="m-0 text-sm text-destructive" role="alert">
            {problem}
          </p>
        ) : null}
      </form>
    </Dialog>
  )
}
