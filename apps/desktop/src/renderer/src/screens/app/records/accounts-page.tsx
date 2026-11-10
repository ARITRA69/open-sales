import { useState } from 'react'

import type { TSessionUser } from '@open-sales/shared'

import type { TTableColumn } from '@/components/ui/table'
import { useHashPath } from '@/hooks/use-hash-route'
import type { TRecordsBridge } from '@/hooks/use-records'
import { useCall, useRecordList, useSettled } from '@/hooks/use-records'
import { formatShortDate } from '@/lib/dates'
import { getInitials } from '@/lib/initials'

import { AccountPage } from './account-page'
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

/**
 * Accounts: the list at `#/accounts`, and one account's own page at
 * `#/accounts/<id>` (with a section after it, like `/deals`).
 */
export const AccountsPage = ({ bridge, me }: TAccountsPageProps) => {
  const [id, section] = useHashPath()
  return id ? (
    <AccountPage key={id} bridge={bridge} id={id} me={me} section={section} />
  ) : (
    <AccountsList bridge={bridge} me={me} />
  )
}

/** Every company the team sells to, A–Z. */
const AccountsList = ({ bridge, me }: TAccountsPageProps) => {
  const [view, setView] = useState<TListView>(0)
  const [search, setSearch] = useState('')
  const settledSearch = useSettled(search)
  const list = useRecordList(
    bridge,
    'companies',
    viewQuery(view, settledSearch)
  )
  const users = useCall(bridge.listUsers)
  const [isAdding, setIsAdding] = useState(false)

  return (
    <RecordsListPage
      columns={COLUMNS}
      emptyBody="Add the companies you sell to. Each one has an owner who looks after it."
      emptyTitle="No accounts yet"
      hasMore={list.hasMore}
      noun="account"
      problem={list.problem}
      rowHref={(id) => `#/accounts/${id}`}
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
      onAdd={() => setIsAdding(true)}
      onLoadMore={list.loadMore}
      onRetry={list.reload}
      onSearchChange={setSearch}
      onViewChange={setView}
    >
      {isAdding ? (
        <CompanyDialog
          bridge={bridge}
          company={null}
          me={me}
          users={users.data ?? []}
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
