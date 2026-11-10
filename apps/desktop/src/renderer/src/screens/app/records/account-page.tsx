import { useCallback, useState } from 'react'

import {
  AiMagicIcon,
  PencilEdit02Icon,
  UserSwitchIcon
} from '@hugeicons/core-free-icons'
import type { TCompany, TDeal, TSessionUser } from '@open-sales/shared'
import { canReassign, formatPhone } from '@open-sales/shared'

import { Button } from '@/components/ui/button'
import { StatTile } from '@/components/ui/kit'
import { Table, type TTableColumn } from '@/components/ui/table'
import { Tabs } from '@/components/ui/tabs'
import type { TRecordsBridge } from '@/hooks/use-records'
import { useCall, useRecordList } from '@/hooks/use-records'
import { formatShortDate } from '@/lib/dates'
import { getInitials } from '@/lib/initials'
import { formatMoney } from '@/lib/money'

import { askAi } from './ask-ai'
import { CompanyDialog } from './company-dialog'
import { PersonDialog } from './person-dialog'
import { ReassignDialog } from './reassign-dialog'
import { FieldList, OwnedBy, RecordLayout, RecordLink } from './record-layout'
import { ArchivedBanner, RecordGate } from './record-states'
import { RecordTimeline } from './record-timeline'
import { timelineBridgeFor, type TTimelineBridge } from './timeline-bridge'
import { formatWhen } from './when'

// The sections of an account, and the last part of each one's address.
const SECTIONS = ['overview', 'activity', 'deals', 'people', 'notes'] as const

type TSection = (typeof SECTIONS)[number]

const SECTION_LABELS: Record<TSection, string> = {
  overview: 'Overview',
  activity: 'Activity',
  deals: 'Deals',
  people: 'People',
  notes: 'Notes'
}

// An account has a handful of deals; this is every one of them.
const DEAL_LIMIT = 200

const DEAL_COLUMNS: TTableColumn[] = [
  { key: 'name', label: 'Deal', type: 'strong', width: 'minmax(0, 2fr)' },
  { key: 'stage', label: 'Stage', type: 'tag' },
  { key: 'value', label: 'Value', align: 'right' },
  { key: 'close', label: 'Close date', type: 'muted' },
  { key: 'owner', label: 'Owner', type: 'person' }
]

const PEOPLE_COLUMNS: TTableColumn[] = [
  { key: 'name', label: 'Name', type: 'person', width: 'minmax(0, 2fr)' },
  { key: 'email', label: 'Email', type: 'muted', width: 'minmax(0, 1.5fr)' },
  { key: 'phone', label: 'Phone', type: 'muted' }
]

type TAccountPageProps = {
  bridge: TRecordsBridge
  me: TSessionUser
  id: string
  // Which section the address names: `#/accounts/<id>/deals`.
  section?: string
  // The timeline's bridge; found from the records bridge unless given.
  timeline?: TTimelineBridge | null
}

/**
 * One account: its fields on the left; its timeline, deals, people and notes
 * in the middle. People who can't change it see who owns it instead of Edit.
 */
export const AccountPage = ({
  bridge,
  me,
  id,
  section,
  timeline = timelineBridgeFor(bridge)
}: TAccountPageProps) => {
  const company = useCall(
    useCallback(() => bridge.get('companies', id), [bridge, id])
  )
  const users = useCall(bridge.listUsers)
  const pipeline = useCall(bridge.getPipeline)
  const deals = useRecordList(bridge, 'deals', {
    companyId: id,
    limit: DEAL_LIMIT
  })
  const people = useCall(
    useCallback(
      () =>
        timeline
          ? timeline.listPeople({ type: 'company', id })
          : Promise.resolve({ ok: true as const, data: [] }),
      [timeline, id]
    )
  )
  const [dialog, setDialog] = useState<'edit' | 'reassign' | 'person' | null>(
    null
  )

  const active: TSection = SECTIONS.find((one) => one === section) ?? 'overview'
  const goTo = (next: TSection) => {
    window.location.hash =
      next === 'overview' ? `#/accounts/${id}` : `#/accounts/${id}/${next}`
  }

  return (
    <RecordGate
      listHref="#/accounts"
      listLabel="Accounts"
      noun="account"
      problem={company.problem}
      record={company.data}
      state={company.state}
      onRetry={company.reload}
    >
      {(record: TCompany) => {
        const isArchived = Boolean(record.archivedAt)
        const ownDeals = deals.items.filter(
          (deal) => deal.company.id === record.id
        )
        const openDeals = ownDeals.filter((deal) => deal.status === 'open')
        const currency = pipeline.data?.currency ?? 'USD'
        const openValue = openDeals
          .filter((deal) => deal.currency === currency)
          .reduce((sum, deal) => sum + (deal.valueMinor ?? 0), 0)
        const stageName = (deal: TDeal) =>
          pipeline.data?.stages.find((stage) => stage.id === deal.stageId)
            ?.name ?? ''
        const atCompany = people.data ?? []
        const refresh = () => {
          company.reload()
          deals.reload()
          people.reload()
        }

        return (
          <RecordLayout
            actions={
              <>
                <Button
                  leadIcon={AiMagicIcon}
                  variant="ghost"
                  onClick={() =>
                    askAi({
                      prompt: `Catch me up on ${record.name}.`,
                      record: {
                        type: 'company',
                        id: record.id,
                        label: record.name
                      }
                    })
                  }
                >
                  Ask AI
                </Button>
                {canReassign(me.role) && !isArchived ? (
                  <Button
                    leadIcon={UserSwitchIcon}
                    variant="secondary"
                    onClick={() => setDialog('reassign')}
                  >
                    Reassign
                  </Button>
                ) : null}
                {record.canEdit ? (
                  <Button
                    leadIcon={PencilEdit02Icon}
                    variant="secondary"
                    onClick={() => setDialog('edit')}
                  >
                    Edit
                  </Button>
                ) : null}
              </>
            }
            backLink={{ label: 'Accounts', href: '#/accounts' }}
            fields={
              <>
                {record.canEdit ? null : <OwnedBy name={record.owner.name} />}
                {isArchived ? <ArchivedBanner noun="account" /> : null}
                <FieldList
                  rows={[
                    {
                      label: 'Website',
                      value: record.domain ? (
                        <RecordLink href={`https://${record.domain}`}>
                          {record.domain}
                        </RecordLink>
                      ) : null
                    },
                    { label: 'Industry', value: record.industry },
                    { label: 'Owner', value: record.owner.name },
                    { label: 'About', value: record.description },
                    {
                      label: 'Last activity',
                      value: record.lastActivityAt
                        ? formatWhen(record.lastActivityAt)
                        : null
                    },
                    { label: 'Added', value: formatShortDate(record.createdAt) }
                  ]}
                />
              </>
            }
            subtitle={
              [record.domain, record.industry].filter(Boolean).join(' · ') ||
              undefined
            }
            title={record.name}
          >
            <Tabs
              active={SECTIONS.indexOf(active)}
              items={SECTIONS.map((one) =>
                one === 'deals'
                  ? { label: SECTION_LABELS[one], count: ownDeals.length }
                  : one === 'people'
                    ? { label: SECTION_LABELS[one], count: atCompany.length }
                    : SECTION_LABELS[one]
              )}
              label="Sections of this account"
              onChange={(index) => goTo(SECTIONS[index])}
            />

            {active === 'overview' ? (
              <div className="grid grid-cols-3 gap-3">
                <StatTile label="Open deals" value={openDeals.length} />
                <StatTile
                  label="Open value"
                  value={formatMoney(openValue, currency, { compact: true })}
                />
                <StatTile label="People" value={atCompany.length} />
              </div>
            ) : null}

            {active === 'overview' ||
            active === 'activity' ||
            active === 'notes' ? (
              timeline ? (
                <RecordTimeline
                  // Each section keeps its own open form.
                  key={active}
                  bridge={timeline}
                  currency={currency}
                  people={atCompany}
                  record={{
                    type: 'company',
                    id: record.id,
                    label: record.name
                  }}
                  show={
                    active === 'overview'
                      ? 'overview'
                      : active === 'notes'
                        ? 'notes'
                        : 'all'
                  }
                  users={users.data ?? []}
                  onChanged={company.reload}
                  onSeeAll={() => goTo('activity')}
                />
              ) : (
                <p className="m-0 text-sm text-muted-foreground">
                  The timeline isn’t available here.
                </p>
              )
            ) : null}

            {active === 'deals' ? (
              <Table
                columns={DEAL_COLUMNS}
                emptyAction="Open the pipeline"
                emptyBody="Deals are added from the Pipeline. Each one belongs to an account."
                emptyTitle="No deals on this account yet"
                label={`Deals at ${record.name}`}
                rowHref={(row) => `#/deals/${row.id}`}
                rows={ownDeals.map((deal) => ({
                  id: deal.id,
                  name: deal.name,
                  stage: stageName(deal),
                  value: formatMoney(deal.valueMinor, deal.currency),
                  close: formatShortDate(deal.closeDate),
                  owner: {
                    text: deal.owner.name,
                    initials: getInitials(deal.owner.name)
                  }
                }))}
                selectable={false}
                state={
                  deals.state === 'loading'
                    ? 'loading'
                    : deals.state === 'error'
                      ? 'error'
                      : ownDeals.length > 0
                        ? 'ready'
                        : 'empty'
                }
                onEmptyAction={() => {
                  window.location.hash = '#/pipeline'
                }}
              />
            ) : null}

            {active === 'people' ? (
              <>
                {record.canEdit && !isArchived && atCompany.length > 0 ? (
                  <Button
                    className="self-start"
                    variant="secondary"
                    onClick={() => setDialog('person')}
                  >
                    Add a person
                  </Button>
                ) : null}
                <Table
                  columns={PEOPLE_COLUMNS}
                  emptyAction={
                    record.canEdit && !isArchived ? 'Add the first person' : ''
                  }
                  emptyBody="Add the people you talk to here, so calls and notes can name them."
                  emptyTitle="No people at this account yet"
                  label={`People at ${record.name}`}
                  rowHref={(row) => `#/people/${row.id}`}
                  rows={atCompany.map((person) => ({
                    id: person.id,
                    name: {
                      text: person.name,
                      sub: person.title ?? undefined,
                      initials: getInitials(person.name)
                    },
                    email: person.email ?? '',
                    phone: formatPhone(person.phone)
                  }))}
                  selectable={false}
                  state={
                    people.state === 'loading'
                      ? 'loading'
                      : people.state === 'error'
                        ? 'error'
                        : atCompany.length > 0
                          ? 'ready'
                          : 'empty'
                  }
                  onEmptyAction={() => setDialog('person')}
                />
              </>
            ) : null}

            {dialog === 'edit' ? (
              <CompanyDialog
                bridge={bridge}
                company={record}
                me={me}
                users={users.data ?? []}
                onClose={() => setDialog(null)}
                onSaved={() => {
                  setDialog(null)
                  refresh()
                }}
              />
            ) : null}
            {dialog === 'reassign' ? (
              <ReassignDialog
                bridge={bridge}
                company={record}
                openDeals={openDeals.filter(
                  (deal) => deal.owner.id === record.owner.id
                )}
                users={users.data ?? []}
                onClose={() => setDialog(null)}
                onDone={() => {
                  setDialog(null)
                  refresh()
                }}
              />
            ) : null}
            {dialog === 'person' ? (
              <PersonDialog
                bridge={bridge}
                company={{ id: record.id, name: record.name }}
                person={null}
                onClose={() => setDialog(null)}
                onSaved={() => {
                  setDialog(null)
                  people.reload()
                }}
              />
            ) : null}
          </RecordLayout>
        )
      }}
    </RecordGate>
  )
}
