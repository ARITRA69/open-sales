import type { TLead, TLeadStatus } from '@open-sales/shared'

import type { TTableCellDetail } from '@/components/ui/table-cells'
import { formatShortDate } from '@/lib/dates'

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Added by hand',
  import: 'Import',
  web_form: 'Web form',
  email: 'Email'
}

/** "web_form" → "Web form". A source the app doesn't know shows as it is. */
export const sourceLabel = (source: string) => SOURCE_LABELS[source] ?? source

export const STATUS_LABELS: Record<TLeadStatus, string> = {
  new: 'New',
  qualified: 'Qualified',
  disqualified: 'Disqualified',
  converted: 'Converted'
}

/** A lead's status as a table tag: new ones carry the dot that needs you. */
export const statusCell = (status: TLeadStatus): TTableCellDetail => ({
  text: STATUS_LABELS[status],
  ...(status === 'new' ? { dot: 'accent' as const } : {}),
  ...(status === 'qualified' ? { dot: 'success' as const } : {}),
  ...(status === 'converted' ? { soft: 'success' as const } : {})
})

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** When a lead arrived: "Just now", "3h ago", "Yesterday", then the date. */
export const formatArrived = (iso: string, now = Date.now()): string => {
  const age = now - new Date(iso).getTime()
  if (age < 2 * MINUTE_MS) return 'Just now'
  if (age < HOUR_MS) return `${Math.floor(age / MINUTE_MS)}m ago`
  if (age < DAY_MS) return `${Math.floor(age / HOUR_MS)}h ago`
  if (age < 2 * DAY_MS) return 'Yesterday'
  if (age < 7 * DAY_MS) return `${Math.floor(age / DAY_MS)} days ago`
  return formatShortDate(iso)
}

/** Who has the lead, as a table cell; nobody shows as quiet text. */
export const ownerCell = (lead: TLead): TTableCellDetail =>
  lead.owner ? { text: lead.owner.name } : { text: 'Unassigned', muted: true }

/** "Operations Director at Brightwell Logistics", from whichever is known. */
export const roleLine = (lead: TLead): string =>
  [lead.title, lead.companyName].filter(Boolean).join(' at ')

/** "3 leads", "1 lead". */
export const countLeads = (count: number) =>
  `${count} ${count === 1 ? 'lead' : 'leads'}`
