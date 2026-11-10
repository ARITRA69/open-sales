/** What a page hands the Ask panel: the question, and the record it's about. */
export type TAskDetail = {
  prompt: string
  record?: {
    type: 'company' | 'person' | 'deal' | 'lead' | 'report' | 'playbook'
    id: string
    label: string
  }
}

export const ASK_EVENT = 'open-sales:ask'

/** Opens the Ask panel with a question. The panel listens for this event. */
export const askAi = (detail: TAskDetail) => {
  window.dispatchEvent(new CustomEvent<TAskDetail>(ASK_EVENT, { detail }))
}
