import { useState } from 'react'

import { BookOpen01Icon, PlayIcon } from '@hugeicons/core-free-icons'
import type { TPlaybook } from '@open-sales/shared'
import { buildPlaybookPrompt } from '@open-sales/shared'

import { Button, type TButtonProps } from '@/components/ui/button'
import { Menu, type TMenuItem } from '@/components/ui/menu'

import { askAi, type TAskDetail, type TAskRecord } from './ask-ai'
import { PlaybookBlanksDialog } from './blanks-dialog'
import {
  DEFAULT_PLAYBOOKS_BRIDGE,
  type TPlaybooksBridge
} from './playbooks-bridge'

type TLoaded =
  | { state: 'loading' }
  | { state: 'ready'; playbooks: TPlaybook[] }
  | { state: 'error'; message: string }

type TRunPlaybookMenuProps = {
  // The record the playbook runs on: the page this button sits on.
  record: TAskRecord
  // Defaults to the app's own; tests and previews pass theirs.
  bridge?: TPlaybooksBridge | null
  // How the button looks among its neighbours.
  variant?: TButtonProps['variant']
  size?: TButtonProps['size']
  // After the run is handed to Ask AI.
  onRun?: (detail: TAskDetail, playbook: TPlaybook) => void
}

/**
 * "Run playbook" on a record: lists the team's published playbooks, asks the
 * chosen one's blanks, then hands its steps to Ask AI with the answers
 * filled in and the record it was opened on. It runs on the person's own AI
 * tool, and whatever it wants to change comes back as proposals.
 */
export const RunPlaybookMenu = ({
  record,
  bridge = DEFAULT_PLAYBOOKS_BRIDGE,
  variant = 'secondary',
  size = 'md',
  onRun
}: TRunPlaybookMenuProps) => {
  const [loaded, setLoaded] = useState<TLoaded>({ state: 'loading' })
  // The playbook whose blanks are being asked.
  const [asking, setAsking] = useState<TPlaybook | null>(null)

  if (!bridge) return null

  // Looks each time the menu opens, so a playbook published a minute ago is there.
  const handleOpenChange = (open: boolean) => {
    if (!open) return
    void bridge
      .list({ status: 'published', limit: 200 })
      .then((answer) =>
        setLoaded(
          answer.ok
            ? { state: 'ready', playbooks: answer.data.items }
            : { state: 'error', message: answer.message }
        )
      )
  }

  const run = (playbook: TPlaybook, answers: Record<string, string>) => {
    const detail: TAskDetail = {
      prompt: buildPlaybookPrompt(
        { name: playbook.name, ...playbook.current },
        { answers, targetLabel: record.label }
      ),
      record
    }
    askAi(detail)
    onRun?.(detail, playbook)
  }

  const choose = (playbook: TPlaybook) => {
    if (playbook.current.blanks.length > 0) setAsking(playbook)
    else run(playbook, {})
  }

  const items: TMenuItem[] =
    loaded.state === 'loading'
      ? [{ label: 'Loading playbooks…', disabled: true }]
      : loaded.state === 'error'
        ? [
            {
              label: 'Playbooks didn’t load',
              description: loaded.message,
              disabled: true
            }
          ]
        : loaded.playbooks.length === 0
          ? [
              {
                label: 'No playbooks yet',
                description: 'Managers publish them on the Playbooks page.',
                disabled: true
              }
            ]
          : loaded.playbooks.map((playbook) => ({
              label: playbook.name,
              description: playbook.description ?? undefined,
              onSelect: () => choose(playbook)
            }))

  return (
    <>
      <Menu
        align="end"
        items={[
          ...items,
          { line: true },
          { label: 'All playbooks', icon: BookOpen01Icon, href: '#/playbooks' }
        ]}
        label={`Run a playbook on ${record.label}`}
        trigger={
          <Button leadIcon={PlayIcon} size={size} variant={variant}>
            Run playbook
          </Button>
        }
        onOpenChange={handleOpenChange}
      />
      {asking ? (
        <PlaybookBlanksDialog
          blanks={asking.current.blanks}
          playbookName={asking.name}
          onClose={() => setAsking(null)}
          onRun={(answers) => {
            run(asking, answers)
            setAsking(null)
          }}
        />
      ) : null}
    </>
  )
}
