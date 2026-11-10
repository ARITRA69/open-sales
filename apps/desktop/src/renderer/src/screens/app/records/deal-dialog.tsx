import { useState } from 'react'

import type { TDeal, TOwner, TPipeline, TSessionUser } from '@open-sales/shared'
import { canReassign } from '@open-sales/shared'

import { Field } from '@/components/ui/field'
import type { TRecordsBridge } from '@/hooks/use-records'
import { moneyInputValue, parseMoney } from '@/lib/money'

import { CompanyField } from './company-field'
import { OwnerField } from './owner-field'
import { RecordDialog } from './record-dialog'

type TDealForm = {
  companyId: string
  name: string
  stageId: string
  value: string
  closeDate: string
  nextStep: string
  ownerId: string
  lostReasonId: string
  lostNote: string
}

const formOf = (
  deal: TDeal | null,
  pipeline: TPipeline,
  stageId?: string
): TDealForm => ({
  companyId: deal?.company.id ?? '',
  name: deal?.name ?? '',
  stageId: deal?.stageId ?? stageId ?? pipeline.stages[0]?.id ?? '',
  value: moneyInputValue(deal?.valueMinor ?? null),
  closeDate: deal?.closeDate ?? '',
  nextStep: deal?.nextStep ?? '',
  ownerId: deal?.owner.id ?? '',
  lostReasonId: deal?.lostReasonId ?? '',
  lostNote: deal?.lostNote ?? ''
})

type TDealDialogProps = {
  bridge: TRecordsBridge
  me: TSessionUser
  pipeline: TPipeline
  users: TOwner[]
  // Null to add one; `stageId` then picks its first stage.
  deal: TDeal | null
  stageId?: string
  onSaved: (deal: TDeal) => void
  onClose: () => void
}

/**
 * Adding or editing a deal. Moving it to Won or Lost happens here; Lost asks
 * why.
 */
export const DealDialog = ({
  bridge,
  me,
  pipeline,
  users,
  deal,
  stageId,
  onSaved,
  onClose
}: TDealDialogProps) => {
  const [current, setCurrent] = useState(deal)
  const [form, setForm] = useState(() => formOf(deal, pipeline, stageId))
  const set = (field: keyof TDealForm) => (value: string) =>
    setForm((previous) => ({ ...previous, [field]: value }))

  const stage = pipeline.stages.find((s) => s.id === form.stageId)
  const isLost = stage?.kind === 'lost'
  const currency = current?.currency ?? pipeline.currency
  // New deals go to the account's owner unless a manager picks someone.
  const mayChooseOwner = canReassign(me.role)

  const readForm = () => {
    if (!form.companyId) {
      return { ok: false as const, problem: 'Choose the account.' }
    }
    if (!form.name.trim()) {
      return { ok: false as const, problem: 'Name the deal.' }
    }
    const valueMinor = parseMoney(form.value)
    if (valueMinor === undefined) {
      return { ok: false as const, problem: 'Enter an amount like 12,500.' }
    }
    if (isLost && !form.lostReasonId) {
      return { ok: false as const, problem: 'Choose why it was lost.' }
    }
    return {
      ok: true as const,
      input: {
        ...(current ? {} : { companyId: form.companyId }),
        name: form.name,
        stageId: form.stageId,
        valueMinor,
        closeDate: form.closeDate || null,
        nextStep: form.nextStep,
        ...(mayChooseOwner && form.ownerId ? { ownerId: form.ownerId } : {}),
        ...(isLost
          ? { lostReasonId: form.lostReasonId, lostNote: form.lostNote }
          : {})
      }
    }
  }

  return (
    <RecordDialog
      bridge={bridge}
      kind="deals"
      noun="deal"
      readForm={readForm}
      record={current}
      title={current ? current.name : 'New deal'}
      onClose={onClose}
      onSaved={onSaved}
      onStale={(latest) => {
        setCurrent(latest)
        setForm(formOf(latest, pipeline))
      }}
    >
      {current ? (
        <Field readOnly label="Account" value={current.company.name} />
      ) : (
        <CompanyField
          bridge={bridge}
          current={null}
          value={form.companyId}
          onChange={set('companyId')}
        />
      )}
      <Field
        // A new deal starts at the account; an existing one at its name.
        autoFocus={Boolean(current)}
        label="Deal"
        placeholder="Platform rollout"
        value={form.name}
        onChange={(event) => set('name')(event.target.value)}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field
          kind="select"
          label="Stage"
          options={pipeline.stages.map((s) => ({ label: s.name, value: s.id }))}
          value={form.stageId}
          onValueChange={set('stageId')}
        />
        <Field
          inputMode="decimal"
          label={`Value (${currency})`}
          placeholder="12,500"
          value={form.value}
          onChange={(event) => set('value')(event.target.value)}
        />
        <Field
          label={
            stage && stage.kind !== 'open' ? 'Closed on' : 'Expected close'
          }
          type="date"
          value={form.closeDate}
          onChange={(event) => set('closeDate')(event.target.value)}
        />
        <OwnerField
          canChoose={mayChooseOwner}
          ownerName={current?.owner.name ?? 'The account’s owner'}
          users={users}
          value={form.ownerId}
          onChange={set('ownerId')}
        />
      </div>
      {isLost ? (
        <div className="grid grid-cols-2 gap-3">
          <Field
            kind="select"
            label="Why it was lost"
            options={pipeline.lostReasons.map((reason) => ({
              label: reason.label,
              value: reason.id
            }))}
            placeholder="Choose a reason"
            value={form.lostReasonId}
            onValueChange={set('lostReasonId')}
          />
          <Field
            label="Note"
            placeholder="Optional"
            value={form.lostNote}
            onChange={(event) => set('lostNote')(event.target.value)}
          />
        </div>
      ) : (
        <Field
          label="Next step"
          placeholder="Send pricing by Friday"
          value={form.nextStep}
          onChange={(event) => set('nextStep')(event.target.value)}
        />
      )}
    </RecordDialog>
  )
}
