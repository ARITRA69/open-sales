import { useState } from 'react'

import {
  Link01Icon,
  Loading03Icon,
  Mail01Icon,
  SquareLock02Icon,
  Tick02Icon
} from '@hugeicons/core-free-icons'

import { Link } from '@/components/shared/link'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/controls'
import { Field } from '@/components/ui/field'
import { Icon } from '@/components/ui/icon'
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemTitle
} from '@/components/ui/item'
import { Banner } from '@/components/ui/kit'
import { Message, MessageContent } from '@/components/ui/message'
import { MessageScrollerItem } from '@/components/ui/message-scroller'
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle
} from '@/components/ui/trace'

import { AskProposalCard } from './ask-proposal-card'
import type { TAskEmail, TAskScenario, TAskTurn } from './ask-types'
import { fillScenario, type TAskSession } from './use-ask-session'

type TAskStepsProps = { turn: TAskTurn; scenario: TAskScenario }

/**
 * What the tool is doing, one line per step. It stays open while the tool
 * works, then folds into a summary a person can open again.
 */
const AskSteps = ({ turn, scenario }: TAskStepsProps) => {
  // Until someone opens or closes it, it's open only while the tool works.
  const [isOpen, setIsOpen] = useState<boolean>()

  const isRunning = turn.phase === 'run'
  const stepCount = scenario.steps.length

  return (
    <Trace role={isRunning ? 'status' : undefined}>
      <TraceCollapsible open={isOpen ?? isRunning} onOpenChange={setIsOpen}>
        <TraceCollapsibleTrigger>
          <TraceLine status={isRunning ? 'running' : undefined}>
            <TraceTitle>
              {isRunning
                ? `${turn.engine} is working on this computer`
                : `${stepCount} ${stepCount === 1 ? 'step' : 'steps'} · ${turn.engine} · every read is logged`}
            </TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          <Trace>
            {scenario.steps.map((stepLabel, stepIndex) => {
              const isDone = stepIndex < turn.step
              const isNow = isRunning && stepIndex === turn.step

              return (
                <TraceLine
                  key={stepLabel}
                  status={isNow ? 'running' : isDone ? undefined : 'pending'}
                >
                  <TraceIcon>
                    {isDone ? (
                      <Icon icon={Tick02Icon} size={14} />
                    ) : isNow ? (
                      <span className="flex animate-spin">
                        <Icon icon={Loading03Icon} size={14} />
                      </span>
                    ) : null}
                  </TraceIcon>
                  <TraceTitle>{stepLabel}</TraceTitle>
                </TraceLine>
              )
            })}
          </Trace>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  )
}

const AskEmail = ({ email }: { email: TAskEmail }) => {
  const [isOpened, setIsOpened] = useState(false)
  const [isCopied, setIsCopied] = useState(false)

  return (
    <Item variant="muted">
      <ItemContent>
        <ItemDescription>To {email.to}</ItemDescription>
        <ItemTitle>{email.subject}</ItemTitle>
        <span className="whitespace-pre-line">{email.body}</span>
      </ItemContent>
      <ItemFooter>
        <Button
          leadIcon={Mail01Icon}
          size="sm"
          onClick={() => setIsOpened(true)}
        >
          {isOpened ? 'Opened in your mail app' : 'Open in mail app'}
        </Button>
        <Button
          size="sm"
          variant="white"
          onClick={() => {
            void navigator.clipboard.writeText(email.body)
            setIsCopied(true)
          }}
        >
          {isCopied ? 'Copied' : 'Copy'}
        </Button>
      </ItemFooter>
      <ItemDescription className="basis-full">
        It opens in your mail app, so you read it before it goes.
      </ItemDescription>
    </Item>
  )
}

type TAskAnswerProps = {
  turn: TAskTurn
  scenario: TAskScenario
  session: TAskSession
  isLatest: boolean
}

const AskAnswer = ({ turn, scenario, session, isLatest }: TAskAnswerProps) => {
  const canSavePlaybook = !scenario.blocked && !scenario.blanks
  const followScenarios = isLatest
    ? (scenario.follow ?? []).flatMap((scenarioId) =>
        session.scenarios.filter(
          (otherScenario) => otherScenario.id === scenarioId
        )
      )
    : []

  return (
    <>
      {scenario.intro ? (
        <p className="m-0 text-base">{scenario.intro}</p>
      ) : null}
      {scenario.bullets?.map((bullet) => (
        <div key={bullet.text} className="flex flex-col gap-1 text-base">
          <span>{bullet.text}</span>
          <Trace>
            <Link href={bullet.href ?? '#'}>
              <TraceLine size="sm">
                <TraceIcon>
                  <Icon icon={Link01Icon} size={13} />
                </TraceIcon>
                <TraceTitle>{bullet.source}</TraceTitle>
              </TraceLine>
            </Link>
          </Trace>
        </div>
      ))}
      {scenario.blocked ? (
        <Banner className="items-start">
          <Icon
            className="mt-px flex-none"
            icon={SquareLock02Icon}
            size={18}
            strokeWidth={1.6}
          />
          <span>
            <b className="font-semibold">I can&apos;t see that.</b>{' '}
            {scenario.blocked}
          </span>
        </Banner>
      ) : null}
      {scenario.email ? <AskEmail email={scenario.email} /> : null}
      {scenario.cards?.map((askCard) => (
        <AskProposalCard
          key={askCard.id}
          askCard={askCard}
          session={session}
          turn={turn}
        />
      ))}
      {canSavePlaybook ? (
        <Button
          className="self-start"
          href="#/playbooks"
          size="sm"
          variant="link"
        >
          Save this as a playbook
        </Button>
      ) : null}
      {followScenarios.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {followScenarios.map((followScenario) => (
            <Button
              key={followScenario.id}
              className="max-w-full"
              size="sm"
              variant="secondary"
              onClick={() => session.startScenario(followScenario)}
            >
              {followScenario.label}
            </Button>
          ))}
        </div>
      ) : null}
    </>
  )
}

type TAskTurnViewProps = {
  turn: TAskTurn
  session: TAskSession
  isLatest: boolean
}

/** One question: what was asked, then whichever stage its answer has reached. */
export const AskTurnView = ({ turn, session, isLatest }: TAskTurnViewProps) => {
  const blankPicks = session.blankPicks[turn.id] ?? {}
  const scenario = fillScenario(turn.scenario, blankPicks)
  const hasOpenBlanks = (scenario.blanks ?? []).some(
    (blank) => !blankPicks[blank.key]
  )
  const hasReply = turn.phase !== 'parked'

  return (
    <>
      {/* The question is the anchor: it settles at the top as the reply grows. */}
      <MessageScrollerItem scrollAnchor messageId={turn.id}>
        <Message align="end">
          <MessageContent>
            <Bubble align="end">
              <BubbleContent>{turn.question}</BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      </MessageScrollerItem>

      {hasReply ? (
        <MessageScrollerItem messageId={`${turn.id}:reply`}>
          <Message>
            <MessageContent>
              {turn.phase === 'notes' ? (
                <div className="flex flex-col gap-2">
                  <Field
                    kind="textarea"
                    label="What happened on the call?"
                    rows={6}
                    value={session.callNotes}
                    onChange={(changeEvent) =>
                      session.setCallNotes(changeEvent.target.value)
                    }
                  />
                  <div className="flex justify-end">
                    <Button onClick={() => session.runTurn(turn)}>
                      Turn into actions
                    </Button>
                  </div>
                </div>
              ) : null}

              {turn.phase === 'blanks' ? (
                <Item variant="muted">
                  <ItemContent>
                    {scenario.blanks?.map((blank) => (
                      <div
                        key={blank.key}
                        className="flex flex-col gap-1.5 text-body-sm font-semibold"
                      >
                        {blank.label}
                        <div className="flex flex-wrap gap-1.5">
                          {blank.options.map((option) => (
                            <Chip
                              key={option}
                              active={blankPicks[blank.key] === option}
                              onClick={() =>
                                session.pickBlank(turn.id, blank.key, option)
                              }
                            >
                              {option}
                            </Chip>
                          ))}
                        </div>
                      </div>
                    ))}
                  </ItemContent>
                  <ItemFooter className="justify-end">
                    <Button
                      disabled={hasOpenBlanks}
                      size="sm"
                      onClick={() => session.runTurn(turn)}
                    >
                      Run playbook
                    </Button>
                  </ItemFooter>
                </Item>
              ) : null}

              {turn.phase === 'run' || turn.phase === 'done' ? (
                <AskSteps scenario={scenario} turn={turn} />
              ) : null}

              {turn.phase === 'limit' ? (
                <Banner className="flex-col items-stretch gap-2">
                  <span>
                    <b className="font-semibold">
                      {turn.engine} has hit its limit.
                    </b>{' '}
                    It comes back at 4:00 pm. Your question is saved.
                  </span>
                  <span className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => session.switchToOtherEngine(turn)}
                    >
                      Ask Codex instead
                    </Button>
                    <Button
                      size="sm"
                      variant="white"
                      onClick={() => session.parkTurn(turn.id)}
                    >
                      Try later
                    </Button>
                  </span>
                </Banner>
              ) : null}

              {turn.phase === 'done' ? (
                <AskAnswer
                  isLatest={isLatest}
                  scenario={scenario}
                  session={session}
                  turn={turn}
                />
              ) : null}
            </MessageContent>
          </Message>
        </MessageScrollerItem>
      ) : null}
    </>
  )
}
