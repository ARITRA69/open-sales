import { Alert02Icon, Tick02Icon } from '@hugeicons/core-free-icons'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemHeader,
  ItemMedia,
  ItemTitle
} from '@/components/ui/item'
import { Dot } from '@/components/ui/status'

import type { TAskCard, TAskTurn } from './ask-types'
import type { TAskSession } from './use-ask-session'

type TAskProposalCardProps = {
  askCard: TAskCard
  turn: TAskTurn
  session: TAskSession
}

/**
 * A change AI wants to make, and what a person decided about it. This is the
 * Confirmation from shadcn's AI Elements: an Item with the buttons that
 * decide it.
 */
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
      <Item size="sm">
        <ItemMedia variant="done">
          <Icon icon={Tick02Icon} size={13} strokeWidth={1.6} />
        </ItemMedia>
        <ItemContent>
          {askCard.doneText || `Approved: ${askCard.title}`}
        </ItemContent>
        <ItemActions>
          <Button
            size="sm"
            variant="link"
            onClick={() => session.undoCard(turn, askCard)}
          >
            Undo
          </Button>
        </ItemActions>
      </Item>
    )
  }

  if (cardStatus === 'declined') {
    return (
      <Item size="sm">
        <ItemContent>
          <ItemDescription>
            Declined: {askCard.title}. Nothing was saved.
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button
            size="sm"
            variant="link"
            onClick={() => session.undoCard(turn, askCard)}
          >
            Undo
          </Button>
        </ItemActions>
      </Item>
    )
  }

  if (cardStatus === 'conflict') {
    return (
      <Item role="alert" variant="accent">
        <ItemHeader>
          <ItemMedia>
            <Icon icon={Alert02Icon} size={16} strokeWidth={1.6} />
          </ItemMedia>
          <ItemTitle>This changed after AI proposed it</ItemTitle>
        </ItemHeader>
        <ItemContent>
          <span>
            AI proposed moving from{' '}
            <b className="font-semibold">{rows[0]?.from}</b>, but this deal is
            now in <b className="font-semibold">{session.liveStage}</b>. Nothing
            was saved.
          </span>
        </ItemContent>
        <ItemFooter>
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
        </ItemFooter>
      </Item>
    )
  }

  return (
    <Item aria-label={askCard.title} role="group" variant="accent">
      <ItemHeader>
        <ItemMedia>
          <Dot size="sm" tone="accent" />
        </ItemMedia>
        <ItemTitle>{askCard.title}</ItemTitle>
      </ItemHeader>
      <ItemContent>
        {rows.map((row, rowIndex) => (
          <div key={row.label} className="flex flex-col gap-0.5">
            <ItemDescription>{row.label}</ItemDescription>
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
          <span className="text-body-sm text-foreground-soft">
            {askCard.why}
          </span>
        ) : null}
      </ItemContent>
      <ItemFooter>
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
      </ItemFooter>
    </Item>
  )
}
