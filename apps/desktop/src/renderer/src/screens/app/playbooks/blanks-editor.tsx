import { useState } from 'react'

import {
  Add01Icon,
  Cancel01Icon,
  Delete02Icon
} from '@hugeicons/core-free-icons'
import { MAX_BLANK_OPTIONS, MAX_PLAYBOOK_BLANKS } from '@open-sales/shared'
import { AnimatePresence, motion } from 'motion/react'

import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'

/** A blank while it's being written. `key` only tells the rows apart. */
export type TBlankDraft = {
  key: string
  name: string
  question: string
  options: string[]
}

let nextKey = 0
export const newBlankDraft = (
  blank: Partial<Omit<TBlankDraft, 'key'>> = {}
): TBlankDraft => ({
  key: `blank-${(nextKey += 1)}`,
  name: blank.name ?? '',
  question: blank.question ?? '',
  options: blank.options ?? []
})

type TBlanksEditorProps = {
  blanks: TBlankDraft[]
  // Shows the blanks without any way to change them.
  readOnly?: boolean
  onChange: (blanks: TBlankDraft[]) => void
  // Writes `{Name}` into the steps, for people who'd rather click.
  onUseInSteps: (name: string) => void
}

/**
 * The questions a playbook asks before it runs. Each has a short name the
 * steps refer to, the question itself, and options to pick from; with no
 * options the person types an answer.
 */
export const BlanksEditor = ({
  blanks,
  readOnly = false,
  onChange,
  onUseInSteps
}: TBlanksEditorProps) => {
  const change = (key: string, changes: Partial<TBlankDraft>) =>
    onChange(
      blanks.map((blank) =>
        blank.key === key ? { ...blank, ...changes } : blank
      )
    )

  return (
    <div className="flex flex-col gap-2">
      <AnimatePresence initial={false}>
        {blanks.map((blank, index) => (
          <motion.div
            key={blank.key}
            animate={{ opacity: 1, height: 'auto' }}
            className="overflow-hidden"
            exit={{ opacity: 0, height: 0 }}
            initial={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
          >
            <BlankCard
              blank={blank}
              position={index + 1}
              readOnly={readOnly}
              onChange={(changes) => change(blank.key, changes)}
              onRemove={() =>
                onChange(blanks.filter((other) => other.key !== blank.key))
              }
              onUseInSteps={() => onUseInSteps(blank.name.trim())}
            />
          </motion.div>
        ))}
      </AnimatePresence>
      {readOnly ? (
        blanks.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">
            It asks nothing before it runs.
          </p>
        ) : null
      ) : (
        <div>
          <Button
            disabled={blanks.length >= MAX_PLAYBOOK_BLANKS}
            leadIcon={Add01Icon}
            size="sm"
            variant="secondary"
            onClick={() => onChange([...blanks, newBlankDraft()])}
          >
            Add a blank
          </Button>
        </div>
      )}
    </div>
  )
}

type TBlankCardProps = {
  blank: TBlankDraft
  // 1, 2, 3…: names the card until the blank has a name of its own.
  position: number
  readOnly: boolean
  onChange: (changes: Partial<TBlankDraft>) => void
  onRemove: () => void
  onUseInSteps: () => void
}

const BlankCard = ({
  blank,
  position,
  readOnly,
  onChange,
  onRemove,
  onUseInSteps
}: TBlankCardProps) => {
  // An option being typed, before Enter adds it.
  const [typed, setTyped] = useState('')
  const called = blank.name.trim() || `blank ${position}`
  const isFull = blank.options.length >= MAX_BLANK_OPTIONS

  const addOption = () => {
    const option = typed.trim()
    setTyped('')
    if (!option || isFull || blank.options.includes(option)) return
    onChange({ options: [...blank.options, option] })
  }

  return (
    // The 2px margin keeps the card's soft shadow inside the folding wrapper.
    <fieldset
      aria-label={`Blank: ${called}`}
      className="m-0.5 flex min-w-0 flex-col gap-3 rounded-card border-0 bg-background p-3 shadow-(--shadow-tile)"
    >
      <div className="flex items-end gap-2">
        <Field
          className="w-44 flex-none"
          label="Name"
          placeholder="Plan"
          readOnly={readOnly}
          value={blank.name}
          onChange={(event) => onChange({ name: event.target.value })}
        />
        <Field
          label="Question to ask"
          placeholder="Which plan did they pick?"
          readOnly={readOnly}
          value={blank.question}
          onChange={(event) => onChange({ question: event.target.value })}
        />
        {readOnly ? null : (
          <Button
            aria-label={`Remove ${called}`}
            leadIcon={Delete02Icon}
            variant="ghost"
            onClick={onRemove}
          />
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-body-sm font-semibold text-foreground">
          Options
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {blank.options.map((option) => (
            <span
              key={option}
              className="inline-flex h-7 max-w-full items-center gap-1 rounded-full bg-secondary pr-1 pl-3 text-sm font-medium text-secondary-foreground"
            >
              <span className="truncate">{option}</span>
              {readOnly ? (
                <span className="w-1.5" />
              ) : (
                <button
                  aria-label={`Remove option ${option}`}
                  className="inline-flex size-5 flex-none items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 outline-none hover:bg-secondary-hover hover:text-foreground keyboard-focus:shadow-(--halo-keyboard)"
                  type="button"
                  onClick={() =>
                    onChange({
                      options: blank.options.filter((other) => other !== option)
                    })
                  }
                >
                  <Icon icon={Cancel01Icon} size={12} />
                </button>
              )}
            </span>
          ))}
          {readOnly ? (
            blank.options.length === 0 ? (
              <span className="text-sm text-muted-foreground">
                None: the person types an answer.
              </span>
            ) : null
          ) : (
            <Input
              aria-label={`Add an option to ${called}`}
              className="h-7 w-44 flex-none"
              disabled={isFull}
              placeholder={
                isFull ? 'That’s the most it takes' : 'Add an option'
              }
              value={typed}
              // Leaving the box keeps what was typed, so Save never loses it.
              onBlur={addOption}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ',') return
                event.preventDefault()
                addOption()
              }}
            />
          )}
        </div>
        {readOnly ? null : (
          <p className="m-0 flex flex-wrap items-center gap-x-1.5 text-body-sm text-muted-foreground">
            {blank.options.length === 0
              ? 'With no options, the person types an answer.'
              : 'Press Enter after each option.'}
            {blank.name.trim() ? (
              <>
                <span>
                  The answer goes where the steps say{' '}
                  <span className="font-semibold text-foreground">{`{${blank.name.trim()}}`}</span>
                  .
                </span>
                <Button size="sm" variant="link" onClick={onUseInSteps}>
                  Add it to the steps
                </Button>
              </>
            ) : null}
          </p>
        )}
      </div>
    </fieldset>
  )
}
