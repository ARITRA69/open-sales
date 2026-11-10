import { useState, type ReactNode } from 'react'

import { Add01Icon } from '@hugeicons/core-free-icons'

import { PageBody } from '@/components/sales/app-shell'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { PageHeader } from '@/components/ui/page-header'
import { Table, type TTableColumn, type TTableRow } from '@/components/ui/table'
import { Tabs } from '@/components/ui/tabs'
import type { TLoadState } from '@/hooks/use-records'

// All, mine, archived: the same three views on every records page.
export type TListView = 0 | 1 | 2

export const viewQuery = (view: TListView, search: string) => ({
  q: search.trim() || undefined,
  owner: view === 1 ? ('me' as const) : ('anyone' as const),
  archived: view === 2 ? ('true' as const) : ('false' as const)
})

type TRecordsListPageProps = {
  title: string
  subtitle: string
  // "account": for the button and the empty state.
  noun: string
  views: [string, string, string]
  view: TListView
  onViewChange: (view: TListView) => void
  search: string
  onSearchChange: (search: string) => void
  columns: TTableColumn[]
  rows: TTableRow[]
  state: TLoadState
  problem: string | null
  hasMore: boolean
  emptyTitle: string
  emptyBody: string
  onAdd: () => void
  // Where a row's own page is, like `#/accounts/<id>`.
  rowHref: (rowId: string) => string
  onLoadMore: () => void
  onRetry: () => void
  // The dialog, when one is open.
  children?: ReactNode
}

/**
 * Accounts and People: a searchable, paged table with three views. A row
 * opens that record's own page.
 */
export const RecordsListPage = ({
  title,
  subtitle,
  noun,
  views,
  view,
  onViewChange,
  search,
  onSearchChange,
  columns,
  rows,
  state,
  problem,
  hasMore,
  emptyTitle,
  emptyBody,
  onAdd,
  rowHref,
  onLoadMore,
  onRetry,
  children
}: TRecordsListPageProps) => {
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const tableState =
    state === 'loading'
      ? 'loading'
      : state === 'error'
        ? 'error'
        : rows.length > 0
          ? 'ready'
          : search.trim() || view !== 0
            ? 'none'
            : 'empty'

  return (
    <PageBody>
      <PageHeader
        actions={
          <Button leadIcon={Add01Icon} size="lg" onClick={onAdd}>
            {`New ${noun}`}
          </Button>
        }
        search={
          <Field
            aria-label={`Search ${title.toLowerCase()}`}
            className="w-60"
            kind="search"
            placeholder={`Search ${title.toLowerCase()}`}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        }
        subtitle={subtitle}
        title={title}
      />
      <Tabs
        active={view}
        items={views}
        label={`Which ${title.toLowerCase()}`}
        variant="segmented"
        onChange={(index) => onViewChange(index as TListView)}
      />
      <Table
        columns={columns}
        emptyAction={`Add the first ${noun}`}
        emptyBody={emptyBody}
        emptyTitle={emptyTitle}
        label={title}
        rowHref={(row) => rowHref(row.id)}
        rows={rows}
        selectable={false}
        state={tableState}
        onEmptyAction={onAdd}
      />
      {state === 'error' && problem ? (
        <div className="flex items-center gap-3">
          <p className="m-0 text-sm text-muted-foreground">{problem}</p>
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}
      {hasMore ? (
        <Button
          className="self-center"
          loading={isLoadingMore}
          variant="secondary"
          onClick={async () => {
            setIsLoadingMore(true)
            await onLoadMore()
            setIsLoadingMore(false)
          }}
        >
          Load more
        </Button>
      ) : null}
      {children}
    </PageBody>
  )
}
