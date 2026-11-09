import type { TIcon } from '@/components/ui/icon'

export type TAskCardRow = { label: string; from?: string; to: string }

/** A change AI proposes. Nothing is saved until a person approves it. */
export type TAskCard = {
  id: string
  kind?: string
  title: string
  why?: string
  rows: TAskCardRow[]
  doneText?: string
}

export type TAskBullet = { text: string; source: string; href?: string }

export type TAskEmail = { to: string; subject: string; body: string }

// A blank a person fills in before a playbook runs. `[key]` in the copy takes its value.
export type TAskBlank = { key: string; label: string; options: string[] }

export type TAskScenario = {
  id: string
  label: string
  icon?: TIcon
  steps: string[]
  askNotes?: boolean
  blanks?: TAskBlank[]
  intro?: string
  bullets?: TAskBullet[]
  // What AI was asked for and can't see.
  blocked?: string
  email?: TAskEmail
  cards?: TAskCard[]
  // Scenario ids to offer next.
  follow?: string[]
}

export type TAskPhase = 'notes' | 'blanks' | 'run' | 'limit' | 'parked' | 'done'

export type TAskTurn = {
  id: string
  question: string
  scenario: TAskScenario
  engine: string
  step: number
  phase: TAskPhase
  // The tool runs out partway through this question.
  hitsLimit: boolean
}

export type TAskCardStatus = 'pending' | 'approved' | 'declined' | 'conflict'

export type TApprovedAskCard = TAskCard & { engine: string }
