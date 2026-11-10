import { useEffect, useState } from 'react'

import { Add01Icon, InboxIcon } from '@hugeicons/core-free-icons'
import type {
  TLead,
  TLeadListQueryInput,
  TSessionUser
} from '@open-sales/shared'
import { canChangeAnything } from '@open-sales/shared'
import { AnimatePresence } from 'motion/react'

import { PageBody } from '@/components/sales/app-shell'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { FloatBar } from '@/components/ui/float-bar'
import { PageHeader } from '@/components/ui/page-header'
import { PickPill } from '@/components/ui/pick-pill'
import { StatePanel } from '@/components/ui/state-panel'
import { Table, type TTableColumn } from '@/components/ui/table'
import { Tabs } from '@/components/ui/tabs'
import { useHashPath } from '@/hooks/use-hash-route'
import { useCall, useSettled } from '@/hooks/use-records'

import type { TOpenSalesBridge } from '../../../../../preload/bridge-types'
import {
  AssignDialog,
  changeEach,
  describeOutcome,
  DisqualifyDialog,
  type TBulkOutcome
} from './bulk-dialogs'
import { ConvertDialog } from './convert-dialog'
import { LeadDialog } from './lead-dialog'
import {
  formatArrived,
  ownerCell,
  sourceLabel,
  statusCell
} from './lead-labels'
import { NewLeadDialog } from './new-lead-dialog'
import { useLeadList, useLeadsBridge, type TLeadsBridge } from './use-leads'

const COLUMNS: TTableColumn[] = [
  { key: 'name', label: 'Name', type: 'strong', width: 'minmax(0, 1.4fr)' },
  { key: 'company', label: 'Company' },
  { key: 'source', label: 'Source', type: 'muted', width: '112px' },
  { key: 'status', label: 'Status', type: 'tag', width: '112px' },
  { key: 'arrived', label: 'Arrived', type: 'muted', width: '96px' },
  { key: 'owner', label: 'Owner' }
]

// All, mine, unassigned.
type TOwnerView = 0 | 1 | 2
const OWNER_VIEWS = ['All leads', 'Mine', 'Unassigned']
const OWNER_QUERY = ['anyone', 'me', 'none'] as const

type TStatusFilter = NonNullable<TLeadListQueryInput['status']>
const STATUS_OPTIONS: { label: string; value: TStatusFilter }[] = [
  { label: 'To work', value: 'open' },
  { label: 'New', value: 'new' },
  { label: 'Qualified', value: 'qualified' },
  { label: 'Disqualified', value: 'disqualified' },
  { label: 'Converted', value: 'converted' },
  { label: 'Every status', value: 'any' }
]

const TOAST_MS = 6000

const openLead = (id: string | null) => {
  window.location.hash = id ? `#/leads/${id}` : '#/leads'
}

type TLeadsPageProps = {
  me: TSessionUser
  // Left out, the page finds the app's own (or the preview's pretend one).
  bridge?: TLeadsBridge | null
  // For the team's names and the workspace's currency.
  recordsBridge: TOpenSalesBridge['records'] | null
}

/**
 * The Leads inbox: new leads waiting to be worked, newest first. Opening
 * one shows what they wrote; from there it's converted, disqualified or
 * given to a teammate. `#/leads/<id>` opens that lead.
 */
export const LeadsPage = ({
  me,
  bridge: givenBridge,
  recordsBridge
}: TLeadsPageProps) => {
  const bridge = useLeadsBridge(givenBridge, recordsBridge)
  const [view, setView] = useState<TOwnerView>(0)
  const [status, setStatus] = useState<TStatusFilter>('open')
  const [search, setSearch] = useState('')
  const settledSearch = useSettled(search)
  const list = useLeadList(bridge, {
    q: settledSearch.trim() || undefined,
    owner: OWNER_QUERY[view],
    status
  })
  const users = useCall(recordsBridge?.listUsers ?? null)
  const pipeline = useCall(recordsBridge?.getPipeline ?? null)

  const [selected, setSelected] = useState<string[]>([])
  const [isAdding, setIsAdding] = useState(false)
  const [bulk, setBulk] = useState<'assign' | 'disqualify' | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // The lead in the address, and which of its dialogs is showing.
  const openId = useHashPath()[0] ?? null
  const [fetched, setFetched] = useState<TLead | null>(null)
  const [step, setStep] = useState<{
    id: string
    name: 'convert' | 'disqualify'
  } | null>(null)
  const opened = openId
    ? fetched?.id === openId
      ? fetched
      : (list.items.find((lead) => lead.id === openId) ?? null)
    : null
  const openStep = step && step.id === openId ? step.name : 'view'

  // A fresh copy of the lead that's open; a link to one that's gone closes.
  useEffect(() => {
    if (!bridge || !openId) return
    let isCurrent = true
    void bridge.get(openId).then((answer) => {
      if (!isCurrent) return
      if (answer.ok) setFetched(answer.data)
      else openLead(null)
    })
    return () => {
      isCurrent = false
    }
  }, [bridge, openId])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])

  if (!bridge) {
    return (
      <PageBody>
        <PageHeader subtitle="New leads to work." title="Leads" />
        <StatePanel
          action=""
          body="Leads you add, import or get from your web form will wait here."
          icon={InboxIcon}
          title="No new leads"
        />
      </PageBody>
    )
  }

  const isManager = canChangeAnything(me.role)
  const team = users.data ?? []
  const chosen = list.items.filter((lead) => selected.includes(lead.id))
  const isFiltered = Boolean(search.trim()) || view !== 0 || status !== 'open'

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

  const finishBulk = (outcome: TBulkOutcome, done: string) => {
    setBulk(null)
    setSelected([])
    setToast(describeOutcome(outcome, done))
    list.reload()
  }

  const takeChosen = async () => {
    const outcome = await changeEach(chosen, (lead) =>
      bridge.assign(lead.id, { version: lead.version, ownerId: me.id })
    )
    finishBulk(outcome, 'assigned to you')
  }

  return (
    <PageBody>
      <PageHeader
        actions={
          <Button
            leadIcon={Add01Icon}
            size="lg"
            onClick={() => setIsAdding(true)}
          >
            New lead
          </Button>
        }
        search={
          <Field
            aria-label="Search leads"
            className="w-60"
            kind="search"
            placeholder="Search leads"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setSelected([])
            }}
          />
        }
        subtitle="New leads to work."
        title="Leads"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          active={view}
          items={OWNER_VIEWS}
          label="Whose leads"
          variant="segmented"
          onChange={(index) => {
            setView(index as TOwnerView)
            setSelected([])
          }}
        />
        <PickPill
          label="Status"
          options={STATUS_OPTIONS}
          size="lg"
          value={status}
          onChange={(value) => {
            setStatus(value as TStatusFilter)
            setSelected([])
          }}
        />
      </div>
      <Table
        barActions={[
          isManager
            ? { label: 'Assign', onClick: () => setBulk('assign') }
            : { label: 'Assign to me', onClick: () => void takeChosen() },
          { label: 'Disqualify', onClick: () => setBulk('disqualify') }
        ]}
        columns={COLUMNS}
        emptyAction="Add a lead"
        emptyBody="Leads you add, import or get from your web form will wait here until someone works them."
        emptyTitle="No new leads"
        label="Leads"
        rows={list.items.map((lead) => ({
          id: lead.id,
          name: lead.name,
          company: lead.companyName ?? '',
          source: sourceLabel(lead.source),
          status: statusCell(lead.status),
          arrived: formatArrived(lead.createdAt),
          owner: ownerCell(lead)
        }))}
        selected={selected}
        state={tableState}
        onEmptyAction={() => setIsAdding(true)}
        onRowClick={(row) => openLead(row.id)}
        onSelect={setSelected}
      />
      {list.state === 'error' && list.problem ? (
        <div className="flex items-center gap-3">
          <p className="m-0 text-sm text-muted-foreground">{list.problem}</p>
          <Button size="sm" variant="secondary" onClick={list.reload}>
            Try again
          </Button>
        </div>
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

      {isAdding ? (
        <NewLeadDialog
          bridge={bridge}
          me={me}
          users={team}
          onClose={() => setIsAdding(false)}
          onCreated={() => {
            setIsAdding(false)
            list.reload()
          }}
        />
      ) : null}

      {bulk === 'disqualify' && chosen.length > 0 ? (
        <DisqualifyDialog
          bridge={bridge}
          leads={chosen}
          onClose={() => setBulk(null)}
          onDone={(outcome) => finishBulk(outcome, 'disqualified')}
        />
      ) : null}
      {bulk === 'assign' && chosen.length > 0 ? (
        <AssignDialog
          bridge={bridge}
          leads={chosen}
          users={team}
          onClose={() => setBulk(null)}
          onDone={(outcome) => finishBulk(outcome, 'assigned')}
        />
      ) : null}

      {opened && openStep === 'view' ? (
        <LeadDialog
          key={opened.id}
          bridge={bridge}
          lead={opened}
          meId={me.id}
          users={team}
          onChanged={(lead) => {
            setFetched(lead)
            list.reload()
          }}
          onClose={() => openLead(null)}
          onConvert={() => setStep({ id: opened.id, name: 'convert' })}
          onDisqualify={() => setStep({ id: opened.id, name: 'disqualify' })}
        />
      ) : null}
      {opened && openStep === 'disqualify' ? (
        <DisqualifyDialog
          bridge={bridge}
          leads={[opened]}
          onClose={() => setStep(null)}
          onDone={() => {
            setStep(null)
            openLead(null)
            setToast(`${opened.name} was disqualified.`)
            list.reload()
          }}
        />
      ) : null}
      {opened && openStep === 'convert' ? (
        <ConvertDialog
          key={opened.id}
          bridge={bridge}
          currency={pipeline.data?.currency ?? null}
          lead={opened}
          me={me}
          onClose={() => {
            setStep(null)
            // Converted: back to the inbox. Cancelled: back to the lead.
            if (fetched?.id === opened.id && fetched.status === 'converted') {
              openLead(null)
            }
          }}
          onConverted={(result) => {
            setFetched(result.lead)
            list.reload()
          }}
          onStale={setFetched}
        />
      ) : null}

      <AnimatePresence>
        {toast ? (
          <FloatBar
            key="toast"
            floating
            text={toast}
            onClose={() => setToast(null)}
          />
        ) : null}
      </AnimatePresence>
    </PageBody>
  )
}
