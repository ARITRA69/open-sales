import { useState } from 'react'

import type { TPerson } from '@open-sales/shared'
import { toE164 } from '@open-sales/shared'

import { Field } from '@/components/ui/field'
import { PhoneField } from '@/components/ui/phone-field'
import type { TRecordsBridge } from '@/hooks/use-records'

import { CompanyField } from './company-field'
import { RecordDialog } from './record-dialog'

type TPersonForm = {
  companyId: string
  name: string
  title: string
  email: string
  phone: string
  linkedinUrl: string
}

const formOf = (person: TPerson | null): TPersonForm => ({
  companyId: person?.company.id ?? '',
  name: person?.name ?? '',
  title: person?.title ?? '',
  email: person?.email ?? '',
  phone: person?.phone ?? '',
  linkedinUrl: person?.linkedinUrl ?? ''
})

type TPersonDialogProps = {
  bridge: TRecordsBridge
  // Null to add one.
  person: TPerson | null
  onSaved: (person: TPerson) => void
  onClose: () => void
}

/** Adding or editing a contact. Everyone belongs to an account. */
export const PersonDialog = ({
  bridge,
  person,
  onSaved,
  onClose
}: TPersonDialogProps) => {
  const [current, setCurrent] = useState(person)
  const [form, setForm] = useState(() => formOf(person))
  const set = (field: keyof TPersonForm) => (value: string) =>
    setForm((previous) => ({ ...previous, [field]: value }))

  return (
    <RecordDialog
      bridge={bridge}
      kind="people"
      noun="person"
      readForm={() => {
        if (!form.companyId) {
          return { ok: false, problem: 'Choose which account they work at.' }
        }
        if (!form.name.trim()) {
          return { ok: false, problem: 'Enter their name.' }
        }
        if (form.phone && !toE164(form.phone)) {
          return {
            ok: false,
            problem: 'Finish the phone number, or clear it.'
          }
        }
        return { ok: true, input: { ...form } }
      }}
      record={current}
      title={current ? current.name : 'New person'}
      onClose={onClose}
      onSaved={onSaved}
      onStale={(latest) => {
        setCurrent(latest)
        setForm(formOf(latest))
      }}
    >
      <CompanyField
        bridge={bridge}
        current={current?.company ?? null}
        value={form.companyId}
        onChange={set('companyId')}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Name"
          placeholder="Priya Nair"
          value={form.name}
          onChange={(event) => set('name')(event.target.value)}
        />
        <Field
          label="Job title"
          placeholder="Head of Operations"
          value={form.title}
          onChange={(event) => set('title')(event.target.value)}
        />
        <Field
          autoCapitalize="off"
          label="Email"
          placeholder="priya@halden.com"
          spellCheck={false}
          type="email"
          value={form.email}
          onChange={(event) => set('email')(event.target.value)}
        />
        <PhoneField
          label="Phone"
          placeholder="Phone number"
          value={form.phone}
          onChange={set('phone')}
        />
      </div>
      <Field
        autoCapitalize="off"
        label="LinkedIn"
        placeholder="https://linkedin.com/in/…"
        spellCheck={false}
        value={form.linkedinUrl}
        onChange={(event) => set('linkedinUrl')(event.target.value)}
      />
    </RecordDialog>
  )
}
