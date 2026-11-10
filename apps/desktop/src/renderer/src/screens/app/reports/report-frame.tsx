import type { ReactNode } from 'react'

import { ChartBarLineIcon } from '@hugeicons/core-free-icons'

import { StatePanel } from '@/components/ui/state-panel'
import { cn } from '@/lib/utils'

type TReportFrameProps<TData> = {
  report: {
    data: TData | null
    state: 'loading' | 'ready' | 'error'
    code: string | null
    isRefreshing: boolean
    reload: () => void
  }
  children: (data: TData) => ReactNode
}

/**
 * A report while it loads, when it fails, and once it's there. New filters
 * dim the old numbers until the new ones arrive, rather than blanking them.
 */
export const ReportFrame = <TData,>({
  report,
  children
}: TReportFrameProps<TData>) => {
  if (report.state === 'loading') return <StatePanel kind="loading" />
  if (report.state === 'error' || !report.data) {
    return report.code === 'forbidden' ? (
      <StatePanel
        body="Ask a manager or an admin if you need these numbers."
        kind="noaccess"
        title="This report is for managers and admins"
      />
    ) : (
      <StatePanel kind="error" onAction={report.reload} />
    )
  }

  return (
    <div
      aria-busy={report.isRefreshing}
      className={cn(
        '@container flex flex-col gap-4 transition-opacity duration-200',
        report.isRefreshing && 'opacity-60'
      )}
    >
      {children(report.data)}
    </div>
  )
}

type TNoDealsProps = {
  title: string
  body: string
  // A filter change that would likely find some, and its button's words.
  action?: string
  onAction?: () => void
}

/** What a report shows when its filters find no deals. */
export const NoDeals = ({ title, body, action, onAction }: TNoDealsProps) => (
  <StatePanel
    action={action ?? ''}
    body={body}
    icon={ChartBarLineIcon}
    title={title}
    onAction={onAction}
  />
)
