import { useState } from 'react'

import { Add01Icon, BookOpen01Icon } from '@hugeicons/core-free-icons'
import type { TPlaybook } from '@open-sales/shared'

import { PageBody } from '@/components/sales/app-shell'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { PageHeader } from '@/components/ui/page-header'
import { StatePanel } from '@/components/ui/state-panel'
import { Table, type TTableColumn } from '@/components/ui/table'
import { Tabs } from '@/components/ui/tabs'
import { useSettled } from '@/hooks/use-records'
import { formatShortDate } from '@/lib/dates'

import type { TPlaybooksBridge } from './playbooks-bridge'
import { usePlaybookList } from './use-playbook-list'

export const NEW_PLAYBOOK_HREF = '#/playbooks/new'
export const playbookHref = (id: string) => `#/playbooks/${id}`

const SUBTITLE = 'Shared AI instructions your team runs on a deal or account.'

// What managers and admins can look through. Everyone else sees one list.
const VIEWS = [
  { label: 'All', query: { status: 'any', archived: 'false' } },
  { label: 'Published', query: { status: 'published', archived: 'false' } },
  { label: 'Drafts', query: { status: 'draft', archived: 'false' } },
  { label: 'Archived', query: { status: 'any', archived: 'true' } }
] as const

const NAME: TTableColumn = {
  key: 'name',
  label: 'Playbook',
  type: 'strong',
  width: 'minmax(0, 1.2fr)'
}
const WHAT: TTableColumn = {
  key: 'description',
  label: 'What it does',
  type: 'muted',
  width: 'minmax(0, 2fr)'
}
const AUTHOR: TTableColumn = { key: 'author', label: 'Written by' }
const STATUS: TTableColumn = {
  key: 'status',
  label: 'Status',
  type: 'tag',
  width: '112px'
}
const CHANGED: TTableColumn = {
  key: 'changed',
  label: 'Changed',
  type: 'muted',
  width: '104px'
}

const toRow = (playbook: TPlaybook) => ({
  id: playbook.id,
  name: playbook.name,
  description: playbook.description ?? '',
  // The starters came with the product; nobody on the team wrote them.
  author: playbook.author?.name ?? 'Starter',
  status:
    playbook.status === 'published'
      ? { text: 'Published', dot: 'success' as const }
      : { text: 'Draft', dot: 'faint' as const },
  changed: formatShortDate(playbook.current.createdAt)
})

type TPlaybookLibraryProps = {
  bridge: TPlaybooksBridge
  // Managers and admins: drafts, the archive and "New playbook".
  canWrite: boolean
}

/** Every playbook the person may see: what it does, who wrote it, and its status. */
export const PlaybookLibrary = ({
  bridge,
  canWrite
}: TPlaybookLibraryProps) => {
  const [view, setView] = useState(0)
  const [search, setSearch] = useState('')
  const settledSearch = useSettled(search)
  const list = usePlaybookList(bridge, {
    ...(canWrite ? VIEWS[view].query : VIEWS[1].query),
    q: settledSearch.trim() || undefined
  })
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const isFiltered = Boolean(search.trim()) || (canWrite && view !== 0)
  const tableState =
    list.state === 'loading'
      ? 'loading'
      : list.state === 'error'
        ? 'error'
        : list.items.length > 0
          ? 'ready'
          : isFiltered
            ? 'none'
            : 'empty'

  return (
    <PageBody>
      <PageHeader
        actions={
          canWrite ? (
            <Button href={NEW_PLAYBOOK_HREF} leadIcon={Add01Icon} size="lg">
              New playbook
            </Button>
          ) : null
        }
        search={
          <Field
            aria-label="Search playbooks"
            className="w-60"
            kind="search"
            placeholder="Search playbooks"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        }
        subtitle={SUBTITLE}
        title="Playbooks"
      />
      {canWrite ? (
        <Tabs
          active={view}
          items={VIEWS.map((item) => item.label)}
          label="Which playbooks"
          variant="segmented"
          onChange={setView}
        />
      ) : null}
      {tableState === 'empty' ? (
        <StatePanel
          action={canWrite ? 'Write the first playbook' : ''}
          body={
            canWrite
              ? 'Write down how your team does a job once, such as a follow-up after a demo, and anyone can run it on a deal or account.'
              : 'Your managers haven’t published a playbook yet. When they do, you can run it on any deal or account.'
          }
          icon={BookOpen01Icon}
          title="No playbooks yet"
          onAction={() => {
            window.location.hash = NEW_PLAYBOOK_HREF
          }}
        />
      ) : (
        <Table
          columns={
            canWrite
              ? [NAME, WHAT, AUTHOR, STATUS, CHANGED]
              : [NAME, WHAT, AUTHOR, CHANGED]
          }
          label="Playbooks"
          rowHref={(row) => playbookHref(row.id)}
          rows={list.items.map(toRow)}
          selectable={false}
          state={tableState}
          onEmptyAction={() => {
            if (tableState === 'error') list.reload()
            else {
              setSearch('')
              setView(0)
            }
          }}
        />
      )}
      {list.state === 'error' && list.problem ? (
        <p className="m-0 text-sm text-muted-foreground">{list.problem}</p>
      ) : null}
      {list.hasMore ? (
        <Button
          className="self-center"
          loading={isLoadingMore}
          variant="secondary"
          onClick={async () => {
            setIsLoadingMore(true)
            await list.loadMore()
            setIsLoadingMore(false)
          }}
        >
          Load more
        </Button>
      ) : null}
    </PageBody>
  )
}
