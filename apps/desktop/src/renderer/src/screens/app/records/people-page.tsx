import { useState } from 'react'

import type { TPerson } from '@open-sales/shared'
import { formatPhone } from '@open-sales/shared'

import type { TTableColumn } from '@/components/ui/table'
import type { TRecordsBridge } from '@/hooks/use-records'
import { useRecordList, useSettled } from '@/hooks/use-records'
import { getInitials } from '@/lib/initials'

import { PersonDialog } from './person-dialog'
import { RecordsListPage, viewQuery, type TListView } from './records-list-page'

const COLUMNS: TTableColumn[] = [
  { key: 'name', label: 'Name', type: 'person', width: 'minmax(0, 2fr)' },
  { key: 'company', label: 'Account' },
  { key: 'email', label: 'Email', type: 'muted', width: 'minmax(0, 1.5fr)' },
  { key: 'phone', label: 'Phone', type: 'muted' }
]

/** The people at the team's accounts, A–Z. */
export const PeoplePage = ({ bridge }: { bridge: TRecordsBridge }) => {
  const [view, setView] = useState<TListView>(0)
  const [search, setSearch] = useState('')
  const settledSearch = useSettled(search)
  const list = useRecordList(bridge, 'people', viewQuery(view, settledSearch))
  const [open, setOpen] = useState<TPerson | 'new' | null>(null)

  return (
    <RecordsListPage
      columns={COLUMNS}
      emptyBody="Add the people you talk to. Each one works at one of your accounts."
      emptyTitle="No people yet"
      hasMore={list.hasMore}
      noun="person"
      problem={list.problem}
      rows={list.items.map((person) => ({
        id: person.id,
        name: {
          text: person.name,
          sub: person.title ?? undefined,
          initials: getInitials(person.name)
        },
        company: person.company.name,
        email: person.email ?? '',
        phone: formatPhone(person.phone)
      }))}
      search={search}
      state={list.state}
      subtitle="The people at your accounts."
      title="People"
      view={view}
      views={['Everyone', 'At my accounts', 'Archived']}
      onAdd={() => setOpen('new')}
      onLoadMore={list.loadMore}
      onOpen={(id) =>
        setOpen(list.items.find((person) => person.id === id) ?? null)
      }
      onRetry={list.reload}
      onSearchChange={setSearch}
      onViewChange={setView}
    >
      {open ? (
        <PersonDialog
          key={open === 'new' ? 'new' : open.id}
          bridge={bridge}
          person={open === 'new' ? null : open}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null)
            list.reload()
          }}
        />
      ) : null}
    </RecordsListPage>
  )
}
