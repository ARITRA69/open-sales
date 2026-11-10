import { useState, type DragEvent, type ReactNode } from 'react'

import { Add01Icon } from '@hugeicons/core-free-icons'
import type { TDeal, TStage } from '@open-sales/shared'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Dot } from '@/components/ui/status'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

import { DEAL_DRAG_TYPE, DealCard } from './deal-card'
import { totalValue } from './pipeline-filters'

type TColumnProps = {
  stage: TStage
  isDropTarget: boolean
  onTarget: (stageId: string | null) => void
  onDropDeal: (dealId: string) => void
  className?: string
  children: ReactNode
}

/** A stage's column: somewhere to drop a card. */
const BoardColumn = ({
  stage,
  isDropTarget,
  onTarget,
  onDropDeal,
  className,
  children
}: TColumnProps) => {
  const handleDrop = (event: DragEvent) => {
    event.preventDefault()
    onTarget(null)
    const dealId = event.dataTransfer.getData(DEAL_DRAG_TYPE)
    if (dealId) onDropDeal(dealId)
  }

  return (
    <section
      aria-label={stage.name}
      className={cn(
        'flex flex-none flex-col gap-2 rounded-card p-2 transition-colors duration-200',
        isDropTarget ? 'bg-secondary' : 'bg-muted',
        className
      )}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          onTarget(null)
        }
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(DEAL_DRAG_TYPE)) return
        event.preventDefault()
        onTarget(stage.id)
      }}
      onDrop={handleDrop}
    >
      {children}
    </section>
  )
}

type TDealBoardProps = {
  // Every stage of the pipeline, to look up a deal's own stage.
  stages: TStage[]
  // The open stages to show as columns, in order.
  columns: TStage[]
  // The deals to show, already filtered.
  deals: TDeal[]
  // Which column a deal sits in right now: where it was just dropped, even
  // before that's saved.
  stageOf: (deal: TDeal) => string
  currency: string
  canAdd: boolean
  onOpen: (deal: TDeal) => void
  // The "+" on a stage's column.
  onAdd: (stageId: string) => void
  // A card dropped on a column, Won and Lost included.
  onMove: (deal: TDeal, stage: TStage) => void
}

/**
 * Open deals by stage, each column headed by its count and value. Won and
 * Lost sit at the end as places to drop a deal that's finished.
 */
export const DealBoard = ({
  stages,
  columns,
  deals,
  stageOf,
  currency,
  canAdd,
  onOpen,
  onAdd,
  onMove
}: TDealBoardProps) => {
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const closedStages = stages.filter((stage) => stage.kind !== 'open')
  const stageById = new Map(stages.map((stage) => [stage.id, stage]))

  const dropOn = (stage: TStage) => (dealId: string) => {
    const deal = deals.find((candidate) => candidate.id === dealId)
    if (deal) onMove(deal, stage)
  }

  const cardsIn = (stage: TStage) =>
    deals
      .filter((deal) => stageOf(deal) === stage.id)
      .map((deal) => (
        <DealCard
          key={deal.id}
          deal={deal}
          stage={stageById.get(deal.stageId)}
          onOpen={() => onOpen(deal)}
        />
      ))

  return (
    <div
      className="-mx-6 flex min-h-0 scrollbar-thin items-start gap-3 overflow-x-auto px-6 pb-2"
      data-slot="deal-board"
    >
      {columns.map((stage) => {
        const inStage = deals.filter((deal) => stageOf(deal) === stage.id)
        return (
          <BoardColumn
            key={stage.id}
            className="w-60"
            isDropTarget={dropTarget === stage.id}
            stage={stage}
            onDropDeal={dropOn(stage)}
            onTarget={setDropTarget}
          >
            <header className="flex items-center gap-2 pl-1">
              <h2 className="m-0 truncate text-sm font-semibold">
                {stage.name}
              </h2>
              <span
                aria-label={`${inStage.length} ${inStage.length === 1 ? 'deal' : 'deals'}`}
                className="text-body-sm text-muted-foreground tabular-nums"
              >
                {inStage.length}
              </span>
              <span className="flex-1" />
              <span className="text-body-sm text-muted-foreground tabular-nums">
                {formatMoney(totalValue(inStage, currency), currency, {
                  compact: true
                })}
              </span>
              <Button
                aria-label={`New deal in ${stage.name}`}
                disabled={!canAdd}
                lead={<Icon icon={Add01Icon} />}
                size="sm"
                variant="ghost"
                onClick={() => onAdd(stage.id)}
              />
            </header>
            <ul className="m-0 flex min-h-16 flex-col gap-1.5 p-0">
              {cardsIn(stage)}
            </ul>
          </BoardColumn>
        )
      })}
      {closedStages.length > 0 ? (
        <div className="flex w-44 flex-none flex-col gap-3">
          {closedStages.map((stage) => (
            <BoardColumn
              key={stage.id}
              isDropTarget={dropTarget === stage.id}
              stage={stage}
              onDropDeal={dropOn(stage)}
              onTarget={setDropTarget}
            >
              <header className="flex h-7 items-center gap-2 pl-1">
                <Dot tone={stage.kind === 'won' ? 'success' : 'faint'} />
                <h2 className="m-0 truncate text-sm font-semibold">
                  {stage.name}
                </h2>
              </header>
              <ul className="m-0 flex flex-col gap-1.5 p-0 empty:hidden">
                {cardsIn(stage)}
              </ul>
              <p className="m-0 px-1 pb-1 text-body-sm text-muted-foreground">
                {stage.kind === 'won'
                  ? 'Drop a deal here once it’s won.'
                  : 'Drop a deal here if it’s lost.'}
              </p>
            </BoardColumn>
          ))}
        </div>
      ) : null}
    </div>
  )
}
