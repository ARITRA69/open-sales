import { useState } from 'react'

import {
  Link01Icon,
  Loading03Icon,
  Mail01Icon,
  SquareLock02Icon,
  Tick02Icon
} from '@hugeicons/core-free-icons'

import { Link } from '@/components/shared/link'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/controls'
import { Field } from '@/components/ui/field'
import { Icon } from '@/components/ui/icon'
import { Banner } from '@/components/ui/kit'
import { cn } from '@/lib/utils'

import { AskProposalCard } from './ask-proposal-card'
import type { TAskEmail, TAskScenario, TAskTurn } from './ask-types'
import { fillScenario, type TAskSession } from './use-ask-session'

export const ASK_SUGGESTION_CLASS =
  'bg-muted hover:bg-secondary rounded-row flex w-full items-center gap-2.5 border-none px-3 py-2 text-left text-sm font-medium transition-colors keyboard-focus:shadow-(--halo-keyboard) outline-none'

type TAskStepsProps = { turn: TAskTurn; scenario: TAskScenario }

const AskSteps = ({ turn, scenario }: TAskStepsProps) => (
  <div
    className="flex flex-col gap-2.5 rounded-card bg-muted p-3.5"
    role="status"
  >
    <span className="text-body-sm font-semibold">
      {turn.engine} is working on this computer
    </span>
    {scenario.steps.map((stepLabel, stepIndex) => {
      const isDone = stepIndex < turn.step
      const isNow = stepIndex === turn.step

      return (
        <div
          key={stepLabel}
          className={cn(
            'flex items-center gap-2.5 text-sm',
            isNow && 'font-semibold',
            !isDone && !isNow && 'text-muted-foreground'
          )}
        >
          <span
            className={cn(
              'flex size-5 flex-none items-center justify-center rounded-full',
              isDone && 'bg-success text-primary-foreground',
              isNow && 'text-accent',
              !isDone && !isNow && 'bg-input'
            )}
          >
            {isDone ? (
              <Icon icon={Tick02Icon} size={13} strokeWidth={1.6} />
            ) : null}
            {isNow ? (
              <span className="flex animate-spin">
                <Icon icon={Loading03Icon} size={18} strokeWidth={1.6} />
              </span>
            ) : null}
          </span>
          <span>{stepLabel}</span>
        </div>
      )
    })}
  </div>
)

const AskEmail = ({ email }: { email: TAskEmail }) => {
  const [isOpened, setIsOpened] = useState(false)
  const [isCopied, setIsCopied] = useState(false)

  return (
    <div className="flex flex-col gap-2.5 rounded-card bg-muted p-3.5 text-sm">
      <span className="text-body-sm text-muted-foreground">To {email.to}</span>
      <b className="font-semibold">{email.subject}</b>
      <span className="whitespace-pre-line">{email.body}</span>
      <span className="flex items-center gap-2 pt-0.5">
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
      </span>
      <span className="text-body-sm text-muted-foreground">
        It opens in your mail app, so you read it before it goes.
      </span>
    </div>
  )
}

type TAskAnswerProps = {
  turn: TAskTurn
  scenario: TAskScenario
  session: TAskSession
  isLatest: boolean
}

const AskAnswer = ({ turn, scenario, session, isLatest }: TAskAnswerProps) => {
  const stepCount = scenario.steps.length
  const canSavePlaybook = !scenario.blocked && !scenario.blanks
  const followScenarios = isLatest
    ? (scenario.follow ?? []).flatMap((scenarioId) =>
        session.scenarios.filter(
          (otherScenario) => otherScenario.id === scenarioId
        )
      )
    : []

  return (
    <div className="flex flex-col gap-3">
      <span className="text-body-sm text-muted-foreground">
        {stepCount} {stepCount === 1 ? 'step' : 'steps'} · {turn.engine} · every
        read is logged
      </span>
      {scenario.intro ? (
        <p className="m-0 text-body-lg leading-5.5">{scenario.intro}</p>
      ) : null}
      {scenario.bullets?.map((bullet) => (
        <div
          key={bullet.text}
          className="flex flex-col items-start gap-1 text-body-lg leading-5.5"
        >
          <span>{bullet.text}</span>
          <Link
            className="inline-flex h-[22px] items-center gap-1 rounded-full bg-secondary px-2 text-xs font-semibold whitespace-nowrap text-foreground-soft no-underline hover:bg-input hover:text-foreground"
            href={bullet.href ?? '#'}
          >
            <Icon icon={Link01Icon} size={12} strokeWidth={1.6} />
            {bullet.source}
          </Link>
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
        <div className="flex flex-col gap-1.5 pt-1">
          {followScenarios.map((followScenario) => (
            <button
              key={followScenario.id}
              className={cn(ASK_SUGGESTION_CLASS, 'min-h-[38px] text-body-sm')}
              type="button"
              onClick={() => session.startScenario(followScenario)}
            >
              {followScenario.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
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

  return (
    <>
      <div className="box-border max-w-[85%] self-end rounded-card bg-secondary px-3.5 py-2.5 text-sm">
        {turn.question}
      </div>

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
        <div className="flex flex-col gap-3 rounded-card bg-muted p-3.5">
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
          <div className="flex justify-end">
            <Button
              disabled={hasOpenBlanks}
              size="sm"
              onClick={() => session.runTurn(turn)}
            >
              Run playbook
            </Button>
          </div>
        </div>
      ) : null}

      {turn.phase === 'run' ? (
        <AskSteps scenario={scenario} turn={turn} />
      ) : null}

      {turn.phase === 'limit' ? (
        <Banner className="flex-col items-stretch gap-2.5">
          <span>
            <b className="font-semibold">{turn.engine} has hit its limit.</b> It
            comes back at 4:00 pm. Your question is saved.
          </span>
          <span className="flex gap-2">
            <Button size="sm" onClick={() => session.switchToOtherEngine(turn)}>
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
    </>
  )
}
