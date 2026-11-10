import type { TFieldChange, TTimelineItem } from '@open-sales/shared'
import { formatPhone } from '@open-sales/shared'

import { formatShortDate } from '@/lib/dates'
import { formatMoney } from '@/lib/money'

type TChangeItem = Extract<TTimelineItem, { kind: 'change' }>
type TStageItem = Extract<TTimelineItem, { kind: 'stage' }>

// What each field is called on screen.
const FIELD_LABELS: Record<string, string> = {
  name: 'the name',
  domain: 'the website',
  industry: 'the industry',
  description: 'the description',
  ownerId: 'the owner',
  companyId: 'the account',
  title: 'the job title',
  email: 'the email',
  phone: 'the phone number',
  linkedinUrl: 'the LinkedIn link',
  valueMinor: 'the value',
  currency: 'the currency',
  closeDate: 'the close date',
  nextStep: 'the next step',
  lostReasonId: 'the lost reason',
  lostNote: 'the lost note'
}

// Long text: say that it changed, not what to.
const LONG_FIELDS = new Set(['description', 'lostNote'])

const NOUNS = { company: 'account', person: 'person', deal: 'deal' } as const

export type TRecordNoun = keyof typeof NOUNS

const labelOf = (field: string) => FIELD_LABELS[field] ?? field

const textOf = (field: string, value: unknown, currency: string) => {
  if (value === null || value === undefined || value === '') return null
  if (field === 'valueMinor' && typeof value === 'number') {
    return formatMoney(value, currency)
  }
  if (field === 'closeDate' && typeof value === 'string') {
    return formatShortDate(value)
  }
  if (field === 'phone' && typeof value === 'string') return formatPhone(value)
  return String(value)
}

/** "changed the owner from Ravi Shah to Lena Ortiz". */
const describeChange = (
  { field, from, to }: TFieldChange,
  currency: string
) => {
  const label = labelOf(field)
  if (LONG_FIELDS.has(field)) return `updated ${label}`
  const before = textOf(field, from, currency)
  const after = textOf(field, to, currency)
  if (before && after) return `changed ${label} from ${before} to ${after}`
  if (after) return `set ${label} to ${after}`
  return before ? `cleared ${label} (was ${before})` : `cleared ${label}`
}

const joinWords = (parts: string[]) =>
  parts.length <= 1
    ? (parts[0] ?? '')
    : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`

/** Names in a sentence: "Priya Nair", "Priya Nair and Tom Becker". */
export const joinNames = (people: { name: string }[]) =>
  joinWords(people.map(({ name }) => name))

/**
 * A field change as a sentence without its subject: "changed the owner
 * from Ravi Shah to Lena Ortiz", "added this account".
 */
export const describeChangeItem = (
  item: TChangeItem,
  record: TRecordNoun,
  currency = 'USD'
) => {
  const noun = NOUNS[record]
  if (item.action === 'create') return `added this ${noun}`
  if (item.action === 'archive') return `archived this ${noun}`
  if (item.action === 'restore') return `restored this ${noun}`
  return (
    joinWords(item.changes.map((change) => describeChange(change, currency))) ||
    `changed this ${noun}`
  )
}

/**
 * A stage move without its subject. On the deal's own page the deal goes
 * unnamed: "moved this deal from Discovery to Proposal".
 */
export const describeStageItem = (item: TStageItem, onDeal: boolean) => {
  const what = onDeal ? 'this deal' : item.deal.name
  return item.from
    ? `moved ${what} from ${item.from.name} to ${item.to.name}`
    : `added ${what} in ${item.to.name}`
}

/** Who did it, with how: "AI, approved by Asha Menon". */
export const describeActor = (
  actor: { name: string } | null,
  via: TChangeItem['via'] = 'app'
) => {
  if (via === 'ai_proposal') {
    return actor ? `AI, approved by ${actor.name}` : 'AI'
  }
  if (via === 'import') return actor ? `${actor.name}, by import` : 'An import'
  return actor?.name ?? 'The system'
}
