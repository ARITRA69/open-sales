import { useState } from 'react'

import { Add01Icon } from '@hugeicons/core-free-icons'
import type {
  TDeal,
  TDealCreateWithPeople,
  TSessionUser,
  TStage
} from '@open-sales/shared'
import { AnimatePresence } from 'motion/react'

import { PageBody } from '@/components/sales/app-shell'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatePanel } from '@/components/ui/state-panel'
import type { TRecordsBridge } from '@/hooks/use-records'
import { useCall } from '@/hooks/use-records'
import { formatMoney } from '@/lib/money'

import type { TApiResult } from '../../../../../preload/bridge-types'
import { LostDealDialog, WonDealDialog } from '../pipeline/close-deal-dialog'
import { DealBoard } from '../pipeline/deal-board'
import { DealList } from '../pipeline/deal-list'
import { sortDeals, type TDealSort } from '../pipeline/deal-sort'
import { NewDealPanel, type TNewDealStart } from '../pipeline/new-deal-panel'
import {
  filterDeals,
  startingFilters,
  totalValue
} from '../pipeline/pipeline-filters'
import { PipelineToolbar } from '../pipeline/pipeline-toolbar'
import { usePipelineView } from '../pipeline/use-pipeline-view'
import { DealDialog } from './deal-dialog'

type TPipelinePageProps = {
  bridge: TRecordsBridge
  me: TSessionUser
  // Saves a new deal with its people. It's the app's own bridge unless a
  // test or the preview passes another; without one, people are left out.
  createDeal?:
    | ((input: TDealCreateWithPeople) => Promise<TApiResult<TDeal>>)
    | null
}

// A card moved but not yet saved: where to, when, and from which version.
type TMove = { stageId: string; version: number; at: string }

type TClosing = {
  deal: TDeal
  outcome: 'won' | 'lost'
  // Dropped on the Won or Lost column: the card waits there for the answer.
  dropped: boolean
}

/**
 * Open deals by stage, as a board or a list. Drag a card to move it, drop
 * it on Won or Lost to close it, and add deals from a panel beside the
 * board.
 */
export const PipelinePage = ({
  bridge,
  me,
  createDeal = window.openSales?.pipeline?.createDeal ?? null
}: TPipelinePageProps) => {
  const pipeline = useCall(bridge.getPipeline)
  const board = useCall(bridge.getBoard)
  const users = useCall(bridge.listUsers)
  const [view, setView] = usePipelineView()
  const [filters, setFilters] = useState(() => startingFilters(me))
  const [sort, setSort] = useState<TDealSort>({ key: 'closeDate', dir: 1 })
  const [moves, setMoves] = useState<Record<string, TMove>>({})
  // Deals just closed, by the version they were closed from: off the board
  // at once, without waiting for it to load again.
  const [closed, setClosed] = useState<Record<string, number>>({})
  const [problem, setProblem] = useState<string | null>(null)
  const [editing, setEditing] = useState<TDeal | null>(null)
  const [adding, setAdding] = useState<TNewDealStart | null>(null)
  const [closing, setClosing] = useState<TClosing | null>(null)

  const stages = pipeline.data?.stages ?? []
  const openStages = stages.filter((stage) => stage.kind === 'open')
  const currency = pipeline.data?.currency ?? 'USD'

  // The board's deals, each where it was last dropped. Once the board
  // reloads, a deal's version moves on and its pending move lapses.
  const deals = (board.data?.columns.flatMap((column) => column.deals) ?? [])
    .filter((deal) => closed[deal.id] !== deal.version)
    .map((deal) => {
      const moved = moves[deal.id]
      return moved && moved.version === deal.version
        ? { ...deal, stageId: moved.stageId, stageEnteredAt: moved.at }
        : deal
    })
  const shown = filterDeals(deals, filters)
  const columns =
    filters.stageIds.length > 0
      ? openStages.filter((stage) => filters.stageIds.includes(stage.id))
      : openStages

  const moveDeal = async (deal: TDeal, stageId: string) => {
    setMoves((previous) => ({
      ...previous,
      [deal.id]: {
        stageId,
        version: deal.version,
        at: new Date().toISOString()
      }
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

  const handleMove = (deal: TDeal, stage: TStage) => {
    if (stage.kind !== 'open') {
      setClosing({ deal, outcome: stage.kind, dropped: true })
      return
    }
    if (deal.stageId !== stage.id) void moveDeal(deal, stage.id)
  }

  const closingStageId = closing?.dropped
    ? stages.find((stage) => stage.kind === closing.outcome)?.id
    : undefined
  const boardStageOf = (deal: TDeal) =>
    closing && closingStageId && closing.deal.id === deal.id
      ? closingStageId
      : deal.stageId

  const isLoading = pipeline.state === 'loading' || board.state === 'loading'
  const loadProblem = pipeline.problem ?? board.problem
  const countLabel = `${shown.length} ${shown.length === 1 ? 'deal' : 'deals'} · ${formatMoney(
    totalValue(shown, currency),
    currency,
    { compact: true }
  )}`

  const closeDialogProps = closing &&
    pipeline.data && {
      bridge,
      deal: closing.deal,
      pipeline: pipeline.data,
      onCancel: () => setClosing(null),
      onClosed: () => {
        setClosed((previous) => ({
          ...previous,
          [closing.deal.id]: closing.deal.version
        }))
        setClosing(null)
        setProblem(null)
        board.reload()
      }
    }

  return (
    <div className="flex min-h-0 flex-1">
      <PageBody>
        <PageHeader
          actions={
            <Button
              disabled={!pipeline.data}
              leadIcon={Add01Icon}
              size="lg"
              onClick={() => setAdding({})}
            >
              New deal
            </Button>
          }
          subtitle={
            view === 'board'
              ? 'Open deals, by stage. Drag a card to move it.'
              : 'Open deals, in a list. Click a column’s name to sort by it.'
          }
          title="Pipeline"
        />
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
          <>
            <PipelineToolbar
              countLabel={countLabel}
              deals={deals}
              filters={filters}
              me={me}
              stages={openStages}
              users={users.data ?? []}
              view={view}
              onFiltersChange={setFilters}
              onViewChange={setView}
            />
            {problem ? (
              <p className="m-0 text-sm text-destructive" role="alert">
                {problem}
              </p>
            ) : null}
            {view === 'board' ? (
              <>
                {shown.length === 0 && deals.length > 0 ? (
                  <p className="m-0 text-sm text-muted-foreground">
                    No deals match these filters.
                  </p>
                ) : null}
                <DealBoard
                  canAdd={Boolean(pipeline.data)}
                  columns={columns}
                  currency={currency}
                  deals={shown}
                  stageOf={boardStageOf}
                  stages={stages}
                  onAdd={(stageId) => setAdding({ stageId })}
                  onMove={handleMove}
                  onOpen={setEditing}
                />
              </>
            ) : shown.length === 0 ? (
              deals.length === 0 ? (
                <StatePanel
                  action="Add the first deal"
                  body="Add a deal to start your pipeline. It shows here and on the board."
                  kind="first"
                  title="No deals yet"
                  onAction={() => setAdding({})}
                />
              ) : (
                <StatePanel kind="none" />
              )
            ) : (
              <DealList
                deals={sortDeals(shown, sort, stages)}
                sort={sort}
                stages={stages}
                onClose={(deal, outcome) =>
                  setClosing({ deal, outcome, dropped: false })
                }
                onOpen={setEditing}
                onSort={setSort}
              />
            )}
          </>
        )}
        {editing && pipeline.data ? (
          <DealDialog
            key={editing.id}
            bridge={bridge}
            deal={editing}
            me={me}
            pipeline={pipeline.data}
            users={users.data ?? []}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null)
              board.reload()
            }}
          />
        ) : null}
        {closeDialogProps && closing?.outcome === 'won' ? (
          <WonDealDialog key={closing.deal.id} {...closeDialogProps} />
        ) : null}
        {closeDialogProps && closing?.outcome === 'lost' ? (
          <LostDealDialog key={closing.deal.id} {...closeDialogProps} />
        ) : null}
      </PageBody>
      <AnimatePresence>
        {adding && pipeline.data ? (
          <NewDealPanel
            key="new-deal"
            bridge={bridge}
            createDeal={createDeal}
            me={me}
            pipeline={pipeline.data}
            start={adding}
            users={users.data ?? []}
            onClose={() => setAdding(null)}
            onSaved={() => board.reload()}
          />
        ) : null}
      </AnimatePresence>
    </div>
  )
}
