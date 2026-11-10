import type {
  TAiEngine,
  TProposal,
  TProposalChange,
  TProposalValue
} from '@open-sales/shared'
import { formatPhone } from '@open-sales/shared'

import { formatFieldDate } from '@/lib/dates'
import { formatMoney } from '@/lib/money'

/* How a proposal reads on its card: field names and values in people's words. */

// The same words the record's own form uses.
const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  domain: 'Website',
  industry: 'Industry',
  description: 'About',
  title: 'Job title',
  email: 'Email',
  phone: 'Phone',
  linkedinUrl: 'LinkedIn',
  companyId: 'Account',
  stageId: 'Stage',
  valueMinor: 'Value',
  currency: 'Currency',
  closeDate: 'Close date',
  nextStep: 'Next step',
  lostReasonId: 'Why it was lost',
  lostNote: 'Note'
}

export const fieldLabel = (field: string) => FIELD_LABELS[field] ?? field

/** A field's value as the card shows it. Nothing set is an empty string. */
export const formatValue = (
  field: string,
  value: TProposalValue | undefined,
  label: string | null | undefined,
  currency: string | null
): string => {
  if (value === null || value === undefined || value === '') return ''
  if (label) return label
  if (field === 'valueMinor' && typeof value === 'number') {
    return formatMoney(value, currency ?? 'USD')
  }
  if (field === 'closeDate' && typeof value === 'string') {
    return formatFieldDate(value) || value
  }
  if (field === 'phone' && typeof value === 'string') {
    return formatPhone(value)
  }
  return String(value)
}

export type TChangeText = {
  field: string
  label: string
  from: string
  to: string
  // Set while the proposal waits: what the record says now.
  current: string | null
}

export const describeChange = (
  change: TProposalChange,
  currency: string | null
): TChangeText => ({
  field: change.field,
  label: fieldLabel(change.field),
  from: formatValue(change.field, change.from, change.fromLabel, currency),
  to: formatValue(change.field, change.to, change.toLabel, currency),
  current:
    change.current === undefined
      ? null
      : formatValue(change.field, change.current, change.currentLabel, currency)
})

const ENGINE_NAMES: Record<TAiEngine, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex'
}

export const engineName = (engine: TAiEngine) => ENGINE_NAMES[engine]

const RECORD_WORDS = {
  company: 'account',
  person: 'person',
  deal: 'deal',
  task: 'task',
  activity: 'note'
} as const

/** "deal", "account": what the record is called in the app. */
export const recordWord = (type: TProposal['target']['type']) =>
  RECORD_WORDS[type]

const RECORD_PAGES: Partial<Record<TProposal['target']['type'], string>> = {
  company: 'accounts',
  person: 'people',
  deal: 'deals'
}

/** The record's own page, once it exists. */
export const recordHref = (target: TProposal['target']) => {
  const page = RECORD_PAGES[target.type]
  return page && target.id ? `#/${page}/${target.id}` : null
}

/** "Halden Capital · Platform": where the change lands. */
export const targetLine = (target: TProposal['target']) =>
  target.companyName ? `${target.companyName} · ${target.name}` : target.name

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "12 min ago", "3 hr ago", "Yesterday", then the date. */
export const timeAgo = (iso: string, now = Date.now()): string => {
  const elapsed = now - new Date(iso).getTime()
  if (elapsed < MINUTE) return 'Just now'
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} hr ago`
  if (elapsed < 2 * DAY) return 'Yesterday'
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)} days ago`
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short'
  })
}
