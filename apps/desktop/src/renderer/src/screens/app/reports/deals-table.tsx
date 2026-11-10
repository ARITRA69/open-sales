import type { TReportDeal } from '@open-sales/shared'

import { PickPill, type TPickPillOption } from '@/components/ui/pick-pill'
import { Table, type TTableColumn, type TTableRow } from '@/components/ui/table'
import { formatShortDate } from '@/lib/dates'
import { formatMoney } from '@/lib/money'

import { countOf } from './format'

const DASH = '—'

export type TDealColumn =
  | 'stage'
  | 'outcome'
  | 'reason'
  | 'value'
  | 'weighted'
  | 'closeDate'
  | 'closedOn'

const COLUMNS: Record<TDealColumn, TTableColumn> = {
  stage: {
    key: 'stage',
    label: 'Stage',
    type: 'muted',
    width: 'minmax(0, 1.4fr)'
  },
  outcome: { key: 'outcome', label: 'Outcome', type: 'tag', width: '72px' },
  reason: {
    key: 'reason',
    label: 'Lost because',
    type: 'muted',
    width: 'minmax(0, 1.3fr)'
  },
  value: { key: 'value', label: 'Value', align: 'right' },
  weighted: { key: 'weighted', label: 'Weighted', align: 'right' },
  closeDate: { key: 'closeDate', label: 'Close date', type: 'muted' },
  closedOn: { key: 'closedOn', label: 'Closed', type: 'muted' }
}

type TDealsTableProps = {
  // Names the list: "Open deals", "Deals closed".
  title: string
  deals: TReportDeal[]
  // True when the report had more deals than it lists.
  isTruncated: boolean
  columns: TDealColumn[]
  // Lost reasons by id, for the outcome column.
  reasonLabels?: Record<string, string>
  // Narrows the list: the choices, and which one is on.
  filter?: {
    label: string
    options: TPickPillOption[]
    value: string
    onChange: (value: string) => void
  }
}

/**
 * The deals behind a report's numbers. Each row opens the deal's own page.
 */
export const DealsTable = ({
  title,
  deals,
  isTruncated,
  columns,
  reasonLabels = {},
  filter
}: TDealsTableProps) => {
  const rows: TTableRow[] = deals.map((deal) => {
    const reason = deal.lostReasonId ? reasonLabels[deal.lostReasonId] : null
    return {
      id: deal.id,
      name: deal.name,
      company: deal.companyName,
      owner: deal.ownerName,
      stage:
        deal.status === 'open'
          ? `${deal.stage.name} · ${deal.stage.winProbability}%`
          : deal.stage.name,
      outcome:
        deal.status === 'won'
          ? { text: 'Won', dot: 'success' }
          : { text: 'Lost', dot: 'faint' },
      reason: deal.status === 'lost' ? (reason ?? 'No reason given') : '',
      value: formatMoney(deal.valueMinor, deal.currency) || DASH,
      weighted:
        deal.valueMinor === null
          ? DASH
          : formatMoney(
              Math.round((deal.valueMinor * deal.stage.winProbability) / 100),
              deal.currency
            ),
      closeDate: formatShortDate(deal.closeDate) || 'No date',
      closedOn: formatShortDate(deal.closedAt) || DASH
    }
  })

  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <header className="flex min-h-8 items-center gap-2">
        <h2 className="m-0 text-base font-semibold">{title}</h2>
        <span className="text-body-sm text-muted-foreground tabular-nums">
          {isTruncated
            ? `The first ${deals.length.toLocaleString()}`
            : countOf(deals.length)}
        </span>
        <span className="flex-1" />
        {filter ? (
          <PickPill
            align="end"
            label={filter.label}
            options={filter.options}
            size="md"
            value={filter.value}
            onChange={filter.onChange}
          />
        ) : null}
      </header>
      {rows.length > 0 ? (
        <Table
          columns={[
            {
              key: 'name',
              label: 'Deal',
              type: 'strong',
              width: 'minmax(0, 2fr)'
            },
            {
              key: 'company',
              label: 'Account',
              type: 'muted',
              width: 'minmax(0, 1.5fr)'
            },
            {
              key: 'owner',
              label: 'Owner',
              type: 'muted',
              width: 'minmax(0, 1.2fr)'
            },
            ...columns.map((column) => COLUMNS[column])
          ]}
          density="compact"
          label={title}
          rowHref={(row) => `#/deals/${row.id}`}
          rows={rows}
          selectable={false}
        />
      ) : (
        <p className="m-0 rounded-card bg-muted px-3 py-2.5 text-sm text-muted-foreground">
          No deals match this choice.
        </p>
      )}
    </section>
  )
}
