import { useState, type FormEvent } from 'react'

import type { TLead, TOwner } from '@open-sales/shared'

import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/controls'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'

import type { TApiResult } from '../../../../../preload/bridge-types'
import { countLeads } from './lead-labels'
import { NOBODY } from './new-lead-dialog'
import type { TLeadsBridge } from './use-leads'

/** How a change to several leads went: who changed, and why some didn't. */
export type TBulkOutcome = {
  changed: TLead[]
  // The first refusal's reason, in the server's words.
  failed: number
  problem: string | null
}

/** Makes the same change to each lead in turn, and says how it went. */
export const changeEach = async (
  leads: TLead[],
  change: (lead: TLead) => Promise<TApiResult<TLead>>
): Promise<TBulkOutcome> => {
  const outcome: TBulkOutcome = { changed: [], failed: 0, problem: null }
  for (const lead of leads) {
    const answer = await change(lead)
    if (answer.ok) {
      outcome.changed.push(answer.data)
    } else {
      outcome.failed += 1
      outcome.problem ??= answer.message
    }
  }
  return outcome
}

/** "3 leads disqualified. 1 couldn’t be: …", for the bar at the bottom. */
export const describeOutcome = (outcome: TBulkOutcome, done: string) => {
  const parts: string[] = []
  if (outcome.changed.length > 0) {
    parts.push(`${countLeads(outcome.changed.length)} ${done}.`)
  }
  if (outcome.failed > 0) {
    parts.push(
      `${outcome.changed.length > 0 ? `${outcome.failed} couldn’t be` : `Couldn’t change ${countLeads(outcome.failed)}`}: ${outcome.problem}`
    )
  }
  return parts.join(' ')
}

const QUICK_REASONS = ['Not a fit', 'No budget', 'Duplicate', 'Spam']

type TDisqualifyDialogProps = {
  bridge: TLeadsBridge
  // One lead, or everything selected in the inbox.
  leads: TLead[]
  onDone: (outcome: TBulkOutcome) => void
  onClose: () => void
}

/** Turning leads away, with the reason kept on each. */
export const DisqualifyDialog = ({
  bridge,
  leads,
  onDone,
  onClose
}: TDisqualifyDialogProps) => {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [isSaving, setIsSaving] = useState(false)
  const [only] = leads

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!reason.trim()) {
      setError('Say why, in a few words.')
      return
    }
    setIsSaving(true)
    const outcome = await changeEach(leads, (lead) =>
      bridge.disqualify(lead.id, { version: lead.version, reason })
    )
    setIsSaving(false)
    // One lead that was refused: say why here, where they can fix it.
    if (leads.length === 1 && outcome.failed === 1) {
      setError(outcome.problem ?? undefined)
      return
    }
    onDone(outcome)
  }

  return (
    <Dialog
      open
      description={
        leads.length === 1
          ? 'It leaves the inbox. You can reopen it later.'
          : 'They leave the inbox. You can reopen them later.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button form="disqualify-form" loading={isSaving} type="submit">
            Disqualify
          </Button>
        </>
      }
      title={
        leads.length === 1
          ? `Disqualify ${only.name}`
          : `Disqualify ${countLeads(leads.length)}`
      }
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <form
        noValidate
        className="flex flex-col gap-3"
        id="disqualify-form"
        onSubmit={handleSubmit}
      >
        <Field
          autoFocus
          error={error}
          label="Why"
          placeholder="Too small for us right now"
          value={reason}
          onChange={(event) => {
            setReason(event.target.value)
            setError(undefined)
          }}
        />
        <div className="flex flex-wrap gap-1.5">
          {QUICK_REASONS.map((quick) => (
            <Chip
              key={quick}
              active={reason === quick}
              onClick={() => {
                setReason(quick)
                setError(undefined)
              }}
            >
              {quick}
            </Chip>
          ))}
        </div>
      </form>
    </Dialog>
  )
}

type TAssignDialogProps = {
  bridge: TLeadsBridge
  leads: TLead[]
  users: TOwner[]
  onDone: (outcome: TBulkOutcome) => void
  onClose: () => void
}

/** A manager giving the selected leads to one teammate, or to nobody. */
export const AssignDialog = ({
  bridge,
  leads,
  users,
  onDone,
  onClose
}: TAssignDialogProps) => {
  const [ownerId, setOwnerId] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [isSaving, setIsSaving] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!ownerId) {
      setError('Choose who gets them.')
      return
    }
    setIsSaving(true)
    const outcome = await changeEach(leads, (lead) =>
      bridge.assign(lead.id, {
        version: lead.version,
        ownerId: ownerId === NOBODY ? null : ownerId
      })
    )
    setIsSaving(false)
    onDone(outcome)
  }

  return (
    <Dialog
      open
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button form="assign-form" loading={isSaving} type="submit">
            Assign
          </Button>
        </>
      }
      title={`Assign ${countLeads(leads.length)}`}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <form
        noValidate
        className="flex flex-col gap-3"
        id="assign-form"
        onSubmit={handleSubmit}
      >
        <Field
          searchable
          error={error}
          kind="select"
          label="Assign to"
          options={[
            ...users.map((user) => ({ label: user.name, value: user.id })),
            { label: 'Nobody (back to unassigned)', value: NOBODY }
          ]}
          placeholder="Choose a teammate"
          value={ownerId}
          onValueChange={(value) => {
            setOwnerId(value)
            setError(undefined)
          }}
        />
      </form>
    </Dialog>
  )
}
