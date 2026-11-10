import { useState, type FormEvent, type ReactNode } from 'react'

import { AiMagicIcon } from '@hugeicons/core-free-icons'
import type { TCallOutcome, TOwner } from '@open-sales/shared'
import { CALL_OUTCOME_LABELS, CALL_OUTCOMES } from '@open-sales/shared'

import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/controls'
import { DateField } from '@/components/ui/date-field'
import { Field } from '@/components/ui/field'
import { toIsoDay } from '@/lib/dates'

import { timeInputValue, toMoment } from './when'

type TFormFrameProps = {
  // Names the form to assistive tech: "Log a call".
  label: string
  problem: string | null
  // Cancel first, then the main action.
  buttons: ReactNode
  onSubmit: () => void
  children: ReactNode
}

/** The fields, what went wrong, and the buttons along the bottom right. */
const FormFrame = ({
  label,
  problem,
  buttons,
  onSubmit,
  children
}: TFormFrameProps) => (
  <form
    noValidate
    aria-label={label}
    className="flex flex-col gap-3"
    onSubmit={(event: FormEvent) => {
      event.preventDefault()
      onSubmit()
    }}
  >
    {children}
    {problem ? (
      <p className="m-0 text-sm text-destructive" role="alert">
        {problem}
      </p>
    ) : null}
    <div className="flex items-center justify-end gap-2">{buttons}</div>
  </form>
)

type TNoteFormProps = {
  // The text to start from, when correcting a note.
  initial?: string
  // "Save note" for a new one.
  submitLabel?: string
  placeholder?: string
  busy: boolean
  problem: string | null
  onSubmit: (body: string) => void
  onCancel: () => void
}

/** Writing a note, or correcting one. */
export const NoteForm = ({
  initial = '',
  submitLabel = 'Save note',
  placeholder = 'What happened, or what should the team know?',
  busy,
  problem,
  onSubmit,
  onCancel
}: TNoteFormProps) => {
  const [body, setBody] = useState(initial)
  const [missing, setMissing] = useState(false)

  return (
    <FormFrame
      buttons={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button loading={busy} type="submit">
            {submitLabel}
          </Button>
        </>
      }
      label="Write a note"
      problem={missing && !body.trim() ? 'Write the note first.' : problem}
      onSubmit={() => {
        if (!body.trim()) {
          setMissing(true)
          return
        }
        onSubmit(body)
      }}
    >
      <Field
        autoFocus
        aria-label="Note"
        kind="textarea"
        placeholder={placeholder}
        rows={4}
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
    </FormFrame>
  )
}

export type TCallInput = {
  occurredAt: string
  outcome: TCallOutcome
  body: string
  personIds: string[]
}

type TCallFormProps = {
  // The account's people, to pick who was on the call.
  people: { id: string; name: string }[]
  // Ticked to start with: the person whose page this is.
  defaultPersonIds?: string[]
  busy: boolean
  problem: string | null
  // `askAi` is "Save and ask AI": save, then hand the notes to the AI.
  onSubmit: (call: TCallInput, askAi: boolean) => void
  onCancel: () => void
  // Passed in so tests can fix the time.
  now?: Date
}

/** Logging a call: who was on it, when, how it went, and the notes. */
export const CallForm = ({
  people,
  defaultPersonIds = [],
  busy,
  problem,
  onSubmit,
  onCancel,
  now = new Date()
}: TCallFormProps) => {
  const [day, setDay] = useState(() => toIsoDay(now))
  const [time, setTime] = useState(() => timeInputValue(now))
  const [outcome, setOutcome] = useState<TCallOutcome>('connected')
  const [personIds, setPersonIds] = useState(defaultPersonIds)
  const [body, setBody] = useState('')
  const [badTime, setBadTime] = useState(false)
  // Which button was pressed, so only that one spins.
  const [asked, setAsked] = useState(false)

  const toggle = (id: string) =>
    setPersonIds((chosen) =>
      chosen.includes(id) ? chosen.filter((one) => one !== id) : [...chosen, id]
    )

  const submit = (askAi: boolean) => {
    const occurredAt = day ? toMoment(day, time) : null
    if (!occurredAt) {
      setBadTime(true)
      return
    }
    setBadTime(false)
    setAsked(askAi)
    onSubmit({ occurredAt, outcome, body, personIds }, askAi)
  }

  return (
    <FormFrame
      buttons={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            loading={busy && !asked}
            variant="secondary"
            onClick={() => submit(false)}
          >
            Save
          </Button>
          <Button leadIcon={AiMagicIcon} loading={busy && asked} type="submit">
            Save and ask AI
          </Button>
        </>
      }
      label="Log a call"
      problem={badTime ? 'Choose when the call happened.' : problem}
      onSubmit={() => submit(true)}
    >
      {people.length > 0 ? (
        <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
          <legend className="mb-1.5 p-0 text-body-sm font-semibold text-foreground">
            Who was on the call
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {people.map((person) => (
              <Chip
                key={person.id}
                active={personIds.includes(person.id)}
                onClick={() => toggle(person.id)}
              >
                {person.name}
              </Chip>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="grid grid-cols-3 gap-3">
        <DateField label="When" value={day} onChange={setDay} />
        <Field
          label="Time"
          type="time"
          value={time}
          onChange={(event) => setTime(event.target.value)}
        />
        <Field
          kind="select"
          label="How it went"
          options={CALL_OUTCOMES.map((value) => ({
            value,
            label: CALL_OUTCOME_LABELS[value]
          }))}
          value={outcome}
          onValueChange={(value) => setOutcome(value as TCallOutcome)}
        />
      </div>
      <Field
        hint="Paste or type what was said. “Save and ask AI” turns it into updates, tasks and a follow-up for you to approve."
        kind="textarea"
        label="Notes"
        placeholder="They want pricing for 25 seats by Friday…"
        rows={5}
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
    </FormFrame>
  )
}

export type TTaskInput = {
  title: string
  dueOn: string | null
  // Undefined leaves it with whoever has it (you, for a new task).
  assigneeId?: string
}

type TTaskFormProps = {
  // The task to change; none for a new one.
  initial?: { title: string; dueOn: string | null; assigneeId: string }
  // Who can take a task: everyone active on the team.
  users: TOwner[]
  busy: boolean
  problem: string | null
  onSubmit: (task: TTaskInput) => void
  onCancel: () => void
}

/** Adding a task, or changing one: what, by when, and for whom. */
export const TaskForm = ({
  initial,
  users,
  busy,
  problem,
  onSubmit,
  onCancel
}: TTaskFormProps) => {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [dueOn, setDueOn] = useState(initial?.dueOn ?? '')
  const [assigneeId, setAssigneeId] = useState(initial?.assigneeId ?? '')
  const [missing, setMissing] = useState(false)

  return (
    <FormFrame
      buttons={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button loading={busy} type="submit">
            {initial ? 'Save task' : 'Add task'}
          </Button>
        </>
      }
      label={initial ? 'Change the task' : 'Add a task'}
      problem={missing && !title.trim() ? 'Say what needs doing.' : problem}
      onSubmit={() => {
        if (!title.trim()) {
          setMissing(true)
          return
        }
        onSubmit({
          title,
          dueOn: dueOn || null,
          assigneeId: assigneeId || undefined
        })
      }}
    >
      <Field
        autoFocus
        label="What needs doing"
        placeholder="Send pricing to Tom"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <div className="grid grid-cols-2 gap-3">
        <DateField label="Due" value={dueOn} onChange={setDueOn} />
        <Field
          searchable
          kind="select"
          label="For"
          options={users.map((user) => ({ label: user.name, value: user.id }))}
          placeholder="Me"
          value={assigneeId}
          onValueChange={setAssigneeId}
        />
      </div>
    </FormFrame>
  )
}
