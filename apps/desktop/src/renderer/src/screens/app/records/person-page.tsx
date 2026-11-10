import { useCallback, useState } from 'react'

import { AiMagicIcon, PencilEdit02Icon } from '@hugeicons/core-free-icons'
import type { TPerson } from '@open-sales/shared'
import { formatPhone } from '@open-sales/shared'

import { Button } from '@/components/ui/button'
import type { TRecordsBridge } from '@/hooks/use-records'
import { useCall } from '@/hooks/use-records'
import { formatShortDate } from '@/lib/dates'

import { askAi } from './ask-ai'
import { PersonDialog } from './person-dialog'
import { FieldList, OwnedBy, RecordLayout, RecordLink } from './record-layout'
import { ArchivedBanner, RecordGate } from './record-states'
import { RecordTimeline } from './record-timeline'
import { timelineBridgeFor, type TTimelineBridge } from './timeline-bridge'
import { formatWhen } from './when'

type TPersonPageProps = {
  bridge: TRecordsBridge
  id: string
  // The timeline's bridge; found from the records bridge unless given.
  timeline?: TTimelineBridge | null
}

/**
 * One person: how to reach them on the left, and everything that involved
 * them in the middle. They belong to an account, whose owner may change them.
 */
export const PersonPage = ({
  bridge,
  id,
  timeline = timelineBridgeFor(bridge)
}: TPersonPageProps) => {
  const person = useCall(
    useCallback(() => bridge.get('people', id), [bridge, id])
  )
  const users = useCall(bridge.listUsers)
  const companyId = person.data?.company.id ?? null
  // Their account, for who owns it; and their colleagues, for calls.
  const company = useCall(
    useCallback(
      () =>
        companyId
          ? bridge.get('companies', companyId)
          : Promise.resolve({ ok: false as const, message: '' }),
      [bridge, companyId]
    )
  )
  const colleagues = useCall(
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
      listHref="#/people"
      listLabel="People"
      noun="person"
      problem={person.problem}
      record={person.data}
      state={person.state}
      onRetry={person.reload}
    >
      {(record: TPerson) => {
        const isArchived = Boolean(record.archivedAt)
        // Before their colleagues load, a call can still name them.
        const callPeople = colleagues.data?.length
          ? colleagues.data
          : [{ id: record.id, name: record.name }]

        return (
          <RecordLayout
            actions={
              <>
                <Button
                  leadIcon={AiMagicIcon}
                  variant="ghost"
                  onClick={() =>
                    askAi({
                      prompt: `Catch me up on ${record.name} at ${record.company.name}.`,
                      record: {
                        type: 'person',
                        id: record.id,
                        label: record.name
                      }
                    })
                  }
                >
                  Ask AI
                </Button>
                {record.canEdit ? (
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
            backLink={{ label: 'People', href: '#/people' }}
            fields={
              <>
                {record.canEdit || !company.data ? null : (
                  <OwnedBy name={company.data.owner.name} />
                )}
                {isArchived ? <ArchivedBanner noun="person" /> : null}
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
                    { label: 'Job title', value: record.title },
                    // Plain text to copy: writing email from here comes later.
                    { label: 'Email', value: record.email },
                    { label: 'Phone', value: formatPhone(record.phone) },
                    {
                      label: 'LinkedIn',
                      value: record.linkedinUrl ? (
                        <RecordLink href={record.linkedinUrl}>
                          Open profile
                        </RecordLink>
                      ) : null
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
              record.title
                ? `${record.title} at ${record.company.name}`
                : record.company.name
            }
            title={record.name}
          >
            {timeline ? (
              <RecordTimeline
                bridge={timeline}
                people={callPeople}
                record={{ type: 'person', id: record.id, label: record.name }}
                users={users.data ?? []}
                onChanged={person.reload}
              />
            ) : (
              <p className="m-0 text-sm text-muted-foreground">
                The timeline isn’t available here.
              </p>
            )}

            {isEditing ? (
              <PersonDialog
                bridge={bridge}
                person={record}
                onClose={() => setIsEditing(false)}
                onSaved={() => {
                  setIsEditing(false)
                  person.reload()
                }}
              />
            ) : null}
          </RecordLayout>
        )
      }}
    </RecordGate>
  )
}
