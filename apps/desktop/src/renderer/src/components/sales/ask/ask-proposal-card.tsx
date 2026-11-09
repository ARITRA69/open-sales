import { Alert02Icon, Tick02Icon } from '@hugeicons/core-free-icons'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Dot } from '@/components/ui/status'

import type { TAskCard, TAskTurn } from './ask-types'
import type { TAskSession } from './use-ask-session'

const PROPOSAL_CLASS = 'bg-accent-soft rounded-card flex flex-col gap-2 p-3'

type TAskProposalCardProps = {
  askCard: TAskCard
  turn: TAskTurn
  session: TAskSession
}

/** A change AI wants to make, and what a person decided about it. */
export const AskProposalCard = ({
  askCard,
  turn,
  session
}: TAskProposalCardProps) => {
  const cardKey = `${turn.id}:${askCard.id}`
  const cardStatus = session.cardStatuses[cardKey] ?? 'pending'
  const isEditing = Boolean(session.editingCards[cardKey])
  const rows = session.rowsWithEdits(cardKey, askCard.rows)

  if (cardStatus === 'approved') {
    return (
      <div className="flex min-h-8 items-center gap-2 text-sm">
        <span className="flex size-4.5 flex-none items-center justify-center rounded-full bg-success text-primary-foreground">
          <Icon icon={Tick02Icon} size={13} strokeWidth={1.6} />
        </span>
        <span className="min-w-0 flex-1">
          {askCard.doneText || `Approved: ${askCard.title}`}
        </span>
        <Button
          size="sm"
          variant="link"
          onClick={() => session.undoCard(turn, askCard)}
        >
          Undo
        </Button>
      </div>
    )
  }

  if (cardStatus === 'declined') {
    return (
      <div className="flex min-h-8 items-center justify-between gap-2 text-body-sm text-muted-foreground">
        <span>Declined: {askCard.title}. Nothing was saved.</span>
        <Button
          size="sm"
          variant="link"
          onClick={() => session.undoCard(turn, askCard)}
        >
          Undo
        </Button>
      </div>
    )
  }

  if (cardStatus === 'conflict') {
    return (
      <div className={PROPOSAL_CLASS} role="alert">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Icon icon={Alert02Icon} size={16} strokeWidth={1.6} />
          This changed after AI proposed it
        </span>
        <span className="text-sm">
          AI proposed moving from{' '}
          <b className="font-semibold">{rows[0]?.from}</b>, but this deal is now
          in <b className="font-semibold">{session.liveStage}</b>. Nothing was
          saved.
        </span>
        <span className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => session.approveCard(turn, askCard, true)}
          >
            Apply anyway
          </Button>
          <Button
            className="ml-auto"
            size="sm"
            variant="ghost"
            onClick={() => session.declineCard(cardKey)}
          >
            Dismiss
          </Button>
        </span>
      </div>
    )
  }

  return (
    <div aria-label={askCard.title} className={PROPOSAL_CLASS} role="group">
      <span className="flex items-center gap-2 text-sm font-semibold">
        <Dot size="sm" tone="accent" />
        {askCard.title}
      </span>
      {rows.map((row, rowIndex) => (
        <div key={row.label} className="flex flex-col gap-0.5 text-sm">
          <span className="text-body-sm text-muted-foreground">
            {row.label}
          </span>
          {isEditing ? (
            <Input
              aria-label={row.label}
              value={row.to}
              onChange={(changeEvent) =>
                session.editRow(cardKey, rowIndex, changeEvent.target.value)
              }
            />
          ) : (
            <span>
              {row.from ? (
                <>
                  <span className="text-muted-foreground line-through">
                    {row.from}
                  </span>{' '}
                </>
              ) : null}
              <b className="font-semibold">{row.to}</b>
            </span>
          )}
        </div>
      ))}
      {askCard.why ? (
        <span className="text-body-sm text-foreground-soft">{askCard.why}</span>
      ) : null}
      <span className="flex items-center gap-2">
        <Button size="sm" onClick={() => session.approveCard(turn, askCard)}>
          Approve
        </Button>
        <Button
          size="sm"
          variant="white"
          onClick={() => session.toggleEditing(cardKey)}
        >
          {isEditing ? 'Done editing' : 'Edit'}
        </Button>
        <Button
          className="ml-auto"
          size="sm"
          variant="ghost"
          onClick={() => session.declineCard(cardKey)}
        >
          Decline
        </Button>
      </span>
    </div>
  )
}
