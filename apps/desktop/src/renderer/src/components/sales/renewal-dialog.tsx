import { useState } from 'react'

import { Link01Icon } from '@hugeicons/core-free-icons'

import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
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

export type TRenewalItem = {
  account: string
  value: number
  // yyyy-mm-dd, the day the contract ends.
  endDate: string
  owner: string
}

export type TRenewalResult =
  | { mode: 'start'; value: string; closeDate: string; stage: string }
  | { mode: 'wont'; reason: string }

type TRenewalFormProps = {
  item: TRenewalItem
  onClose: () => void
  onDone: (renewalResult: TRenewalResult) => void
}

const StartRenewalDialog = ({ item, onClose, onDone }: TRenewalFormProps) => {
  const [renewalValue, setRenewalValue] = useState(
    `$${item.value.toLocaleString('en-US')}`
  )
  const [closeDate, setCloseDate] = useState(item.endDate)
  const [stage, setStage] = useState('Proposal')

  return (
    <Dialog
      open
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!closeDate}
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
            label="Value"
            value={renewalValue}
            onChange={(changeEvent) =>
              setRenewalValue(changeEvent.target.value)
            }
          />
          <Field
            label="Close date"
            type="date"
            value={closeDate}
            onChange={(changeEvent) => setCloseDate(changeEvent.target.value)}
          />
          <Field
            kind="select"
            label="Stage"
            options={RENEWAL_STAGE_OPTIONS}
            value={stage}
            onValueChange={setStage}
          />
          <Field readOnly label="Owner" value={item.owner} />
        </div>
      </div>
    </Dialog>
  )
}

const WontRenewDialog = ({ item, onClose, onDone }: TRenewalFormProps) => {
  const [reason, setReason] = useState<string | null>(null)

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
            disabled={!reason}
            onClick={() => reason && onDone({ mode: 'wont', reason })}
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
        {WONT_RENEW_REASONS.map((reasonLabel) => (
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
