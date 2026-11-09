import { useEffect, useRef, useState } from 'react'

import type {
  TApprovedAskCard,
  TAskCard,
  TAskCardRow,
  TAskCardStatus,
  TAskScenario,
  TAskTurn
} from './ask-types'

const STEP_MS = 800
const LIMITED_ENGINE = 'Claude Code'
const OTHER_ENGINE = 'Codex'

const DEFAULT_CALL_NOTES =
  'Spoke to Priya and Dan. They like the trial and want 25 seats from January. Dan needs pricing by Friday for his budget review. Worried about how long setup and training will take.'

const fillBlanks = (text: string, picks: Record<string, string>) =>
  text.replace(
    /\[(\w+)\]/g,
    (placeholder, key: string) => picks[key] || placeholder
  )

/** A scenario with the person's blank answers written into its copy. */
export const fillScenario = (
  scenario: TAskScenario,
  picks: Record<string, string>
): TAskScenario =>
  scenario.blanks
    ? {
        ...scenario,
        intro: scenario.intro && fillBlanks(scenario.intro, picks),
        bullets: scenario.bullets?.map((bullet) => ({
          ...bullet,
          text: fillBlanks(bullet.text, picks)
        })),
        cards: scenario.cards?.map((card) => ({
          ...card,
          title: fillBlanks(card.title, picks),
          why: card.why && fillBlanks(card.why, picks),
          doneText: card.doneText && fillBlanks(card.doneText, picks),
          rows: card.rows.map((row) => ({
            ...row,
            to: fillBlanks(row.to, picks)
          }))
        }))
      }
    : scenario

type TUseAskSessionArgs = {
  scenarios: TAskScenario[]
  // `limit` makes Claude Code run out partway, to show the fallback.
  problem?: 'none' | 'limit'
  // The stage the deal is in now, to catch a change made after AI proposed one.
  liveStage?: string
  onApprove?: (approvedCard: TApprovedAskCard) => void
  onUndo?: (askCard: TAskCard) => void
}

/**
 * Everything the Ask panel remembers. Runs are scripted for now: steps advance
 * on a timer. The real engines replace `runSteps` once the Electron bridge to
 * Claude Code and Codex exists.
 */
export const useAskSession = ({
  scenarios,
  problem = 'none',
  liveStage,
  onApprove,
  onUndo
}: TUseAskSessionArgs) => {
  // One running timer per question, so switching tools can't double its pace.
  const stepTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const [turns, setTurns] = useState<TAskTurn[]>([])
  const [engine, setEngine] = useState(LIMITED_ENGINE)
  const [callNotes, setCallNotes] = useState(DEFAULT_CALL_NOTES)
  const [blankPicks, setBlankPicks] = useState<
    Record<string, Record<string, string>>
  >({})
  const [cardStatuses, setCardStatuses] = useState<
    Record<string, TAskCardStatus>
  >({})
  const [rowEdits, setRowEdits] = useState<Record<string, string>>({})
  const [editingCards, setEditingCards] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const timers = stepTimers.current
    return () => timers.forEach((stepTimer) => clearTimeout(stepTimer))
  }, [])

  const updateTurn = (turnId: string, change: (turn: TAskTurn) => TAskTurn) =>
    setTurns((currentTurns) =>
      currentTurns.map((turn) => (turn.id === turnId ? change(turn) : turn))
    )

  const advanceTurn = (turn: TAskTurn): TAskTurn => {
    if (turn.phase !== 'run') return turn
    if (turn.hitsLimit && turn.step >= 1) return { ...turn, phase: 'limit' }
    const nextStep = turn.step + 1
    return nextStep >= turn.scenario.steps.length
      ? { ...turn, step: nextStep, phase: 'done' }
      : { ...turn, step: nextStep }
  }

  const runSteps = (turnId: string, stepsLeft: number) => {
    clearTimeout(stepTimers.current.get(turnId))
    stepTimers.current.delete(turnId)
    if (stepsLeft <= 0) return
    stepTimers.current.set(
      turnId,
      setTimeout(() => {
        updateTurn(turnId, advanceTurn)
        runSteps(turnId, stepsLeft - 1)
      }, STEP_MS)
    )
  }

  const startScenario = (scenario: TAskScenario, question?: string) => {
    const turnId = crypto.randomUUID()
    const startsRunning = !scenario.askNotes && !scenario.blanks

    setTurns((currentTurns) => [
      ...currentTurns,
      {
        id: turnId,
        question: question || scenario.label,
        scenario,
        engine,
        step: 0,
        phase: scenario.askNotes ? 'notes' : scenario.blanks ? 'blanks' : 'run',
        hitsLimit: problem === 'limit' && engine === LIMITED_ENGINE
      }
    ])
    if (startsRunning) runSteps(turnId, scenario.steps.length)
  }

  const runTurn = (turn: TAskTurn) => {
    updateTurn(turn.id, (currentTurn) => ({ ...currentTurn, phase: 'run' }))
    runSteps(turn.id, turn.scenario.steps.length)
  }

  const switchToOtherEngine = (turn: TAskTurn) => {
    setEngine(OTHER_ENGINE)
    updateTurn(turn.id, (currentTurn) => ({
      ...currentTurn,
      engine: OTHER_ENGINE,
      hitsLimit: false,
      phase: 'run',
      step: 1
    }))
    runSteps(turn.id, turn.scenario.steps.length - 1)
  }

  const clearTurns = () => {
    stepTimers.current.forEach((stepTimer) => clearTimeout(stepTimer))
    stepTimers.current.clear()
    setTurns([])
  }

  const setCardStatus = (cardKey: string, cardStatus: TAskCardStatus) => {
    setCardStatuses((current) => ({ ...current, [cardKey]: cardStatus }))
    setEditingCards((current) => ({ ...current, [cardKey]: false }))
  }

  const rowsWithEdits = (cardKey: string, rows: TAskCardRow[]) =>
    rows.map((row, rowIndex) => ({
      ...row,
      to: rowEdits[`${cardKey}:${rowIndex}`] ?? row.to
    }))

  const approveCard = (turn: TAskTurn, askCard: TAskCard, force = false) => {
    const cardKey = `${turn.id}:${askCard.id}`
    const isStale =
      askCard.kind === 'stage' &&
      Boolean(liveStage) &&
      askCard.rows[0]?.from !== liveStage

    if (isStale && !force) {
      setCardStatus(cardKey, 'conflict')
      return
    }
    setCardStatus(cardKey, 'approved')
    onApprove?.({
      ...askCard,
      engine: turn.engine,
      rows: rowsWithEdits(cardKey, askCard.rows)
    })
  }

  const undoCard = (turn: TAskTurn, askCard: TAskCard) => {
    const cardKey = `${turn.id}:${askCard.id}`
    if (cardStatuses[cardKey] === 'approved') onUndo?.(askCard)
    setCardStatus(cardKey, 'pending')
  }

  return {
    scenarios,
    turns,
    engine,
    setEngine,
    callNotes,
    setCallNotes,
    blankPicks,
    pickBlank: (turnId: string, blankKey: string, choice: string) =>
      setBlankPicks((current) => ({
        ...current,
        [turnId]: { ...current[turnId], [blankKey]: choice }
      })),
    cardStatuses,
    editingCards,
    rowsWithEdits,
    editRow: (cardKey: string, rowIndex: number, text: string) =>
      setRowEdits((current) => ({
        ...current,
        [`${cardKey}:${rowIndex}`]: text
      })),
    toggleEditing: (cardKey: string) =>
      setEditingCards((current) => ({
        ...current,
        [cardKey]: !current[cardKey]
      })),
    liveStage,
    startScenario,
    runTurn,
    switchToOtherEngine,
    parkTurn: (turnId: string) =>
      updateTurn(turnId, (currentTurn) => ({
        ...currentTurn,
        phase: 'parked'
      })),
    clearTurns,
    approveCard,
    declineCard: (cardKey: string) => setCardStatus(cardKey, 'declined'),
    undoCard
  }
}

export type TAskSession = ReturnType<typeof useAskSession>
