import type { ReactNode } from 'react'

import { PageBody } from '@/components/sales/app-shell'
import { Banner } from '@/components/ui/kit'
import { StatePanel } from '@/components/ui/state-panel'
import type { TLoadState } from '@/hooks/use-records'

type TRecordGateProps<TRecord> = {
  // What the page is loading: its record, or why it didn't come.
  record: TRecord | null
  state: TLoadState
  problem: string | null
  // "account", for the words.
  noun: string
  // Where the list is, and what it's called: "Accounts".
  listHref: string
  listLabel: string
  onRetry: () => void
  children: (record: TRecord) => ReactNode
}

/**
 * Waits for a record page's record: rows while it loads, and a way back
 * when it isn't there.
 */
export const RecordGate = <TRecord,>({
  record,
  state,
  problem,
  noun,
  listHref,
  listLabel,
  onRetry,
  children
}: TRecordGateProps<TRecord>) => {
  if (record) return children(record)
  if (state === 'loading') {
    return (
      <PageBody>
        <StatePanel kind="loading" />
      </PageBody>
    )
  }
  return (
    <PageBody>
      <StatePanel
        action="Try again"
        body={problem ?? `That ${noun} doesn’t exist, or was deleted.`}
        kind="error"
        title={`This ${noun} didn’t open`}
        onAction={onRetry}
      />
      <a className="self-center text-sm text-muted-foreground" href={listHref}>
        {`Back to ${listLabel}`}
      </a>
    </PageBody>
  )
}

/** Shown on an archived record: it can be read, and restored from Edit. */
export const ArchivedBanner = ({ noun }: { noun: string }) => (
  <Banner>{`This ${noun} is archived. Restore it to change it.`}</Banner>
)
