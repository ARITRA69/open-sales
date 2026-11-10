import { useState, type FormEvent, type ReactNode } from 'react'

import type { TDeal, TDealUpdate, TPipeline } from '@open-sales/shared'

import { Button } from '@/components/ui/button'
import { DateField } from '@/components/ui/date-field'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import type { TRecordsBridge } from '@/hooks/use-records'
import { toIsoDay } from '@/lib/dates'
import { moneyInputValue, parseMoney } from '@/lib/money'

type TCloseDealProps = {
  bridge: TRecordsBridge
  deal: TDeal
  pipeline: TPipeline
  // With the deal as the server now has it: won or lost.
  onClosed: (deal: TDeal) => void
  // Nothing changed. A card dropped on Won or Lost goes back.
  onCancel: () => void
}

/**
 * Sends the close as one change against the version on screen. If someone
 * changed the deal first, it says so and loads their version to try again.
 */
const useCloseDeal = (
  bridge: TRecordsBridge,
  deal: TDeal,
  onStale?: (latest: TDeal) => void
) => {
  const [current, setCurrent] = useState(deal)
  const [problem, setProblem] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const close = async (
    changes: Omit<TDealUpdate, 'version'>,
    onClosed: (deal: TDeal) => void
  ) => {
    setIsBusy(true)
    const answer = await bridge.update('deals', current.id, {
      ...changes,
      version: current.version
    })
    if (answer.ok) {
      setIsBusy(false)
      onClosed(answer.data)
      return
    }
    if (answer.code === 'changed_since') {
      const latest = await bridge.get('deals', current.id)
      if (latest.ok) {
        setCurrent(latest.data)
        onStale?.(latest.data)
      }
    }
    setIsBusy(false)
    setProblem(answer.message)
  }

  return { current, problem, setProblem, isBusy, close }
}

type TCloseDialogFrameProps = {
  deal: TDeal
  outcome: 'won' | 'lost'
  description: string
  formId: string
  isBusy: boolean
  canSubmit?: boolean
  problem: string | null
  onSubmit: () => void
  onCancel: () => void
  children: ReactNode
}

/** What both closing dialogs share: the title, buttons and who may close. */
const CloseDialogFrame = ({
  deal,
  outcome,
  description,
  formId,
  isBusy,
  canSubmit = true,
  problem,
  onSubmit,
  onCancel,
  children
}: TCloseDialogFrameProps) => {
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!isBusy && canSubmit) onSubmit()
  }

  return (
    <Dialog
      open
      description={
        deal.canEdit
          ? description
          : // Someone else's deal: say whose, quietly, rather than fail.
            `Owned by ${deal.owner.name}. Only they, the account’s owner, a manager or an admin can close this deal.`
      }
      footer={
        deal.canEdit ? (
          <>
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              disabled={!canSubmit}
              form={formId}
              loading={isBusy}
              type="submit"
            >
              {outcome === 'won' ? 'Mark as won' : 'Mark as lost'}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onCancel}>
            Close
          </Button>
        )
      }
      title={`Close ${deal.name} as ${outcome}`}
      onOpenChange={(isOpen) => {
        if (!isOpen) onCancel()
      }}
    >
      {deal.canEdit ? (
        <form
          noValidate
          className="flex flex-col gap-3"
          id={formId}
          onSubmit={handleSubmit}
        >
          {children}
          {problem ? (
            <p className="m-0 text-sm text-destructive" role="alert">
              {problem}
            </p>
          ) : null}
        </form>
      ) : null}
    </Dialog>
  )
}

/** Closing a deal as won: confirm what it was finally worth, and the day. */
export const WonDealDialog = ({
  bridge,
  deal,
  pipeline,
  onClosed,
  onCancel
}: TCloseDealProps) => {
  const [value, setValue] = useState(moneyInputValue(deal.valueMinor))
  // The day it actually closed, which is most often today.
  const [closeDate, setCloseDate] = useState(() => toIsoDay(new Date()))
  const { current, problem, setProblem, isBusy, close } = useCloseDeal(
    bridge,
    deal,
    (latest) => setValue(moneyInputValue(latest.valueMinor))
  )
  const wonStage = pipeline.stages.find((stage) => stage.kind === 'won')

  const handleSubmit = () => {
    const valueMinor = parseMoney(value)
    if (valueMinor === undefined) {
      setProblem('Enter an amount like 12,500.')
      return
    }
    if (!closeDate) {
      setProblem('Choose the day it closed.')
      return
    }
    if (!wonStage) {
      setProblem('This pipeline has no Won stage. Ask an admin to add one.')
      return
    }
    void close({ stageId: wonStage.id, valueMinor, closeDate }, onClosed)
  }

  return (
    <CloseDialogFrame
      deal={current}
      description="Confirm the final value and the day it closed."
      formId="won-deal-form"
      isBusy={isBusy}
      outcome="won"
      problem={problem}
      onCancel={onCancel}
      onSubmit={handleSubmit}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field
          autoFocus
          inputMode="decimal"
          label={`Final value (${current.currency})`}
          placeholder="12,500"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <DateField
          label="Closed on"
          value={closeDate}
          onChange={setCloseDate}
        />
      </div>
    </CloseDialogFrame>
  )
}

/** Closing a deal as lost: why, from the workspace's reasons, and a note. */
export const LostDealDialog = ({
  bridge,
  deal,
  pipeline,
  onClosed,
  onCancel
}: TCloseDealProps) => {
  const [lostReasonId, setLostReasonId] = useState(deal.lostReasonId ?? '')
  const [lostNote, setLostNote] = useState(deal.lostNote ?? '')
  const { current, problem, setProblem, isBusy, close } = useCloseDeal(
    bridge,
    deal
  )
  const lostStage = pipeline.stages.find((stage) => stage.kind === 'lost')
  const hasReasons = pipeline.lostReasons.length > 0

  const handleSubmit = () => {
    if (!lostReasonId) {
      setProblem('Choose why it was lost.')
      return
    }
    if (!lostStage) {
      setProblem('This pipeline has no Lost stage. Ask an admin to add one.')
      return
    }
    void close({ stageId: lostStage.id, lostReasonId, lostNote }, onClosed)
  }

  return (
    <CloseDialogFrame
      canSubmit={hasReasons}
      deal={current}
      description={
        hasReasons
          ? 'Say why, so reports can show what loses deals.'
          : 'There are no lost reasons to choose from yet. Ask an admin to add some in Settings.'
      }
      formId="lost-deal-form"
      isBusy={isBusy}
      outcome="lost"
      problem={problem}
      onCancel={onCancel}
      onSubmit={handleSubmit}
    >
      {hasReasons ? (
        <>
          <Field
            kind="select"
            label="Why it was lost"
            options={pipeline.lostReasons.map((reason) => ({
              label: reason.label,
              value: reason.id
            }))}
            placeholder="Choose a reason"
            value={lostReasonId}
            onValueChange={(reasonId) => {
              setLostReasonId(reasonId)
              setProblem(null)
            }}
          />
          <Field
            kind="textarea"
            label="Note (optional)"
            placeholder="Anything worth remembering next time"
            value={lostNote}
            onChange={(event) => setLostNote(event.target.value)}
          />
        </>
      ) : null}
    </CloseDialogFrame>
  )
}
