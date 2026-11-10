import { useState, type FormEvent } from 'react'

import type { TContractCandidate, TContractCreate } from '@open-sales/shared'
import {
  addMonthsToDay,
  contractCreateSchema,
  termMonths
} from '@open-sales/shared'

import { Button } from '@/components/ui/button'
import { DateField } from '@/components/ui/date-field'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { checkFields } from '@/lib/field-errors'
import { moneyInputValue, parseMoney } from '@/lib/money'

// How long contracts usually run, in months.
const TERMS = [
  { label: '1 month', value: '1' },
  { label: '3 months', value: '3' },
  { label: '6 months', value: '6' },
  { label: '1 year', value: '12' },
  { label: '2 years', value: '24' },
  { label: '3 years', value: '36' }
]

// Dates that don't make one of the usual terms.
const OTHER_TERM = { label: 'Another length', value: 'other' }

const FORM_ID = 'add-contract-form'

type TAddContractDialogProps = {
  // The won deal the contract starts from.
  candidate: TContractCandidate
  // While the contract is being saved.
  busy?: boolean
  // Why the last try didn't save, in people's words.
  problem?: string | null
  onClose: () => void
  onSubmit: (contract: TContractCreate) => void
}

/**
 * Turns a won deal into a contract: what it's worth, when it starts and
 * when it renews. Picking a term sets the renewal date; changing the
 * renewal date by hand is fine too.
 */
export const AddContractDialog = ({
  candidate,
  busy = false,
  problem,
  onClose,
  onSubmit
}: TAddContractDialogProps) => {
  const [value, setValue] = useState(moneyInputValue(candidate.valueMinor))
  const [startsOn, setStartsOn] = useState(candidate.suggestedStartsOn)
  const [renewsOn, setRenewsOn] = useState(candidate.suggestedRenewsOn)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const months = startsOn && renewsOn ? termMonths(startsOn, renewsOn) : null
  const isUsualTerm = TERMS.some((term) => term.value === String(months))

  // A new start date keeps the term, when the dates made a whole one.
  const handleStartChange = (next: string) => {
    setStartsOn(next)
    if (next && months) setRenewsOn(addMonthsToDay(next, months))
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const valueMinor = parseMoney(value)
    if (valueMinor === undefined) {
      setErrors({ valueMinor: 'Enter an amount like 12,500.' })
      return
    }
    const checked = checkFields(contractCreateSchema, {
      dealId: candidate.deal.id,
      startsOn,
      renewsOn,
      valueMinor: valueMinor ?? undefined
    })
    if (!checked.ok) {
      setErrors(checked.errors)
      return
    }
    setErrors({})
    onSubmit(checked.data)
  }

  return (
    <Dialog
      open
      description={`From the won deal “${candidate.deal.name}”. Its renewal shows on this page as the date gets close.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button form={FORM_ID} loading={busy} type="submit">
            Add contract
          </Button>
        </>
      }
      title={`Add a contract for ${candidate.company.name}`}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
    >
      <form
        noValidate
        className="flex flex-col gap-3"
        id={FORM_ID}
        onSubmit={handleSubmit}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field
            autoFocus
            error={errors.valueMinor}
            inputMode="decimal"
            label={`Value (${candidate.currency})`}
            placeholder="12,500"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <Field
            kind="select"
            label="Term"
            options={isUsualTerm ? TERMS : [...TERMS, OTHER_TERM]}
            value={isUsualTerm ? String(months) : OTHER_TERM.value}
            onValueChange={(next) => {
              if (next !== OTHER_TERM.value && startsOn) {
                setRenewsOn(addMonthsToDay(startsOn, Number(next)))
              }
            }}
          />
          <DateField
            error={errors.startsOn}
            label="Start date"
            value={startsOn}
            onChange={handleStartChange}
          />
          <DateField
            error={errors.renewsOn}
            label="Renewal date"
            value={renewsOn}
            onChange={setRenewsOn}
          />
        </div>
        {problem ? (
          <p className="m-0 text-sm text-destructive" role="alert">
            {problem}
          </p>
        ) : null}
      </form>
    </Dialog>
  )
}
