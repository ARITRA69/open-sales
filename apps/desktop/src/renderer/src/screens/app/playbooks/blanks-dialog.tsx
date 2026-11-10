import { useState, type FormEvent } from 'react'

import type { TPlaybookBlank } from '@open-sales/shared'

import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/controls'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'

type TBlanksDialogProps = {
  playbookName: string
  blanks: TPlaybookBlank[]
  // What the main button says: "Run playbook", or "Try it".
  confirmLabel?: string
  // The answers, keyed by each blank's name.
  onRun: (answers: Record<string, string>) => void
  onClose: () => void
}

const FORM_ID = 'playbook-blanks-form'

/**
 * Asks a playbook's blanks before it runs: a choice where the playbook gives
 * options, a box to type in where it doesn't. Every blank needs an answer.
 */
export const PlaybookBlanksDialog = ({
  playbookName,
  blanks,
  confirmLabel = 'Run playbook',
  onRun,
  onClose
}: TBlanksDialogProps) => {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [showMissing, setShowMissing] = useState(false)

  const answerOf = (blank: TPlaybookBlank) => answers[blank.name]?.trim() ?? ''
  const setAnswer = (blank: TPlaybookBlank, answer: string) =>
    setAnswers((current) => ({ ...current, [blank.name]: answer }))

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (blanks.some((blank) => !answerOf(blank))) {
      setShowMissing(true)
      return
    }
    onRun(
      Object.fromEntries(blanks.map((blank) => [blank.name, answerOf(blank)]))
    )
  }

  return (
    <Dialog
      open
      description="Answer these first. Your answers go into the playbook’s steps."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button form={FORM_ID} type="submit">
            {confirmLabel}
          </Button>
        </>
      }
      title={playbookName}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        id={FORM_ID}
        onSubmit={handleSubmit}
      >
        {blanks.map((blank, index) => {
          const isMissing = showMissing && !answerOf(blank)
          const questionId = `${FORM_ID}-question-${index}`

          if (blank.options.length === 0) {
            return (
              <Field
                key={blank.name}
                error={isMissing ? 'Type an answer' : undefined}
                label={blank.question}
                value={answers[blank.name] ?? ''}
                onChange={(event) => setAnswer(blank, event.target.value)}
              />
            )
          }

          return (
            <div
              key={blank.name}
              aria-labelledby={questionId}
              className="flex flex-col gap-1.5"
              role="group"
            >
              <span
                className="text-body-sm font-semibold text-foreground"
                id={questionId}
              >
                {blank.question}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {blank.options.map((option) => (
                  <Chip
                    key={option}
                    active={answers[blank.name] === option}
                    onClick={() => setAnswer(blank, option)}
                  >
                    {option}
                  </Chip>
                ))}
              </div>
              {isMissing ? (
                <p className="m-0 text-body-sm text-destructive">Choose one</p>
              ) : null}
            </div>
          )
        })}
      </form>
    </Dialog>
  )
}
