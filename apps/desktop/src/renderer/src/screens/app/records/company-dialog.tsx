import { useState } from 'react'

import type { TCompany, TOwner, TSessionUser } from '@open-sales/shared'
import { canReassign } from '@open-sales/shared'

import { Field } from '@/components/ui/field'
import type { TRecordsBridge } from '@/hooks/use-records'

import { OwnerField } from './owner-field'
import { RecordDialog } from './record-dialog'

type TCompanyForm = {
  name: string
  domain: string
  industry: string
  description: string
  ownerId: string
}

const formOf = (company: TCompany | null, me: TSessionUser): TCompanyForm => ({
  name: company?.name ?? '',
  domain: company?.domain ?? '',
  industry: company?.industry ?? '',
  description: company?.description ?? '',
  ownerId: company?.owner.id ?? me.id
})

type TCompanyDialogProps = {
  bridge: TRecordsBridge
  me: TSessionUser
  users: TOwner[]
  // Null to add one.
  company: TCompany | null
  onSaved: (company: TCompany) => void
  onClose: () => void
}

/** Adding or editing an account. */
export const CompanyDialog = ({
  bridge,
  me,
  users,
  company,
  onSaved,
  onClose
}: TCompanyDialogProps) => {
  const [current, setCurrent] = useState(company)
  const [form, setForm] = useState(() => formOf(company, me))
  const set = (field: keyof TCompanyForm) => (value: string) =>
    setForm((previous) => ({ ...previous, [field]: value }))

  return (
    <RecordDialog
      bridge={bridge}
      kind="companies"
      noun="account"
      readForm={() =>
        form.name.trim()
          ? { ok: true, input: { ...form } }
          : { ok: false, problem: 'Enter the company’s name.' }
      }
      record={current}
      title={current ? current.name : 'New account'}
      onClose={onClose}
      onSaved={onSaved}
      onStale={(latest) => {
        setCurrent(latest)
        setForm(formOf(latest, me))
      }}
    >
      <Field
        autoFocus={!current}
        label="Name"
        placeholder="Halden Capital"
        value={form.name}
        onChange={(event) => set('name')(event.target.value)}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field
          autoCapitalize="off"
          hint="Matches people and emails to this account."
          label="Website"
          placeholder="halden.com"
          spellCheck={false}
          value={form.domain}
          onChange={(event) => set('domain')(event.target.value)}
        />
        <Field
          label="Industry"
          placeholder="Financial services"
          value={form.industry}
          onChange={(event) => set('industry')(event.target.value)}
        />
      </div>
      <OwnerField
        canChoose={canReassign(me.role)}
        ownerName={current?.owner.name ?? me.name}
        users={users}
        value={form.ownerId}
        onChange={set('ownerId')}
      />
      <Field
        kind="textarea"
        label="About"
        placeholder="What they do, and why they might buy."
        rows={3}
        value={form.description}
        onChange={(event) => set('description')(event.target.value)}
      />
    </RecordDialog>
  )
}
