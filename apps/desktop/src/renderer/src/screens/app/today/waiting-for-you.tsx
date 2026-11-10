import { useState } from 'react'

import { CheckmarkCircle02Icon } from '@hugeicons/core-free-icons'
import type { TPipeline } from '@open-sales/shared'
import { AnimatePresence, motion } from 'motion/react'

import { Button } from '@/components/ui/button'
import { FloatBar } from '@/components/ui/float-bar'
import { StatePanel } from '@/components/ui/state-panel'
import { NumberBadge } from '@/components/ui/status'

import { askAi } from './ask'
import { ProposalCard } from './proposal-card'
import { needsDecision, type TTodayControls } from './use-today'

const CATCH_UP = 'Catch me up on my pipeline'

type TWaitingForYouProps = {
  today: TTodayControls
  // Stages and lost reasons, for editing a proposed value.
  pipeline?: TPipeline | null
}

/**
 * The proposals AI made for this person. Approve, edit or decline each, or
 * tick several and approve them together from the bar.
 */
export const WaitingForYou = ({ today, pipeline }: TWaitingForYouProps) => {
  const [picked, setPicked] = useState<string[]>([])

  // Only what can be approved as it stands: an out-of-date card needs a look.
  const canPick = (id: string) =>
    today.cards.some(
      (card) =>
        card.proposal.id === id &&
        needsDecision(card) &&
        card.proposal.status === 'pending' &&
        !card.noPermission
    )
  const selection = picked.filter(canPick)

  const decideAll = (decide: (id: string) => Promise<boolean>) => {
    const ids = selection
    setPicked([])
    // One after another, so each card shows its own result.
    void (async () => {
      for (const id of ids) await decide(id)
    })()
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="m-0 flex items-center gap-2 text-sm font-semibold">
        Waiting for you
        {today.waitingCount > 0 ? (
          <NumberBadge>{today.waitingCount}</NumberBadge>
        ) : null}
      </h2>
      {today.state === 'loading' ? (
        <StatePanel kind="loading" />
      ) : today.state === 'error' ? (
        <StatePanel
          body={today.problem ?? undefined}
          kind="error"
          onAction={() => void today.reload()}
        />
      ) : today.cards.length === 0 ? (
        <StatePanel
          action={CATCH_UP}
          body="When AI proposes changes or follow-ups come due, they’ll show here."
          icon={CheckmarkCircle02Icon}
          title="You’re all caught up"
          onAction={() => askAi({ prompt: CATCH_UP })}
        />
      ) : (
        <>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            <AnimatePresence initial={false} mode="popLayout">
              {today.cards.map((card) => {
                const { id } = card.proposal
                return (
                  <motion.li
                    key={id}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    initial={{ opacity: 0 }}
                    layout="position"
                    transition={{
                      layout: { type: 'spring', stiffness: 520, damping: 42 },
                      opacity: { duration: 0.15 }
                    }}
                  >
                    <ProposalCard
                      card={card}
                      pipeline={pipeline}
                      selected={selection.includes(id)}
                      selecting={selection.length > 0}
                      onApprove={(input) => void today.approve(id, input)}
                      onDecline={(reason) => void today.decline(id, reason)}
                      onSelect={
                        canPick(id)
                          ? (isPicked) =>
                              setPicked((current) =>
                                isPicked
                                  ? [...current, id]
                                  : current.filter((other) => other !== id)
                              )
                          : undefined
                      }
                      onSendToOwner={() => void today.sendToOwner(id)}
                      onUndo={() => void today.undo(id)}
                    />
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
          {today.hasMore ? (
            <Button
              className="self-start"
              size="sm"
              variant="secondary"
              onClick={() => void today.loadMore()}
            >
              Show more
            </Button>
          ) : null}
        </>
      )}
      <AnimatePresence>
        {selection.length > 0 ? (
          <div
            key="bar"
            className="pointer-events-none sticky bottom-4 z-30 mt-1 flex justify-center"
          >
            <FloatBar
              actions={[
                { label: 'Approve', onClick: () => decideAll(today.approve) },
                { label: 'Decline', onClick: () => decideAll(today.decline) }
              ]}
              count={selection.length}
              kind="select"
              onClose={() => setPicked([])}
            />
          </div>
        ) : null}
      </AnimatePresence>
    </section>
  )
}
