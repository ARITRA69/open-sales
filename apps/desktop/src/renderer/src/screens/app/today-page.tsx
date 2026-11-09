import { CheckmarkCircle02Icon } from '@hugeicons/core-free-icons'

import { PageBody } from '@/components/sales/app-shell'
import { PageHeader } from '@/components/ui/page-header'
import { StatePanel } from '@/components/ui/state-panel'

const greetingFor = (hour: number) =>
  hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

type TTodayPageProps = {
  firstName: string
  workspaceName: string | null
  // Passed in so tests can pick the time of day.
  now?: Date
}

/** The home page: what needs this person today. */
export const TodayPage = ({
  firstName,
  workspaceName,
  now = new Date()
}: TTodayPageProps) => (
  <PageBody>
    <PageHeader
      subtitle={
        workspaceName
          ? `Here’s what needs you at ${workspaceName}.`
          : 'Here’s what needs you today.'
      }
      title={`${greetingFor(now.getHours())}, ${firstName}`}
    />
    <section className="flex flex-col gap-2">
      <h2 className="m-0 text-sm font-semibold">Waiting for you</h2>
      <StatePanel
        action=""
        body="When AI proposes changes or follow-ups come due, they’ll show here."
        icon={CheckmarkCircle02Icon}
        title="You’re all caught up"
      />
    </section>
  </PageBody>
)
