/*
 * When a deal counts as idle ("stalled"). The Pipeline's cards and rows show
 * it, and Today lists the same deals under "Deals needing a nudge", so the
 * rule lives here and both read it.
 *
 * A deal is idle once it has sat in its stage, with nothing happening on it,
 * for more days than the stage's `stalledAfterDays`. The clock starts when
 * the deal entered the stage and starts again at each activity (an email, a
 * call, a note). Closed and archived deals are never idle, and a stage with
 * no limit never stalls.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** What the rule reads from a deal. `TDeal` fits. */
export type TStallable = {
  stageEnteredAt: string
  lastActivityAt: string | null
  // Left out, a deal counts as open and in use.
  status?: 'open' | 'won' | 'lost'
  archivedAt?: string | null
}

/** What the rule reads from the deal's stage. `TStage` fits. */
export type TStallLimit = { stalledAfterDays: number | null }

/** When the idle clock last started: the later of entering the stage and the last activity. */
export const idleSince = (deal: TStallable): number => {
  const entered = new Date(deal.stageEnteredAt).getTime()
  const active = deal.lastActivityAt
    ? new Date(deal.lastActivityAt).getTime()
    : Number.NaN
  return Number.isNaN(active) ? entered : Math.max(entered, active)
}

/**
 * Whole days a deal has been idle, if that's past its stage's limit; null
 * when it isn't idle. A limit of 10 days first shows on day 11.
 */
export const idleDays = (
  deal: TStallable,
  stage: TStallLimit | null | undefined,
  now: number = Date.now()
): number | null => {
  if (!stage || stage.stalledAfterDays === null) return null
  if ((deal.status ?? 'open') !== 'open' || deal.archivedAt) return null
  const since = idleSince(deal)
  if (Number.isNaN(since)) return null
  const days = Math.max(0, Math.floor((now - since) / DAY_MS))
  return days > stage.stalledAfterDays ? days : null
}

/** "Idle 12 days", as cards and rows say it. */
export const idleLabel = (days: number): string =>
  `Idle ${days} ${days === 1 ? 'day' : 'days'}`
