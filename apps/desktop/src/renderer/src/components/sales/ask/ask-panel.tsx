import { useState } from 'react'

import {
  ArrowDown01Icon,
  ArrowUp02Icon,
  Cancel01Icon,
  ComputerTerminal01Icon,
  PlusSignIcon,
  Settings01Icon,
  SparklesIcon
} from '@hugeicons/core-free-icons'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Menu, type TMenuItem } from '@/components/ui/menu'

import { ASK_SUGGESTION_CLASS, AskTurnView } from './ask-turn'
import type { TAskSession } from './use-ask-session'

type TAskPanelProps = {
  // What the rep is looking at, like "Looking at Halden Capital".
  context: string
  session: TAskSession
  onClose: () => void
}

/**
 * Ask AI: the rep's own tool reads through sales tools only and proposes
 * changes, and a person approves each one.
 */
export const AskPanel = ({ context, session, onClose }: TAskPanelProps) => {
  const [questionText, setQuestionText] = useState('')

  const { scenarios, turns, engine } = session
  const trimmedQuestion = questionText.trim()
  const hasTurns = turns.length > 0
  const lastTurnId = turns.at(-1)?.id

  const engineMenuItems: TMenuItem[] = [
    {
      label: 'Claude Code',
      hint: 'Ready',
      icon: ComputerTerminal01Icon,
      onSelect: () => session.setEngine('Claude Code')
    },
    {
      label: 'Codex',
      hint: 'Ready',
      icon: ComputerTerminal01Icon,
      onSelect: () => session.setEngine('Codex')
    },
    { line: true },
    { label: 'Manage AI tools', icon: Settings01Icon, href: '#/settings' }
  ]

  return (
    <aside
      aria-label="Ask AI"
      className="sales-ask-panel relative box-border flex h-full w-90 flex-none flex-col bg-background text-foreground shadow-(--shadow-panel-edge)"
    >
      <div className="box-border flex h-12 flex-none items-center gap-2 pr-2 pl-4">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm leading-4.5 font-semibold">
            Ask AI
          </span>
          <span className="truncate text-xs leading-3.5 text-muted-foreground">
            {context}
          </span>
        </div>
        <Button
          aria-label="New question"
          hidden={!hasTurns}
          leadIcon={PlusSignIcon}
          title="New question"
          variant="ghost"
          onClick={session.clearTurns}
        />
        <Button
          aria-label="Close Ask AI"
          leadIcon={Cancel01Icon}
          title="Close"
          variant="ghost"
          onClick={onClose}
        />
      </div>

      <div className="box-border flex min-h-0 flex-1 scrollbar-thin flex-col gap-3 overflow-y-auto px-4 py-3">
        {hasTurns ? null : (
          <div className="flex flex-col gap-1.5">
            <p className="m-0 mb-1 text-body-sm text-muted-foreground">
              It reads through sales tools only, and it asks you before changing
              anything.
            </p>
            {scenarios.map((scenario) => (
              <button
                key={scenario.id}
                className={ASK_SUGGESTION_CLASS}
                type="button"
                onClick={() => session.startScenario(scenario)}
              >
                <Icon
                  className="flex-none"
                  icon={scenario.icon ?? SparklesIcon}
                  size={16}
                  strokeWidth={1.7}
                />
                <span>{scenario.label}</span>
              </button>
            ))}
          </div>
        )}
        {turns.map((turn) => (
          <AskTurnView
            key={turn.id}
            isLatest={turn.id === lastTurnId}
            session={session}
            turn={turn}
          />
        ))}
      </div>

      <div className="mx-2.5 mb-2.5 flex flex-col gap-1 rounded-dialog bg-background py-2 pr-2 pl-3 shadow-(--shadow-float)">
        <textarea
          aria-label="Ask a question"
          className="box-border w-full resize-none border-none bg-transparent pt-1 text-sm leading-5 text-foreground outline-none placeholder:text-faint"
          placeholder="Ask about this, or anything in your pipeline"
          rows={2}
          value={questionText}
          onChange={(changeEvent) => setQuestionText(changeEvent.target.value)}
        />
        <div className="flex items-center gap-2">
          <Menu
            align="start"
            items={engineMenuItems}
            label="AI tool"
            side="top"
            trigger={
              <Button size="sm" trailIcon={ArrowDown01Icon} variant="secondary">
                {engine}
              </Button>
            }
          />
          <Button
            aria-label="Send"
            className="ml-auto"
            disabled={!trimmedQuestion}
            leadIcon={ArrowUp02Icon}
            onClick={() => {
              if (!trimmedQuestion || !scenarios[0]) return
              session.startScenario(scenarios[0], trimmedQuestion)
              setQuestionText('')
            }}
          />
        </div>
      </div>
    </aside>
  )
}
