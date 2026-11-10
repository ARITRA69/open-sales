import { useState } from 'react'

import { Copy01Icon, Tick02Icon } from '@hugeicons/core-free-icons'

import { AiToolLogo } from '@/components/sales/ai-tool-logo'
import { Button } from '@/components/ui/button'

import type { TAiToolId } from '../../../../../preload/bridge-types'

type TCommandRowProps = { id: TAiToolId; name: string; command: string }

/** One AI tool's command to run once in a terminal, with Copy. */
export const CommandRow = ({ id, name, command }: TCommandRowProps) => {
  const [copied, setCopied] = useState<'no' | 'yes' | 'failed'>('no')

  const copy = async () => {
    // Where the clipboard is out of reach, the command can still be
    // selected by hand: a click on it selects all of it.
    const isDone = await navigator.clipboard.writeText(command).then(
      () => true,
      () => false
    )
    setCopied(isDone ? 'yes' : 'failed')
    setTimeout(() => setCopied('no'), 2000)
  }

  return (
    <div className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0">
      <div className="flex items-center gap-2 text-sm font-medium">
        <AiToolLogo id={id} />
        <span className="flex-1">{name}</span>
        <Button
          leadIcon={copied === 'yes' ? Tick02Icon : Copy01Icon}
          size="sm"
          variant="secondary"
          onClick={() => void copy()}
        >
          {copied === 'yes'
            ? 'Copied'
            : copied === 'failed'
              ? 'Select it to copy'
              : 'Copy command'}
        </Button>
      </div>
      <code className="block rounded-row bg-background px-3 py-2 font-mono text-body-sm break-all text-foreground-soft select-all">
        {command}
      </code>
    </div>
  )
}
