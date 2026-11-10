import { useState, type DragEvent } from 'react'

import { Add01Icon } from '@hugeicons/core-free-icons'
import type { TDeal, TSessionUser, TStage } from '@open-sales/shared'
import { motion } from 'motion/react'

import { PageBody } from '@/components/sales/app-shell'
import { Avatar } from '@/components/ui/bits'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatePanel } from '@/components/ui/state-panel'
import { StatusDot } from '@/components/ui/status'
import type { TRecordsBridge } from '@/hooks/use-records'
import { useCall } from '@/hooks/use-records'
import { daysSince } from '@/lib/dates'
import { getInitials } from '@/lib/initials'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

import { DealDialog } from './deal-dialog'

const CARD_SPRING = {
  type: 'spring' as const,
  stiffness: 480,
  damping: 40,
  mass: 0.8
}

// What a card being dragged carries.
const DRAG_TYPE = 'application/x-deal-id'

/** Days since anything happened on a deal, if that's longer than its stage allows. */
const idleDays = (deal: TDeal, stage: TStage) => {
  if (stage.stalledAfterDays === null) return null
  const since = [deal.lastActivityAt, deal.stageEnteredAt]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1)
  const days = since ? daysSince(since) : 0
  return days > stage.stalledAfterDays ? days : null
}

type TDealCardProps = {
  deal: TDeal
  stage: TStage
  onOpen: () => void
}

const DealCard = ({ deal, stage, onOpen }: TDealCardProps) => {
  const idle = idleDays(deal, stage)

  return (
    <motion.li
      layout
      className="list-none"
      layoutId={deal.id}
      transition={CARD_SPRING}
    >
      <button
        className={cn(
          'flex w-full flex-col gap-1 rounded-panel bg-background p-2.5 text-left text-foreground outline-none',
          'shadow-(--shadow-tile) transition-shadow duration-200 hover:shadow-(--shadow-tile-hover) keyboard-focus:shadow-(--halo-keyboard)',
          deal.canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
        )}
        draggable={deal.canEdit}
        type="button"
        onClick={onOpen}
        onDragStart={(event) => {
          event.dataTransfer.setData(DRAG_TYPE, deal.id)
          event.dataTransfer.effectAllowed = 'move'
        }}
      >
        <span className="truncate text-sm font-semibold">{deal.name}</span>
        <span className="truncate text-body-sm text-muted-foreground">
          {deal.company.name}
        </span>
        <span className="mt-1 flex items-center gap-2">
          <span className="text-body-sm font-semibold tabular-nums">
            {formatMoney(deal.valueMinor, deal.currency)}
          </span>
          <span className="flex-1" />
          {idle !== null ? (
            <StatusDot dotSize="sm" variant="meta">
              {`Idle ${idle}d`}
            </StatusDot>
          ) : null}
          <Avatar initials={getInitials(deal.owner.name)} size={24} />
        </span>
      </button>
    </motion.li>
  )
}

type TPipelinePageProps = {
  bridge: TRecordsBridge
  me: TSessionUser
}

/** Open deals by stage. Drag a card to move it; click it to edit or close. */
export const PipelinePage = ({ bridge, me }: TPipelinePageProps) => {
  const pipeline = useCall(bridge.getPipeline)
  const board = useCall(bridge.getBoard)
  const users = useCall(bridge.listUsers)
  // Cards moved but not yet saved: deal id → stage, at the version moved from.
  const [moves, setMoves] = useState<
    Record<string, { stageId: string; version: number }>
  >({})
  const [problem, setProblem] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [open, setOpen] = useState<
    { deal: TDeal } | { stageId?: string } | null
  >(null)

  const stageOf = (deal: TDeal) => {
    const moved = moves[deal.id]
    // Once the board reloads, the deal's version moves on and this lapses.
    return moved && moved.version === deal.version
      ? moved.stageId
      : deal.stageId
  }

  const moveDeal = async (deal: TDeal, stageId: string) => {
    if (stageOf(deal) === stageId) return
    setMoves((previous) => ({
      ...previous,
      [deal.id]: { stageId, version: deal.version }
    }))
    const answer = await bridge.update('deals', deal.id, {
      stageId,
      version: deal.version
    })
    setProblem(answer.ok ? null : answer.message)
    if (!answer.ok) {
      // Put the card back where the server says it is.
      setMoves((previous) => {
        const { [deal.id]: _undone, ...rest } = previous
        return rest
      })
    }
    board.reload()
  }

  const deals = board.data?.columns.flatMap((column) => column.deals) ?? []
  const openStages =
    pipeline.data?.stages.filter((stage) => stage.kind === 'open') ?? []
  const currency = pipeline.data?.currency ?? 'USD'

  const handleDrop = (event: DragEvent, stageId: string) => {
    event.preventDefault()
    setDropTarget(null)
    const deal = deals.find(
      (candidate) => candidate.id === event.dataTransfer.getData(DRAG_TYPE)
    )
    if (deal) void moveDeal(deal, stageId)
  }

  const isLoading = pipeline.state === 'loading' || board.state === 'loading'
  const loadProblem = pipeline.problem ?? board.problem

  return (
    <PageBody>
      <PageHeader
        actions={
          <Button
            disabled={!pipeline.data}
            leadIcon={Add01Icon}
            size="lg"
            onClick={() => setOpen({})}
          >
            New deal
          </Button>
        }
        subtitle="Open deals, by stage. Drag a card to move it."
        title="Pipeline"
      />
      {problem ? (
        <p className="m-0 text-sm text-destructive" role="alert">
          {problem}
        </p>
      ) : null}
      {isLoading ? (
        <StatePanel kind="loading" />
      ) : loadProblem ? (
        <StatePanel
          kind="error"
          onAction={() => {
            pipeline.reload()
            board.reload()
          }}
        />
      ) : (
        <div className="-mx-6 flex min-h-0 scrollbar-thin gap-3 overflow-x-auto px-6 pb-2">
          {openStages.map((stage) => {
            const inStage = deals.filter((deal) => stageOf(deal) === stage.id)
            const total = inStage
              .filter((deal) => deal.currency === currency)
              .reduce((sum, deal) => sum + (deal.valueMinor ?? 0), 0)
            return (
              <section
                key={stage.id}
                aria-label={stage.name}
                className={cn(
                  'flex w-64 flex-none flex-col gap-2 rounded-card p-2 transition-colors duration-200',
                  dropTarget === stage.id ? 'bg-secondary' : 'bg-muted'
                )}
                onDragLeave={(event) => {
                  if (
                    !event.currentTarget.contains(event.relatedTarget as Node)
                  )
                    setDropTarget(null)
                }}
                onDragOver={(event) => {
                  if (!event.dataTransfer.types.includes(DRAG_TYPE)) return
                  event.preventDefault()
                  setDropTarget(stage.id)
                }}
                onDrop={(event) => handleDrop(event, stage.id)}
              >
                <header className="flex items-baseline gap-2 px-1 pt-0.5">
                  <h2 className="m-0 truncate text-sm font-semibold">
                    {stage.name}
                  </h2>
                  <span className="text-body-sm text-muted-foreground tabular-nums">
                    {inStage.length}
                  </span>
                  <span className="flex-1" />
                  <span className="text-body-sm text-muted-foreground tabular-nums">
                    {formatMoney(total, currency, { compact: true })}
                  </span>
                </header>
                <ul className="m-0 flex min-h-16 flex-col gap-1.5 p-0">
                  {inStage.map((deal) => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      stage={stage}
                      onOpen={() => setOpen({ deal })}
                    />
                  ))}
                </ul>
                <Button
                  className="self-start"
                  disabled={!pipeline.data}
                  leadIcon={Add01Icon}
                  size="sm"
                  variant="ghost"
                  onClick={() => setOpen({ stageId: stage.id })}
                >
                  Add deal
                </Button>
              </section>
            )
          })}
        </div>
      )}
      {open && pipeline.data ? (
        <DealDialog
          key={'deal' in open ? open.deal.id : 'new'}
          bridge={bridge}
          deal={'deal' in open ? open.deal : null}
          me={me}
          pipeline={pipeline.data}
          stageId={'stageId' in open ? open.stageId : undefined}
          users={users.data ?? []}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null)
            board.reload()
          }}
        />
      ) : null}
    </PageBody>
  )
}
