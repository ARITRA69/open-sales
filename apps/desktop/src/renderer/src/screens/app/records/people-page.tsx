import { useState } from 'react'

import { formatPhone } from '@open-sales/shared'

import type { TTableColumn } from '@/components/ui/table'
import { useHashPath } from '@/hooks/use-hash-route'
import type { TRecordsBridge } from '@/hooks/use-records'
import { useRecordList, useSettled } from '@/hooks/use-records'
import { getInitials } from '@/lib/initials'

import { PersonDialog } from './person-dialog'
import { PersonPage } from './person-page'
import { RecordsListPage, viewQuery, type TListView } from './records-list-page'

const COLUMNS: TTableColumn[] = [
  { key: 'name', label: 'Name', type: 'person', width: 'minmax(0, 2fr)' },
  { key: 'company', label: 'Account' },
  { key: 'email', label: 'Email', type: 'muted', width: 'minmax(0, 1.5fr)' },
  { key: 'phone', label: 'Phone', type: 'muted' }
]

/**
 * People: the list at `#/people`, and one person's own page at
 * `#/people/<id>`.
 */
export const PeoplePage = ({ bridge }: { bridge: TRecordsBridge }) => {
  const [id] = useHashPath()
  return id ? (
    <PersonPage key={id} bridge={bridge} id={id} />
  ) : (
    <PeopleList bridge={bridge} />
  )
}

/** The people at the team's accounts, A–Z. */
const PeopleList = ({ bridge }: { bridge: TRecordsBridge }) => {
  const [view, setView] = useState<TListView>(0)
  const [search, setSearch] = useState('')
  const settledSearch = useSettled(search)
  const list = useRecordList(bridge, 'people', viewQuery(view, settledSearch))
  const [isAdding, setIsAdding] = useState(false)

  return (
    <RecordsListPage
      columns={COLUMNS}
      emptyBody="Add the people you talk to. Each one works at one of your accounts."
      emptyTitle="No people yet"
      hasMore={list.hasMore}
      noun="person"
      problem={list.problem}
      rowHref={(id) => `#/people/${id}`}
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
      onAdd={() => setIsAdding(true)}
      onLoadMore={list.loadMore}
      onRetry={list.reload}
      onSearchChange={setSearch}
      onViewChange={setView}
    >
      {isAdding ? (
        <PersonDialog
          bridge={bridge}
          person={null}
          onClose={() => setIsAdding(false)}
          onSaved={() => {
            setIsAdding(false)
            list.reload()
          }}
        />
      ) : null}
    </RecordsListPage>
  )
}
