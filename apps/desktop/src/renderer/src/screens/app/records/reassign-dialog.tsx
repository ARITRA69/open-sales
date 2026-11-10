import { useId, useState } from 'react'

import type { TCompany, TDeal, TOwner } from '@open-sales/shared'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/controls'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import type { TRecordsBridge } from '@/hooks/use-records'

type TReassignDialogProps = {
  bridge: TRecordsBridge
  company: TCompany
  // Everyone who can own an account.
  users: TOwner[]
  // The open deals the current owner has on this account.
  openDeals: TDeal[]
  // With the account as it now is.
  onDone: (company: TCompany) => void
  onClose: () => void
}

/**
 * Giving an account to someone else, with or without its open deals. Only
 * managers and admins see it; the server checks again.
 */
export const ReassignDialog = ({
  bridge,
  company,
  users,
  openDeals,
  onDone,
  onClose
}: TReassignDialogProps) => {
  const checkboxId = useId()
  const [ownerId, setOwnerId] = useState('')
  const [withDeals, setWithDeals] = useState(true)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const choices = users.filter((user) => user.id !== company.owner.id)
  const newOwner = choices.find((user) => user.id === ownerId)
  const dealWord = openDeals.length === 1 ? 'open deal' : 'open deals'

  const handleReassign = async () => {
    if (!newOwner) {
      setProblem('Choose who takes this account.')
      return
    }
    setBusy(true)
    const moved = await bridge.update('companies', company.id, {
      ownerId: newOwner.id,
      version: company.version
    })
    if (!moved.ok) {
      setBusy(false)
      setProblem(moved.message)
      return
    }

    // The server moves the old owner's open deals with the account. To leave
    // them, each one is handed back.
    let stuck = 0
    if (!withDeals) {
      for (const deal of openDeals) {
        const latest = await bridge.get('deals', deal.id)
        const back = latest.ok
          ? await bridge.update('deals', deal.id, {
              ownerId: company.owner.id,
              version: latest.data.version
            })
          : latest
        if (!back.ok) stuck += 1
      }
    }
    setBusy(false)
    if (stuck > 0) {
      setProblem(
        `${newOwner.name} now owns this account, but ${stuck} of its deals moved too. Change their owner on each deal.`
      )
      return
    }
    onDone(moved.data)
  }

  return (
    <Dialog
      open
      description={`${company.owner.name} owns it now. History and activity stay where they are.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => void handleReassign()}>
            Reassign
          </Button>
        </>
      }
      title={`Reassign ${company.name}`}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <div className="flex flex-col gap-3">
        <Field
          searchable
          kind="select"
          label="New owner"
          options={choices.map((user) => ({
            label: user.name,
            value: user.id
          }))}
          placeholder="Choose a teammate"
          value={ownerId}
          onValueChange={setOwnerId}
        />
        {openDeals.length > 0 ? (
          <div className="flex items-center gap-2">
            <Checkbox
              checked={withDeals}
              id={checkboxId}
              onCheckedChange={(checked) => setWithDeals(checked === true)}
            />
            <label className="text-sm text-foreground" htmlFor={checkboxId}>
              {`Move its ${openDeals.length} ${dealWord} too`}
            </label>
          </div>
        ) : null}
        {problem ? (
          <p className="m-0 text-sm text-destructive" role="alert">
            {problem}
          </p>
        ) : null}
      </div>
    </Dialog>
  )
}
