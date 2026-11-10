import { useState } from 'react'

import type { TCompany, TSessionUser } from '@open-sales/shared'

import type { TTableColumn } from '@/components/ui/table'
import type { TRecordsBridge } from '@/hooks/use-records'
import { useCall, useRecordList, useSettled } from '@/hooks/use-records'
import { formatShortDate } from '@/lib/dates'
import { getInitials } from '@/lib/initials'

import { CompanyDialog } from './company-dialog'
import { RecordsListPage, viewQuery, type TListView } from './records-list-page'

const COLUMNS: TTableColumn[] = [
  { key: 'name', label: 'Account', type: 'strong', width: 'minmax(0, 2fr)' },
  { key: 'domain', label: 'Website', type: 'muted' },
  { key: 'owner', label: 'Owner', type: 'person' },
  { key: 'industry', label: 'Industry', type: 'muted' },
  { key: 'added', label: 'Added', type: 'muted', width: '96px' }
]

type TAccountsPageProps = {
  bridge: TRecordsBridge
  me: TSessionUser
}

/** Every company the team sells to, A–Z. */
export const AccountsPage = ({ bridge, me }: TAccountsPageProps) => {
  const [view, setView] = useState<TListView>(0)
  const [search, setSearch] = useState('')
  const settledSearch = useSettled(search)
  const list = useRecordList(
    bridge,
    'companies',
    viewQuery(view, settledSearch)
  )
  const users = useCall(bridge.listUsers)
  // A company to edit, or 'new'.
  const [open, setOpen] = useState<TCompany | 'new' | null>(null)

  return (
    <RecordsListPage
      columns={COLUMNS}
      emptyBody="Add the companies you sell to. Each one has an owner who looks after it."
      emptyTitle="No accounts yet"
      hasMore={list.hasMore}
      noun="account"
      problem={list.problem}
      rows={list.items.map((company) => ({
        id: company.id,
        name: company.name,
        domain: company.domain ?? '',
        owner: {
          text: company.owner.name,
          initials: getInitials(company.owner.name)
        },
        industry: company.industry ?? '',
        added: formatShortDate(company.createdAt)
      }))}
      search={search}
      state={list.state}
      subtitle="Every company you sell to."
      title="Accounts"
      view={view}
      views={['All accounts', 'My accounts', 'Archived']}
      onAdd={() => setOpen('new')}
      onLoadMore={list.loadMore}
      onOpen={(id) =>
        setOpen(list.items.find((company) => company.id === id) ?? null)
      }
      onRetry={list.reload}
      onSearchChange={setSearch}
      onViewChange={setView}
    >
      {open ? (
        <CompanyDialog
          key={open === 'new' ? 'new' : open.id}
          bridge={bridge}
          company={open === 'new' ? null : open}
          me={me}
          users={users.data ?? []}
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
