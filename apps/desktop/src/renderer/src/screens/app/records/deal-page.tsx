import { useCallback, useState } from 'react'

import { AiMagicIcon, PencilEdit02Icon } from '@hugeicons/core-free-icons'
import type { TDeal, TSessionUser } from '@open-sales/shared'

import { PageBody } from '@/components/sales/app-shell'
import { Button } from '@/components/ui/button'
import { StatePanel } from '@/components/ui/state-panel'
import { Tag } from '@/components/ui/status'
import { useHashPath } from '@/hooks/use-hash-route'
import type { TRecordsBridge } from '@/hooks/use-records'
import { useCall } from '@/hooks/use-records'
import { formatShortDate } from '@/lib/dates'
import { formatMoney } from '@/lib/money'

import { askAi } from './ask-ai'
import { DealDialog } from './deal-dialog'
import { FieldList, OwnedBy, RecordLayout, RecordLink } from './record-layout'
import { ArchivedBanner, RecordGate } from './record-states'
import { RecordTimeline } from './record-timeline'
import { timelineBridgeFor, type TTimelineBridge } from './timeline-bridge'
import { formatWhen } from './when'

type TDealPageProps = {
  bridge: TRecordsBridge
  me: TSessionUser
  id: string
  // The timeline's bridge; found from the records bridge unless given.
  timeline?: TTimelineBridge | null
}

/**
 * One deal: its value, stage, close date, next step, owner and people on
 * the left, and its timeline in the middle. Stage moves show on the
 * timeline; changing the deal uses the Pipeline's own dialog.
 */
export const DealPage = ({
  bridge,
  me,
  id,
  timeline = timelineBridgeFor(bridge)
}: TDealPageProps) => {
  const deal = useCall(useCallback(() => bridge.get('deals', id), [bridge, id]))
  const users = useCall(bridge.listUsers)
  const pipeline = useCall(bridge.getPipeline)
  const companyId = deal.data?.company.id ?? null
  const linked = useCall(
    useCallback(
      () =>
        timeline
          ? timeline.listPeople({ type: 'deal', id })
          : Promise.resolve({ ok: true as const, data: [] }),
      [timeline, id]
    )
  )
  // The account's people, to pick who was on a call.
  const atCompany = useCall(
    useCallback(
      () =>
        timeline && companyId
          ? timeline.listPeople({ type: 'company', id: companyId })
          : Promise.resolve({ ok: true as const, data: [] }),
      [timeline, companyId]
    )
  )
  const [isEditing, setIsEditing] = useState(false)

  return (
    <RecordGate
      listHref="#/pipeline"
      listLabel="the pipeline"
      noun="deal"
      problem={deal.problem}
      record={deal.data}
      state={deal.state}
      onRetry={deal.reload}
    >
      {(record: TDeal) => {
        const isArchived = Boolean(record.archivedAt)
        const stage = pipeline.data?.stages.find(
          (one) => one.id === record.stageId
        )
        const lostReason = pipeline.data?.lostReasons.find(
          (one) => one.id === record.lostReasonId
        )
        const people = linked.data ?? []

        return (
          <RecordLayout
            actions={
              <>
                <Button
                  leadIcon={AiMagicIcon}
                  variant="ghost"
                  onClick={() =>
                    askAi({
                      prompt: `Where does ${record.name} with ${record.company.name} stand, and what should I do next?`,
                      record: {
                        type: 'deal',
                        id: record.id,
                        label: record.name
                      }
                    })
                  }
                >
                  Ask AI
                </Button>
                {record.canEdit && pipeline.data ? (
                  <Button
                    leadIcon={PencilEdit02Icon}
                    variant="secondary"
                    onClick={() => setIsEditing(true)}
                  >
                    Edit
                  </Button>
                ) : null}
              </>
            }
            backLink={{ label: 'Pipeline', href: '#/pipeline' }}
            fields={
              <>
                {record.canEdit ? null : <OwnedBy name={record.owner.name} />}
                {isArchived ? <ArchivedBanner noun="deal" /> : null}
                <FieldList
                  rows={[
                    {
                      label: 'Account',
                      value: (
                        <RecordLink href={`#/accounts/${record.company.id}`}>
                          {record.company.name}
                        </RecordLink>
                      )
                    },
                    {
                      label: 'Stage',
                      value: stage ? (
                        <Tag
                          tone={
                            record.status === 'won' ? 'success' : 'secondary'
                          }
                        >
                          {stage.name}
                        </Tag>
                      ) : null
                    },
                    {
                      label: 'Value',
                      value: formatMoney(record.valueMinor, record.currency)
                    },
                    {
                      label:
                        record.status === 'open' ? 'Close date' : 'Closed on',
                      value: formatShortDate(record.closeDate)
                    },
                    { label: 'Next step', value: record.nextStep },
                    { label: 'Owner', value: record.owner.name },
                    ...(record.status === 'lost'
                      ? [
                          {
                            label: 'Lost because',
                            value: [lostReason?.label, record.lostNote]
                              .filter(Boolean)
                              .join(': ')
                          }
                        ]
                      : []),
                    {
                      label: 'People',
                      value:
                        people.length > 0 ? (
                          <ul className="m-0 flex list-none flex-col gap-1 p-0">
                            {people.map((person) => (
                              <li key={person.id}>
                                <RecordLink href={`#/people/${person.id}`}>
                                  {person.name}
                                </RecordLink>
                                {person.title ? (
                                  <span className="text-muted-foreground">
                                    {` · ${person.title}`}
                                  </span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        ) : linked.state === 'loading' ? null : (
                          <span className="text-muted-foreground">
                            Nobody linked yet
                          </span>
                        )
                    },
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
              stage
                ? `${record.company.name} · ${stage.name}`
                : record.company.name
            }
            title={record.name}
          >
            {timeline ? (
              <RecordTimeline
                bridge={timeline}
                currency={record.currency}
                people={atCompany.data ?? []}
                record={{ type: 'deal', id: record.id, label: record.name }}
                users={users.data ?? []}
                onChanged={deal.reload}
              />
            ) : (
              <p className="m-0 text-sm text-muted-foreground">
                The timeline isn’t available here.
              </p>
            )}

            {isEditing && pipeline.data ? (
              <DealDialog
                bridge={bridge}
                deal={record}
                me={me}
                pipeline={pipeline.data}
                users={users.data ?? []}
                onClose={() => setIsEditing(false)}
                onSaved={() => {
                  setIsEditing(false)
                  deal.reload()
                }}
              />
            ) : null}
          </RecordLayout>
        )
      }}
    </RecordGate>
  )
}

/** The deal named in the address, `#/deals/<id>`. */
export const DealRoute = ({
  bridge,
  me
}: Pick<TDealPageProps, 'bridge' | 'me'>) => {
  const [id] = useHashPath()
  // `#/deals` alone names no deal: the list of deals is the Pipeline.
  if (!id) {
    return (
      <PageBody>
        <StatePanel
          action="Open the pipeline"
          body="Open a deal from the Pipeline, or from its account."
          kind="none"
          title="Deals live in the Pipeline"
          onAction={() => {
            window.location.hash = '#/pipeline'
          }}
        />
      </PageBody>
    )
  }
  // Each deal starts from scratch: nothing carries over from the last one.
  return <DealPage key={id} bridge={bridge} id={id} me={me} />
}
