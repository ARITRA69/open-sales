/*
 * Handing something to the Ask AI panel. No page runs AI itself: it sends
 * this event, and the panel opens with the prompt and what it's about.
 */

export const ASK_EVENT = 'open-sales:ask'

export type TAskRecord = {
  type: 'company' | 'person' | 'deal' | 'lead' | 'report' | 'playbook'
  id: string
  // As people would say it: "Halden Capital".
  label: string
}

export type TAskDetail = { prompt: string; record?: TAskRecord }

/** Opens the Ask AI panel with a prompt, about a record if there is one. */
export const askAi = (detail: TAskDetail) => {
  window.dispatchEvent(new CustomEvent<TAskDetail>(ASK_EVENT, { detail }))
}
