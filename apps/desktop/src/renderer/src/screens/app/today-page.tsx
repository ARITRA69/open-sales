import type { TMember } from '@open-sales/shared'

import { PageBody } from '@/components/sales/app-shell'
import { PageHeader } from '@/components/ui/page-header'
import { useCall, type TRecordsBridge } from '@/hooks/use-records'
import type { TTodayFollowUp, TTodayNudge } from '@/lib/preview-bridge'

import { PendingPersonRow } from './team-section'
import { AskBox } from './today/ask-box'
import { DealsNeedingNudge, FollowUpsDue } from './today/today-lists'
import type { TTodayControls } from './today/use-today'
import { WaitingForYou } from './today/waiting-for-you'

const greetingFor = (hour: number) =>
  hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

type TTodayPageProps = {
  firstName: string
  workspaceName: string | null
  // Admins only: people who joined with the link and wait for a yes.
  pendingPeople?: TMember[]
  onDecide?: (memberId: string, decision: 'approve' | 'decline') => void
  // AI's proposals waiting for this person, from `useToday`.
  today: TTodayControls
  // For the stages and lost reasons a proposal can be edited to.
  recordsBridge?: TRecordsBridge | null
  // Tasks and promised replies due. Hidden until tasks exist (record pages).
  followUps?: TTodayFollowUp[]
  onFollowUpDone?: (id: string) => void
  // Deals idle past their stage's limit. Hidden until the pipeline finds them.
  nudges?: TTodayNudge[]
  // Passed in so tests can pick the time of day.
  now?: Date
}

/** The home page: what needs this person today. */
export const TodayPage = ({
  firstName,
  workspaceName,
  pendingPeople = [],
  onDecide = () => undefined,
  today,
  recordsBridge = null,
  followUps = [],
  onFollowUpDone,
  nudges = [],
  now = new Date()
}: TTodayPageProps) => {
  const pipeline = useCall(recordsBridge ? recordsBridge.getPipeline : null)

  return (
    <PageBody narrow>
      <PageHeader
        subtitle={
          workspaceName
            ? `Here’s what needs you at ${workspaceName}.`
            : 'Here’s what needs you today.'
        }
        title={`${greetingFor(now.getHours())}, ${firstName}`}
      />
      <AskBox />
      {pendingPeople.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-sm font-semibold">Waiting to join</h2>
          <ul className="m-0 flex list-none flex-col rounded-card bg-accent-soft px-3 py-0.5">
            {pendingPeople.map((member) => (
              <PendingPersonRow
                key={member.id}
                member={member}
                onDecide={onDecide}
              />
            ))}
          </ul>
        </section>
      ) : null}
      <WaitingForYou pipeline={pipeline.data} today={today} />
      <FollowUpsDue items={followUps} onDone={onFollowUpDone} />
      <DealsNeedingNudge items={nudges} />
    </PageBody>
  )
}
