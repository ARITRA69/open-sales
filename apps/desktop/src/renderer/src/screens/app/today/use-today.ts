import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { TProposal, TProposalApprove } from '@open-sales/shared'
import { isWaitingProposal } from '@open-sales/shared'

import {
  createPreviewProposals,
  createPreviewTodayItems
} from '@/lib/preview-bridge'

import type {
  TOpenSalesBridge,
  TProposalResult
} from '../../../../../preload/bridge-types'

// How often the app looks for new proposals, until live updates exist.
const CHECK_EVERY_MS = 20_000

export type TProposalsBridge = TOpenSalesBridge['proposals']

export type TCardAction = 'approve' | 'decline' | 'undo' | 'send'

/** A proposal on Today, with what's happening to it right now. */
export type TProposalCard = {
  proposal: TProposal
  // The call in flight, if any.
  busy: TCardAction | null
  // Why the last try didn't work, in people's words.
  problem: string | null
  // The server said this person may no longer make the change.
  noPermission: string | null
}

type TLoaded = {
  cards: TProposalCard[]
  // Proposals waiting beyond the ones loaded.
  beyond: number
  nextCursor: string | null
  problem: string | null
}

const toCard = (proposal: TProposal): TProposalCard => ({
  proposal,
  busy: null,
  problem: null,
  noPermission: null
})

const newestFirst = (a: TProposalCard, b: TProposalCard) =>
  b.proposal.createdAt.localeCompare(a.proposal.createdAt) ||
  b.proposal.id.localeCompare(a.proposal.id)

/** Still for this person to decide. */
export const needsDecision = ({ proposal }: TProposalCard) =>
  isWaitingProposal(proposal.status) && proposal.canDecide

/**
 * The real bridge in Electron; in a browser tab during development,
 * `?preview=…` swaps in pretend proposals.
 */
const findProposalsBridge = (
  records: TOpenSalesBridge['records'] | null
): TProposalsBridge | null =>
  window.openSales?.proposals ??
  (import.meta.env.DEV
    ? createPreviewProposals(window.location.search, records)
    : null)

/**
 * What Today shows: the proposals waiting for this person, and what they've
 * decided since the app opened (so Done and Undo stay put). It lives in the
 * signed-in shell, so the sidebar count and the page agree and decisions
 * survive a visit to another page. Checks again on an interval and when the
 * window comes back into focus.
 */
export const useToday = (
  records: TOpenSalesBridge['records'] | null,
  // Passed in by tests; otherwise found on `window.openSales`.
  given?: TProposalsBridge | null
) => {
  const bridge = useMemo(
    () => (given !== undefined ? given : findProposalsBridge(records)),
    [given, records]
  )
  const [loaded, setLoaded] = useState<TLoaded | null>(null)
  const busyCount = useRef(0)

  /** Folds the server's waiting list into what's on screen. */
  const takeList = useCallback(
    (items: TProposal[], total: number, nextCursor: string | null) =>
      setLoaded((current) => {
        const known = new Map(
          (current?.cards ?? []).map((card) => [card.proposal.id, card])
        )
        const fresh = items.map((proposal) => {
          const before = known.get(proposal.id)
          known.delete(proposal.id)
          return before ? { ...before, proposal } : toCard(proposal)
        })
        // Cards the server no longer lists stay only if they were decided
        // here, or sent on: someone deciding elsewhere takes theirs away.
        const kept = [...known.values()].filter((card) => !needsDecision(card))
        return {
          cards: [...fresh, ...kept].sort(newestFirst),
          beyond: Math.max(0, total - items.length),
          nextCursor,
          problem: null
        }
      }),
    []
  )

  const load = useCallback(async () => {
    if (!bridge) return
    // An answer that lands mid-decision would put the old card back.
    if (busyCount.current > 0) return
    const answer = await bridge.list()
    if (busyCount.current > 0) return
    if (answer.ok) {
      takeList(answer.data.items, answer.data.total, answer.data.nextCursor)
    } else {
      setLoaded(
        (current) =>
          current ?? {
            cards: [],
            beyond: 0,
            nextCursor: null,
            problem: answer.message
          }
      )
    }
  }, [bridge, takeList])

  useEffect(() => {
    if (!bridge) return
    // State is only set in these callbacks, once the main process answers.
    const look = () => void load()
    look()
    const timer = setInterval(look, CHECK_EVERY_MS)
    window.addEventListener('focus', look)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', look)
    }
  }, [bridge, load])

  const patch = (id: string, changes: Partial<TProposalCard>) =>
    setLoaded((current) =>
      current
        ? {
            ...current,
            cards: current.cards.map((card) =>
              card.proposal.id === id ? { ...card, ...changes } : card
            )
          }
        : current
    )

  /** Runs one decision and shows its result on the card. */
  const decide = async (
    id: string,
    action: TCardAction,
    call: (bridge: TProposalsBridge) => Promise<TProposalResult>
  ) => {
    if (!bridge) return false
    busyCount.current += 1
    patch(id, { busy: action, problem: null })
    const result = await call(bridge)
    busyCount.current -= 1

    if (result.ok) {
      patch(id, {
        proposal: result.data,
        busy: null,
        problem: null,
        noPermission: null
      })
      return true
    }
    if (result.proposal) {
      // "Changed since": the card now shows the record's current values.
      patch(id, { proposal: result.proposal, busy: null, problem: null })
    } else if (result.code === 'forbidden') {
      patch(id, { busy: null, problem: null, noPermission: result.message })
    } else {
      patch(id, { busy: null, problem: result.message })
      // Decided somewhere else, or gone: show what the server has now.
      if (result.code === 'already_decided' || result.code === 'not_found') {
        void load()
      }
    }
    return false
  }

  const extras = useMemo(
    () =>
      import.meta.env.DEV
        ? createPreviewTodayItems(window.location.search)
        : null,
    []
  )
  const cards = loaded?.cards ?? []
  const waitingCount =
    cards.filter(needsDecision).length + (loaded?.beyond ?? 0)

  return {
    // False where there's no server to ask: the section stays calm.
    isAvailable: bridge !== null,
    cards,
    state: !bridge
      ? ('ready' as const)
      : loaded === null
        ? ('loading' as const)
        : loaded.problem
          ? ('error' as const)
          : ('ready' as const),
    problem: loaded?.problem ?? null,
    // The sidebar's count: everything still waiting for this person.
    waitingCount,
    hasMore: Boolean(loaded?.nextCursor),
    reload: load,
    loadMore: async () => {
      if (!bridge || !loaded?.nextCursor) return
      const answer = await bridge.list({ cursor: loaded.nextCursor })
      if (!answer.ok) return
      setLoaded((current) => {
        if (!current) return current
        const known = new Set(current.cards.map((card) => card.proposal.id))
        const more = answer.data.items
          .filter((proposal) => !known.has(proposal.id))
          .map(toCard)
        return {
          ...current,
          cards: [...current.cards, ...more].sort(newestFirst),
          beyond: Math.max(0, current.beyond - more.length),
          nextCursor: answer.data.nextCursor
        }
      })
    },
    // As it is, or with values the person edited first. `version` is the
    // record's version they've now seen, for a proposal that went out of date.
    approve: (id: string, input?: TProposalApprove) =>
      decide(id, 'approve', (api) => api.approve(id, input)),
    decline: (id: string, reason?: string) =>
      decide(id, 'decline', (api) => api.decline(id, reason)),
    undo: (id: string) => decide(id, 'undo', (api) => api.undo(id)),
    sendToOwner: (id: string) =>
      decide(id, 'send', (api) => api.sendToOwner(id)),
    // Follow-ups and stalled deals. Only the preview has them until tasks
    // and the idle rule are wired.
    extras
  }
}

export type TTodayControls = ReturnType<typeof useToday>
