import { useState, type FormEvent, type KeyboardEvent } from 'react'

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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea
} from '@/components/ui/input-group'
import { Menu, type TMenuItem } from '@/components/ui/menu'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport
} from '@/components/ui/message-scroller'

import { AskTurnView } from './ask-turn'
import type { TAskSession } from './use-ask-session'

type TAskPanelProps = {
  // What the rep is looking at, like "Looking at Halden Capital".
  context: string
  session: TAskSession
  onClose: () => void
}

/**
 * Ask AI: the rep's own tool reads through sales tools only and proposes
 * changes, and a person approves each one. Built from shadcn's AI Elements:
 * the thread is a Message Scroller, the box at the bottom a Prompt Input.
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

  const sendQuestion = () => {
    if (!trimmedQuestion || !scenarios[0]) return
    session.startScenario(scenarios[0], trimmedQuestion)
    setQuestionText('')
  }

  const handleSubmit = (submitEvent: FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault()
    sendQuestion()
  }

  // Enter sends; Shift+Enter starts a new line.
  const handleKeyDown = (keyEvent: KeyboardEvent<HTMLTextAreaElement>) => {
    if (keyEvent.key !== 'Enter' || keyEvent.shiftKey) return
    if (keyEvent.nativeEvent.isComposing) return
    keyEvent.preventDefault()
    sendQuestion()
  }

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

      <MessageScrollerProvider autoScroll>
        <MessageScroller className="flex-1">
          <MessageScrollerViewport aria-label="Questions and answers">
            <MessageScrollerContent>
              {hasTurns ? null : (
                <div className="flex flex-col gap-2.5">
                  <p className="m-0 text-body-sm text-muted-foreground">
                    It reads through sales tools only, and it asks you before
                    changing anything.
                  </p>
                  <div className="flex flex-col items-start gap-1.5">
                    {scenarios.map((scenario) => (
                      <Button
                        key={scenario.id}
                        className="max-w-full"
                        leadIcon={scenario.icon ?? SparklesIcon}
                        variant="secondary"
                        onClick={() => session.startScenario(scenario)}
                      >
                        {scenario.label}
                      </Button>
                    ))}
                  </div>
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
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      <form className="mx-2.5 mb-2.5 flex-none" onSubmit={handleSubmit}>
        <InputGroup variant="float">
          <InputGroupTextarea
            aria-label="Ask a question"
            placeholder="Ask about this, or anything in your pipeline"
            rows={2}
            value={questionText}
            onChange={(changeEvent) =>
              setQuestionText(changeEvent.target.value)
            }
            onKeyDown={handleKeyDown}
          />
          <InputGroupAddon align="block-end">
            <Menu
              align="start"
              items={engineMenuItems}
              label="AI tool"
              side="top"
              trigger={
                <InputGroupButton
                  trailIcon={ArrowDown01Icon}
                  variant="secondary"
                >
                  {engine}
                </InputGroupButton>
              }
            />
            <InputGroupButton
              aria-label="Send"
              className="ml-auto"
              disabled={!trimmedQuestion}
              leadIcon={ArrowUp02Icon}
              size="md"
              type="submit"
              variant="primary"
            />
          </InputGroupAddon>
        </InputGroup>
      </form>
    </aside>
  )
}
