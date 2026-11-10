/** What the Ask AI panel is told a question is about. */
export type TAskRecord = {
  type: 'company' | 'person' | 'deal' | 'lead' | 'report' | 'playbook'
  id: string
  label: string
}

export type TAskDetail = { prompt: string; record?: TAskRecord }

export const ASK_EVENT = 'open-sales:ask'

/**
 * Opens the Ask AI panel with a question, about a record if there is one.
 * The panel listens for this event; until it does, nothing happens.
 */
export const askAi = (detail: TAskDetail) => {
  window.dispatchEvent(new CustomEvent<TAskDetail>(ASK_EVENT, { detail }))
}
