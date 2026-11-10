/*
 * Opening the Ask panel about something on screen. The panel listens for
 * this event; until it does, nothing happens.
 */

export type TAskDetail = {
  // What the panel starts with, as if the person had typed it.
  prompt: string
  // What the question is about.
  record?: {
    type: 'company' | 'person' | 'deal' | 'lead' | 'report' | 'playbook'
    id: string
    label: string
  }
}

export const ASK_EVENT = 'open-sales:ask'

export const askAbout = (detail: TAskDetail) =>
  window.dispatchEvent(new CustomEvent<TAskDetail>(ASK_EVENT, { detail }))

type TReportAsk = {
  // The report's address under #/reports, like "won-lost".
  report: string
  // The chart's own name, like "Why deals were lost".
  chart: string
  periodId: string
  periodLabel: string
  // The days it covers, as shown: "1 Oct – 31 Dec 2026".
  rangeLabel: string
  // Null for everyone.
  ownerId: string | null
  ownerName: string
}

/** Asks about one chart, naming the report and the filters it's showing. */
export const askAboutReport = ({
  report,
  chart,
  periodId,
  periodLabel,
  rangeLabel,
  ownerId,
  ownerName
}: TReportAsk) => {
  const whose = ownerId ? `${ownerName}’s deals` : 'everyone’s deals'
  const filters = new URLSearchParams({ period: periodId })
  if (ownerId) filters.set('ownerId', ownerId)

  askAbout({
    prompt: `Explain the “${chart}” report for ${periodLabel.toLowerCase()} (${rangeLabel}), for ${whose}. What stands out, and which deals are behind it?`,
    record: {
      type: 'report',
      // The same filters, so the answer reads the same numbers.
      id: `${report}?${filters.toString()}`,
      label: `${chart} · ${periodLabel} · ${ownerId ? ownerName : 'Everyone'}`
    }
  })
}
