import type { TDeal, TOwner, TSessionUser, TStage } from '@open-sales/shared'

import { AnimatedLabel } from '@/components/ui/animated-label'
import { Button } from '@/components/ui/button'
import { FilterMenu } from '@/components/ui/filter-menu'
import { Menu, type TMenuItem } from '@/components/ui/menu'
import { PickPillTrigger } from '@/components/ui/pick-pill'
import { Tabs } from '@/components/ui/tabs'

import {
  closeMonthChoices,
  closeMonthLabel,
  closeMonthOf,
  filterDeals,
  NO_CLOSE_DATE,
  sameFilters,
  startingFilters,
  type TPipelineFilters
} from './pipeline-filters'
import { PIPELINE_VIEWS, type TPipelineView } from './use-pipeline-view'

const VIEW_LABELS = ['Board', 'List']

type TPipelineToolbarProps = {
  me: TSessionUser
  users: TOwner[]
  // The open stages, in order.
  stages: TStage[]
  // Every open deal, before filtering: the choices and their counts.
  deals: TDeal[]
  filters: TPipelineFilters
  onFiltersChange: (filters: TPipelineFilters) => void
  view: TPipelineView
  onViewChange: (view: TPipelineView) => void
  // How much is showing, like "6 deals · $193K".
  countLabel: string
}

/** Whose deals, which stages and close months, and board or list. */
export const PipelineToolbar = ({
  me,
  users,
  stages,
  deals,
  filters,
  onFiltersChange,
  view,
  onViewChange,
  countLabel
}: TPipelineToolbarProps) => {
  const starting = startingFilters(me)
  const owner = users.find((user) => user.id === filters.ownerId)
  const ownerLabel =
    filters.ownerId === null
      ? 'Owner: Everyone'
      : filters.ownerId === me.id
        ? 'My deals'
        : `Owner: ${owner?.name ?? 'Someone else'}`

  const setOwner = (ownerId: string | null) =>
    onFiltersChange({ ...filters, ownerId })
  const ownerItems: TMenuItem[] = [
    {
      label: 'Everyone',
      selected: filters.ownerId === null,
      onSelect: () => setOwner(null)
    },
    {
      label: 'My deals',
      selected: filters.ownerId === me.id,
      onSelect: () => setOwner(me.id)
    },
    ...(users.some((user) => user.id !== me.id)
      ? [{ line: true as const }]
      : []),
    ...users
      .filter((user) => user.id !== me.id)
      .map((user) => ({
        label: user.name,
        selected: filters.ownerId === user.id,
        onSelect: () => setOwner(user.id)
      }))
  ]

  // Each choice counts what it would show with the other filters as they are.
  const forStages = filterDeals(deals, filters, 'stage')
  const stageOptions = stages.map((stage) => ({
    id: stage.id,
    label: stage.name,
    count: forStages.filter((deal) => deal.stageId === stage.id).length
  }))

  const forMonths = filterDeals(deals, filters, 'closeMonth')
  const months = [
    ...closeMonthChoices(deals),
    ...(deals.some((deal) => !deal.closeDate) ? [NO_CLOSE_DATE] : [])
  ]
  const monthOptions = months.map((month) => ({
    id: month,
    label: closeMonthLabel(month),
    count: forMonths.filter((deal) => closeMonthOf(deal) === month).length
  }))

  const labelsOf = (options: { id: string; label: string }[], ids: string[]) =>
    options.filter((option) => ids.includes(option.id)).map((o) => o.label)
  const idsOf = (options: { id: string; label: string }[], labels: string[]) =>
    options.filter((option) => labels.includes(option.label)).map((o) => o.id)

  return (
    <div
      aria-label="Pipeline filters"
      className="flex flex-wrap items-center gap-2"
      data-slot="pipeline-toolbar"
      role="toolbar"
    >
      <Menu
        items={ownerItems}
        label="Whose deals"
        trigger={
          <PickPillTrigger
            size="lg"
            tone={filters.ownerId === null ? 'secondary' : 'primary'}
          >
            {ownerLabel}
          </PickPillTrigger>
        }
      />
      <FilterMenu
        name="Stage"
        options={stageOptions}
        picked={labelsOf(stageOptions, filters.stageIds)}
        onPickedChange={(labels) =>
          onFiltersChange({ ...filters, stageIds: idsOf(stageOptions, labels) })
        }
      />
      <FilterMenu
        name="Close month"
        options={monthOptions}
        picked={labelsOf(monthOptions, filters.closeMonths)}
        onPickedChange={(labels) =>
          onFiltersChange({
            ...filters,
            closeMonths: idsOf(monthOptions, labels)
          })
        }
      />
      {sameFilters(filters, starting) ? null : (
        <Button
          className="mx-1.5"
          size="lg"
          variant="link"
          onClick={() => onFiltersChange(starting)}
        >
          Clear filters
        </Button>
      )}
      <span className="ml-auto inline-flex text-body-sm font-medium whitespace-nowrap text-muted-foreground">
        <AnimatedLabel>{countLabel}</AnimatedLabel>
      </span>
      <Tabs
        active={PIPELINE_VIEWS.indexOf(view)}
        items={VIEW_LABELS}
        label="Board or list"
        variant="segmented"
        onChange={(index) => onViewChange(PIPELINE_VIEWS[index] ?? 'board')}
      />
    </div>
  )
}
