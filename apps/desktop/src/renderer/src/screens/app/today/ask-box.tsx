import { useState, type FormEvent } from 'react'

import { ArrowUp02Icon, SparklesIcon } from '@hugeicons/core-free-icons'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { askAi } from './ask'

const DEFAULT_PROMPTS = [
  'Catch me up on my pipeline',
  'Who should I call today?',
  'What changed since yesterday?'
]

type TAskBoxProps = {
  prompts?: string[]
  // Passed in by tests; otherwise the Ask panel is asked.
  onAsk?: (prompt: string) => void
}

/** Today's ask box: a question for AI, with a few to start from. */
export const AskBox = ({
  prompts = DEFAULT_PROMPTS,
  onAsk = (prompt) => askAi({ prompt })
}: TAskBoxProps) => {
  const [question, setQuestion] = useState('')

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const prompt = question.trim()
    if (!prompt) return
    onAsk(prompt)
    setQuestion('')
  }

  return (
    <section aria-label="Ask AI" className="flex flex-col gap-2">
      <form
        className="flex h-11 items-center gap-2 rounded-card bg-background pr-1.5 pl-3 shadow-(--shadow-tile) transition-shadow duration-200 focus-within:shadow-(--shadow-tile-hover)"
        onSubmit={handleSubmit}
      >
        <span className="flex flex-none text-muted-foreground">
          <Icon icon={SparklesIcon} size={16} />
        </span>
        <input
          aria-label="Ask AI about your deals, accounts and people"
          className="h-full min-w-0 flex-1 bg-transparent font-sans text-body-lg text-foreground outline-none placeholder:text-faint"
          placeholder="Ask about your deals, accounts and people"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <Button
          aria-label="Ask"
          disabled={!question.trim()}
          leadIcon={ArrowUp02Icon}
          type="submit"
        />
      </form>
      <div className="flex flex-wrap gap-1.5">
        {prompts.map((prompt) => (
          <Button
            key={prompt}
            size="sm"
            variant="secondary"
            onClick={() => onAsk(prompt)}
          >
            {prompt}
          </Button>
        ))}
      </div>
    </section>
  )
}
