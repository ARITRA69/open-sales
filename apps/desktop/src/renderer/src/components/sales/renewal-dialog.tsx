import { useState } from 'react'

import { Link01Icon } from '@hugeicons/core-free-icons'

import { Button } from '@/components/ui/button'
import { DateField } from '@/components/ui/date-field'
import { Dialog } from '@/components/ui/dialog'
import { Field, type TSelectOption } from '@/components/ui/field'
import { Icon } from '@/components/ui/icon'
import { Banner } from '@/components/ui/kit'
import { cn } from '@/lib/utils'

const RENEWAL_STAGE_OPTIONS = ['Contacted', 'Demo booked', 'Trial', 'Proposal']

const WONT_RENEW_REASONS = [
  'No budget',
  'Chose another tool',
  'Stopped using it',
  'Company closed or merged'
]

// The last choice: a reason that isn't on the list, in the person's words.
const OTHER_REASON = 'Something else'

export type TRenewalItem = {
  account: string
  // In whole units of the currency: 36000 is $36,000.
  value: number
  // yyyy-mm-dd, the day the contract ends.
  endDate: string
  owner: string
  // ISO 4217. Named beside the value when given.
  currency?: string
  // The contract as it stands, like "5 Dec 2025 to 5 Dec 2026 (12 months)".
  term?: string
}

export type TRenewalResult =
  | { mode: 'start'; value: string; closeDate: string; stage: string }
  | { mode: 'wont'; reason: string }

type TRenewalFormProps = {
  item: TRenewalItem
  // The pipeline's stages a renewal can start in. The first is picked.
  stages?: (TSelectOption | string)[]
  // The reasons offered for "won't renew".
  reasons?: string[]
  // While the answer is being saved: the main button shows a spinner.
  busy?: boolean
  // Why the last try didn't save, in people's words.
  problem?: string | null
  onClose: () => void
  onDone: (renewalResult: TRenewalResult) => void
}

const stageValue = (stage: TSelectOption | string) =>
  typeof stage === 'string' ? stage : stage.value

/** 36000 → "36,000": grouped for reading, and still an amount when read back. */
const amountText = (value: number) =>
  value.toLocaleString('en-US', { maximumFractionDigits: 2 })

const Problem = ({ problem }: { problem?: string | null }) =>
  problem ? (
    <p className="m-0 text-sm text-destructive" role="alert">
      {problem}
    </p>
  ) : null

const StartRenewalDialog = ({
  item,
  stages,
  busy = false,
  problem,
  onClose,
  onDone
}: TRenewalFormProps) => {
  // With the app's own stages the first is picked; the sample ones start
  // where the design did.
  const stageOptions = stages ?? RENEWAL_STAGE_OPTIONS
  const [renewalValue, setRenewalValue] = useState(
    item.currency ? amountText(item.value) : `$${amountText(item.value)}`
  )
  const [closeDate, setCloseDate] = useState(item.endDate)
  const [stage, setStage] = useState(
    stages ? (stages[0] ? stageValue(stages[0]) : '') : 'Proposal'
  )

  return (
    <Dialog
      open
      description={item.term ? `Their contract runs ${item.term}.` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!closeDate}
            loading={busy}
            onClick={() =>
              onDone({
                mode: 'start',
                value: renewalValue,
                closeDate,
                stage
              })
            }
          >
            Start renewal
          </Button>
        </>
      }
      title={`Start the renewal for ${item.account}?`}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
    >
      <div className="flex flex-col gap-4">
        <Banner>
          <Icon
            className="flex-none"
            icon={Link01Icon}
            size={18}
            strokeWidth={1.6}
          />
          <span>
            This adds a new deal to the pipeline, linked to this contract. The
            current contract stays as it is until the renewal is won, and
            reminders stop.
          </span>
        </Banner>
        <div className="grid grid-cols-2 gap-3">
          <Field
            inputMode="decimal"
            label={item.currency ? `Value (${item.currency})` : 'Value'}
            value={renewalValue}
            onChange={(changeEvent) =>
              setRenewalValue(changeEvent.target.value)
            }
          />
          <DateField
            label="Close date"
            value={closeDate}
            onChange={setCloseDate}
          />
          <Field
            kind="select"
            label="Stage"
            options={stageOptions}
            value={stage}
            onValueChange={setStage}
          />
          <Field readOnly label="Owner" value={item.owner} />
        </div>
        <Problem problem={problem} />
      </div>
    </Dialog>
  )
}

const WontRenewDialog = ({
  item,
  reasons = WONT_RENEW_REASONS,
  busy = false,
  problem,
  onClose,
  onDone
}: TRenewalFormProps) => {
  const [reason, setReason] = useState<string | null>(null)
  const [otherReason, setOtherReason] = useState('')

  const isOther = reason === OTHER_REASON
  const chosen = isOther ? otherReason.trim() : reason

  return (
    <Dialog
      open
      description="Reminders stop for this contract. You can change your mind at any time before it ends."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!chosen}
            loading={busy}
            onClick={() => chosen && onDone({ mode: 'wont', reason: chosen })}
          >
            Mark as won&apos;t renew
          </Button>
        </>
      }
      title={`Why won't ${item.account} renew?`}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
    >
      <div className="flex flex-col gap-1.5">
        {[...reasons, OTHER_REASON].map((reasonLabel) => (
          <button
            key={reasonLabel}
            aria-pressed={reason === reasonLabel}
            className={cn(
              'sales-choice w-full rounded-row border-none px-3 py-2 text-left text-sm font-medium outline-none keyboard-focus:shadow-(--halo-keyboard)',
              reason === reasonLabel
                ? 'bg-background shadow-(--shadow-choice)'
                : 'bg-muted hover:bg-secondary'
            )}
            type="button"
            onClick={() => setReason(reasonLabel)}
          >
            {reasonLabel}
          </button>
        ))}
        {isOther ? (
          <Field
            autoFocus
            aria-label="The reason"
            maxLength={500}
            placeholder="What did they say?"
            value={otherReason}
            onChange={(changeEvent) => setOtherReason(changeEvent.target.value)}
          />
        ) : null}
        <Problem problem={problem} />
      </div>
    </Dialog>
  )
}

type TRenewalDialogProps = TRenewalFormProps & {
  mode: 'start' | 'wont'
}

/** Starts a renewal as a normal deal linked to the old one, or records why not. */
export const RenewalDialog = ({ mode, ...formProps }: TRenewalDialogProps) =>
  mode === 'start' ? (
    <StartRenewalDialog {...formProps} />
  ) : (
    <WontRenewDialog {...formProps} />
  )
