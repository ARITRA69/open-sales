import { useEffect, useState, type ReactNode } from 'react'

import { Alert02Icon, LockIcon, Tick02Icon } from '@hugeicons/core-free-icons'
import type {
  TPipeline,
  TProposal,
  TProposalApprove,
  TProposalChange,
  TProposalValue
} from '@open-sales/shared'

import { Link } from '@/components/shared/link'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/controls'
import { DateField } from '@/components/ui/date-field'
import { Field } from '@/components/ui/field'
import { Icon } from '@/components/ui/icon'
import { Dot } from '@/components/ui/status'
import { moneyInputValue, parseMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

import {
  describeChange,
  engineName,
  fieldLabel,
  recordHref,
  recordWord,
  targetLine,
  timeAgo,
  type TChangeText
} from './proposal-format'
import type { TProposalCard } from './use-today'

/*
 * A change AI wants to make, and what a person decided about it. Built on the
 * UI kit for Today; the Ask panel has its own older card
 * (components/sales/ask/ask-proposal-card.tsx) and the two should become one.
 */

const CARD_CLASS =
  'group/card flex flex-col gap-2 rounded-card bg-accent-soft p-3 text-foreground'
const QUIET_ROW_CLASS = 'flex min-h-8 items-center gap-2 px-3 text-sm'
const LONG_TEXT_FIELDS = ['description', 'lostNote']
const MAX_TIMER_MS = 2 ** 31 - 1

type TProposalCardProps = {
  card: TProposalCard
  // Stages and lost reasons, for editing those values.
  pipeline?: TPipeline | null
  selected?: boolean
  // Another card is selected, so every checkbox shows.
  selecting?: boolean
  // Left out where cards can't be picked.
  onSelect?: (selected: boolean) => void
  onApprove: (input?: TProposalApprove) => void
  onDecline: (reason?: string) => void
  onUndo: () => void
  onSendToOwner: () => void
  // Passed in so tests can pick the time.
  now?: Date
}

/** True until the time to undo runs out. */
const useUndoOpen = (undoUntil: string | null) => {
  // The deadline that has passed, once its timer fires.
  const [passed, setPassed] = useState<string | null>(null)

  useEffect(() => {
    if (!undoUntil) return
    const timer = setTimeout(
      () => setPassed(undoUntil),
      // Timers can't wait longer than this; the real window is minutes.
      Math.min(Math.max(0, Date.parse(undoUntil) - Date.now()), MAX_TIMER_MS)
    )
    return () => clearTimeout(timer)
  }, [undoUntil])

  return undoUntil !== null && passed !== undoUntil
}

const toDraft = (change: TProposalChange) =>
  change.field === 'valueMinor'
    ? moneyInputValue(typeof change.to === 'number' ? change.to : null)
    : change.to === null
      ? ''
      : String(change.to)

/** What was typed, as the value to save; undefined when it isn't one. */
const fromDraft = (field: string, typed: string): TProposalValue | undefined =>
  field === 'valueMinor' ? parseMoney(typed) : typed.trim() || null

const RecordLink = ({ proposal }: { proposal: TProposal }) => {
  const href = recordHref(proposal.target)
  const line = targetLine(proposal.target)

  return href ? (
    <Link
      className="min-w-0 flex-none truncate rounded-sm text-body-sm text-muted-foreground no-underline transition-colors duration-150 outline-none hover:text-foreground keyboard-focus:shadow-(--halo-keyboard)"
      href={href}
    >
      {line}
    </Link>
  ) : (
    <span className="min-w-0 flex-none truncate text-body-sm text-muted-foreground">
      {line}
    </span>
  )
}

const Problem = ({ children }: { children: ReactNode }) =>
  children ? (
    <p className="m-0 text-body-sm text-destructive" role="alert">
      {children}
    </p>
  ) : null

/** One field: the old value crossed out beside the new one. */
const ChangeRow = ({ change }: { change: TChangeText }) => (
  <>
    <dt className="text-muted-foreground">{change.label}</dt>
    <dd className="m-0 min-w-0 wrap-break-word">
      {change.from ? (
        <>
          <s className="text-muted-foreground">{change.from}</s>{' '}
        </>
      ) : null}
      {change.to ? (
        <b className="font-semibold">{change.to}</b>
      ) : (
        <span className="text-muted-foreground">Empty</span>
      )}
    </dd>
  </>
)

/** A field someone changed after AI proposed: what it says now. */
const ConflictRow = ({ change }: { change: TChangeText }) => {
  if (change.current === change.to) {
    return (
      <>
        <dt className="text-muted-foreground">{change.label}</dt>
        <dd className="m-0 min-w-0 wrap-break-word">
          Already <b className="font-semibold">{change.to || 'empty'}</b>
        </dd>
      </>
    )
  }
  if (change.current === change.from) return <ChangeRow change={change} />

  return (
    <>
      <dt className="text-muted-foreground">{change.label}</dt>
      <dd className="m-0 min-w-0 wrap-break-word">
        Now <b className="font-semibold">{change.current || 'empty'}</b>, not{' '}
        <s className="text-muted-foreground">{change.from || 'empty'}</s>. AI
        proposed <b className="font-semibold">{change.to || 'empty'}</b>.
      </dd>
    </>
  )
}

const ROWS_CLASS =
  'm-0 grid grid-cols-[minmax(5.5rem,max-content)_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm'

type TEditFieldsProps = {
  proposal: TProposal
  pipeline?: TPipeline | null
  drafts: Record<string, string>
  errors: Record<string, string>
  onChange: (field: string, typed: string) => void
}

/** The proposed values as boxes to change before approving. */
const EditFields = ({
  proposal,
  pipeline,
  drafts,
  errors,
  onChange
}: TEditFieldsProps) => (
  <div className="grid grid-cols-2 gap-2">
    {proposal.changes.map((change) => {
      const { field } = change
      const label =
        field === 'valueMinor' && proposal.target.currency
          ? `${fieldLabel(field)} (${proposal.target.currency})`
          : fieldLabel(field)
      const value = drafts[field] ?? ''
      const error = errors[field]

      if (field === 'stageId' && pipeline) {
        return (
          <Field
            key={field}
            error={error}
            kind="select"
            label={label}
            options={pipeline.stages.map((stage) => ({
              label: stage.name,
              value: stage.id
            }))}
            value={value}
            onValueChange={(next) => onChange(field, next)}
          />
        )
      }
      if (field === 'lostReasonId' && pipeline) {
        return (
          <Field
            key={field}
            error={error}
            kind="select"
            label={label}
            options={pipeline.lostReasons.map((reason) => ({
              label: reason.label,
              value: reason.id
            }))}
            value={value}
            onValueChange={(next) => onChange(field, next)}
          />
        )
      }
      // Ids without a list to pick from stay as proposed.
      if (field.endsWith('Id')) {
        return (
          <Field
            key={field}
            readOnly
            label={label}
            value={change.toLabel ?? value}
          />
        )
      }
      if (field === 'closeDate') {
        return (
          <DateField
            key={field}
            error={error}
            label={label}
            value={value}
            onChange={(next) => onChange(field, next)}
          />
        )
      }
      if (LONG_TEXT_FIELDS.includes(field)) {
        return (
          <Field
            key={field}
            className="col-span-2"
            error={error}
            kind="textarea"
            label={label}
            value={value}
            onChange={(event) => onChange(field, event.target.value)}
          />
        )
      }
      return (
        <Field
          key={field}
          error={error}
          inputMode={field === 'valueMinor' ? 'decimal' : undefined}
          label={label}
          value={value}
          onChange={(event) => onChange(field, event.target.value)}
        />
      )
    })}
  </div>
)

/** A proposal on Today: approve, edit then approve, or decline with a reason. */
export const ProposalCard = ({
  card,
  pipeline,
  selected = false,
  selecting = false,
  onSelect,
  onApprove,
  onDecline,
  onUndo,
  onSendToOwner,
  now = new Date()
}: TProposalCardProps) => {
  const { proposal, busy, problem, noPermission } = card
  const [mode, setMode] = useState<'view' | 'edit' | 'decline'>('view')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const canUndo = useUndoOpen(proposal.undoUntil)

  const { title } = proposal
  const changes = proposal.changes.map((change) =>
    describeChange(change, proposal.target.currency)
  )
  const word = recordWord(proposal.target.type)

  if (proposal.status === 'approved') {
    return (
      <div className="flex flex-col gap-1">
        <div className={QUIET_ROW_CLASS}>
          <span className="flex size-4.5 flex-none items-center justify-center rounded-full bg-success text-primary-foreground">
            <Icon icon={Tick02Icon} size={13} strokeWidth={1.6} />
          </span>
          <span className="min-w-0 flex-1 truncate">Done: {title}</span>
          <RecordLink proposal={proposal} />
          {canUndo ? (
            <Button
              loading={busy === 'undo'}
              size="sm"
              variant="link"
              onClick={onUndo}
            >
              Undo
            </Button>
          ) : null}
        </div>
        {problem ? (
          <div className="px-3">
            <Problem>{problem}</Problem>
          </div>
        ) : null}
      </div>
    )
  }

  if (proposal.status === 'undone') {
    return (
      <p className={cn(QUIET_ROW_CLASS, 'm-0 text-muted-foreground')}>
        <span className="min-w-0 flex-1 truncate">
          Undone: {title}. The {word} is back as it was.
        </span>
      </p>
    )
  }

  if (proposal.status === 'declined') {
    return (
      <p className={cn(QUIET_ROW_CLASS, 'm-0 text-muted-foreground')}>
        <span className="min-w-0 flex-1 truncate">
          Declined: {title}. Nothing was saved.
        </span>
      </p>
    )
  }

  if (!proposal.canDecide) {
    return (
      <p className={cn(QUIET_ROW_CLASS, 'm-0 text-muted-foreground')}>
        <span className="min-w-0 flex-1 truncate">
          Sent to {proposal.approver.name} to decide: {title}
        </span>
      </p>
    )
  }

  const heading = (lead: ReactNode) => (
    <div className="flex items-center gap-2">
      {lead}
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
        {title}
      </span>
      <RecordLink proposal={proposal} />
    </div>
  )

  if (noPermission) {
    return (
      <div aria-label={title} className={CARD_CLASS} role="group">
        {heading(<Icon className="flex-none" icon={LockIcon} size={16} />)}
        <p className="m-0 text-sm">
          You can’t make this change any more. {noPermission} Send it to the{' '}
          {word}’s owner to decide.
        </p>
        <Problem>{problem}</Problem>
        <div className="flex items-center gap-2">
          <Button loading={busy === 'send'} size="sm" onClick={onSendToOwner}>
            Send to owner
          </Button>
          <Button
            className="ml-auto"
            loading={busy === 'decline'}
            size="sm"
            variant="ghost"
            onClick={() => onDecline()}
          >
            Dismiss
          </Button>
        </div>
      </div>
    )
  }

  if (proposal.status === 'out_of_date') {
    const hasFieldConflict = changes.some(
      (change) => change.current !== change.from
    )

    return (
      <div aria-label={title} className={CARD_CLASS} role="group">
        {heading(
          <Icon
            className="flex-none"
            icon={Alert02Icon}
            size={16}
            strokeWidth={1.6}
          />
        )}
        <p className="m-0 text-sm font-medium">
          {hasFieldConflict
            ? `This ${word} changed after AI proposed this. Nothing was saved.`
            : `Something else on this ${word} changed after AI proposed this. Check it still makes sense.`}
        </p>
        {changes.length > 0 ? (
          <dl className={ROWS_CLASS}>
            {changes.map((change) => (
              <ConflictRow key={change.field} change={change} />
            ))}
          </dl>
        ) : null}
        <Problem>{problem}</Problem>
        <div className="flex items-center gap-2">
          <Button
            loading={busy === 'approve'}
            size="sm"
            onClick={() =>
              onApprove({ version: proposal.target.version ?? undefined })
            }
          >
            Apply anyway
          </Button>
          <Button
            className="ml-auto"
            loading={busy === 'decline'}
            size="sm"
            variant="ghost"
            onClick={() => onDecline()}
          >
            Dismiss
          </Button>
        </div>
      </div>
    )
  }

  const startEditing = () => {
    setDrafts(
      Object.fromEntries(
        proposal.changes.map((change) => [change.field, toDraft(change)])
      )
    )
    setErrors({})
    setMode('edit')
  }

  /** Approves with whatever was changed in the boxes. */
  const approveEdited = () => {
    const edits: NonNullable<TProposalApprove['changes']> = []
    const problems: Record<string, string> = {}
    for (const change of proposal.changes) {
      const value = fromDraft(change.field, drafts[change.field] ?? '')
      if (value === undefined) {
        problems[change.field] = 'Enter an amount, like 12500'
      } else if (value !== change.to) {
        edits.push({ field: change.field, to: value })
      }
    }
    setErrors(problems)
    if (Object.keys(problems).length > 0) return
    onApprove(edits.length > 0 ? { changes: edits } : undefined)
  }

  const isSuggested = proposal.requestedBy.id !== proposal.approver.id
  const sourceLabel = proposal.sources.find((source) => source.label)?.label
  const meta = [
    isSuggested ? `Suggested by ${proposal.requestedBy.name}` : null,
    engineName(proposal.engine),
    sourceLabel ?? null,
    timeAgo(proposal.createdAt, now.getTime())
  ].filter(Boolean)
  const showsBox = selected || selecting

  return (
    <div
      aria-label={title}
      className={cn(
        CARD_CLASS,
        'transition-colors duration-150',
        selected && 'bg-secondary'
      )}
      data-selected={selected || undefined}
      role="group"
    >
      {heading(
        <span className="relative flex size-4 flex-none items-center justify-center">
          <span
            className={cn(
              'flex transition-opacity duration-150',
              onSelect &&
                (showsBox
                  ? 'opacity-0'
                  : 'group-focus-within/card:opacity-0 group-hover/card:opacity-0 pointer-coarse:opacity-0')
            )}
          >
            <Dot size="sm" tone="accent" />
          </span>
          {onSelect ? (
            <span
              className={cn(
                'absolute inset-0 flex items-center justify-center transition-opacity duration-150',
                showsBox
                  ? 'opacity-100'
                  : 'opacity-0 group-focus-within/card:opacity-100 group-hover/card:opacity-100 pointer-coarse:opacity-100'
              )}
            >
              <Checkbox
                aria-label={`Select ${title}`}
                checked={selected}
                onCheckedChange={(checked) => onSelect(checked === true)}
              />
            </span>
          ) : null}
        </span>
      )}
      {mode === 'edit' ? (
        <EditFields
          drafts={drafts}
          errors={errors}
          pipeline={pipeline}
          proposal={proposal}
          onChange={(field, typed) =>
            setDrafts((current) => ({ ...current, [field]: typed }))
          }
        />
      ) : changes.length > 0 ? (
        <dl className={ROWS_CLASS}>
          {changes.map((change) => (
            <ChangeRow key={change.field} change={change} />
          ))}
        </dl>
      ) : null}
      {proposal.kind === 'archive' ? (
        <p className="m-0 text-sm">
          The {word} moves to the archive. Restore brings it back.
        </p>
      ) : null}
      {proposal.why ? (
        <p className="m-0 text-body-sm text-foreground-soft">{proposal.why}</p>
      ) : null}
      <p className="m-0 text-body-sm text-muted-foreground">
        {meta.join(' · ')}
      </p>
      <Problem>{problem}</Problem>
      {mode === 'decline' ? (
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            onDecline(reason)
          }}
        >
          <Field
            autoFocus
            className="flex-1"
            label="Why? It helps AI next time (optional)"
            placeholder="Wrong deal"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <Button loading={busy === 'decline'} size="md" type="submit">
            Decline
          </Button>
          <Button size="md" variant="ghost" onClick={() => setMode('view')}>
            Cancel
          </Button>
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <Button
            loading={busy === 'approve'}
            size="sm"
            onClick={mode === 'edit' ? approveEdited : () => onApprove()}
          >
            Approve
          </Button>
          {mode === 'edit' ? (
            <Button size="sm" variant="white" onClick={() => setMode('view')}>
              Cancel
            </Button>
          ) : proposal.changes.length > 0 ? (
            <Button size="sm" variant="white" onClick={startEditing}>
              Edit
            </Button>
          ) : null}
          <Button
            className="ml-auto"
            size="sm"
            variant="ghost"
            onClick={() => setMode('decline')}
          >
            Decline
          </Button>
        </div>
      )}
    </div>
  )
}
