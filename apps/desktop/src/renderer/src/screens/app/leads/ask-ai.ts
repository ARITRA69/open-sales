import type { TLead } from '@open-sales/shared'

/** What the Ask AI panel takes when a page opens it with something to say. */
export type TAskDetail = {
  prompt: string
  record?: {
    type: 'company' | 'person' | 'deal' | 'lead' | 'report' | 'playbook'
    id: string
    label: string
  }
}

/**
 * Opens the Ask AI panel with a question about a lead. The panel listens for
 * `open-sales:ask`; until it does, nothing happens.
 */
export const askAboutLead = (lead: TLead) => {
  const where = lead.companyName ? ` at ${lead.companyName}` : ''
  const detail: TAskDetail = {
    prompt: `Is ${lead.name}${where} a good fit for us? Look at what they wrote and at accounts like theirs, then say whether to convert or disqualify, and why.`,
    record: { type: 'lead', id: lead.id, label: lead.name }
  }
  window.dispatchEvent(new CustomEvent('open-sales:ask', { detail }))
}
