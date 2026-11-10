import { useRef, useState, type ReactNode } from 'react'

import {
  LockIcon,
  MoreHorizontalIcon,
  PlayIcon
} from '@hugeicons/core-free-icons'
import type {
  TPlaybook,
  TPlaybookBlank,
  TPlaybookChange,
  TPlaybookCreate
} from '@open-sales/shared'
import {
  buildPlaybookPrompt,
  PLAYBOOK_CHANGE_COPY,
  PLAYBOOK_CHANGES,
  PLAYBOOK_NEVER_LINE,
  playbookCreateSchema
} from '@open-sales/shared'

import { PageBody } from '@/components/sales/app-shell'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/controls'
import { Field } from '@/components/ui/field'
import { Icon } from '@/components/ui/icon'
import { Banner } from '@/components/ui/kit'
import { Menu, type TMenuItem } from '@/components/ui/menu'
import { PageHeader } from '@/components/ui/page-header'
import { Tag } from '@/components/ui/status'
import { formatShortDate } from '@/lib/dates'

import type { TApiResult } from '../../../../../preload/bridge-types'
import { askAi } from './ask-ai'
import { PlaybookBlanksDialog } from './blanks-dialog'
import { BlanksEditor, newBlankDraft, type TBlankDraft } from './blanks-editor'
import type { TPlaybooksBridge } from './playbooks-bridge'

type TForm = {
  name: string
  description: string
  steps: string
  blanks: TBlankDraft[]
  allowedChanges: TPlaybookChange[]
}

const formOf = (playbook: TPlaybook | null): TForm => ({
  name: playbook?.name ?? '',
  description: playbook?.description ?? '',
  steps: playbook?.current.steps ?? '',
  blanks: (playbook?.current.blanks ?? []).map((blank) => newBlankDraft(blank)),
  // A new playbook starts able to do everything a playbook can.
  allowedChanges: playbook
    ? playbook.current.allowedChanges
    : [...PLAYBOOK_CHANGES]
})

const blanksOf = (form: TForm): TPlaybookBlank[] =>
  form.blanks.map(({ name, question, options }) => ({
    name,
    question,
    options
  }))

const changesOf = (form: TForm): TPlaybookChange[] =>
  PLAYBOOK_CHANGES.filter((change) => form.allowedChanges.includes(change))

/** The form as the server takes it. */
const inputOf = (form: TForm): TPlaybookCreate => ({
  name: form.name,
  description: form.description,
  steps: form.steps,
  blanks: blanksOf(form),
  allowedChanges: changesOf(form)
})

/**
 * What the server would store for this form, to tell if anything changed.
 * A form it would refuse counts as it's written.
 */
const fingerprint = (form: TForm) => {
  const input = inputOf(form)
  const parsed = playbookCreateSchema.safeParse(input)
  return JSON.stringify(parsed.success ? parsed.data : input)
}

const versionNote = (playbook: TPlaybook) => {
  const { number, createdAt, createdBy } = playbook.current
  const by = createdBy ? ` by ${createdBy.name}` : ''
  return `Version ${number} · last changed ${formatShortDate(createdAt)}${by}`
}

type TBusy = 'save' | 'publish' | 'state' | null

type TPlaybookEditorProps = {
  bridge: TPlaybooksBridge
  // Null for a new playbook.
  playbook: TPlaybook | null
  // Managers and admins. Everyone else reads.
  canWrite: boolean
  // Whether Claude Code or Codex is ready on this computer; null if unknown.
  aiToolReady?: boolean | null
  // A new playbook's first save: the page moves to its own address.
  onCreated?: (playbook: TPlaybook) => void
}

/**
 * Writing a playbook: its name, the steps in plain words, the blanks to ask
 * first and what it may change. Save as draft keeps it to its author and the
 * managers; Publish shows it to the team. People who can't change it see the
 * same page, read-only.
 */
export const PlaybookEditor = ({
  bridge,
  playbook,
  canWrite,
  aiToolReady = null,
  onCreated
}: TPlaybookEditorProps) => {
  // The playbook as the server last gave it; null until a new one is saved.
  const [saved, setSaved] = useState(playbook)
  const [form, setForm] = useState(() => formOf(playbook))
  const [busy, setBusy] = useState<TBusy>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  // Someone else saved first: offer their version.
  const [isStale, setIsStale] = useState(false)
  const [isAskingBlanks, setIsAskingBlanks] = useState(false)
  const [triedAt, setTriedAt] = useState<number | null>(null)
  const stepsRef = useRef<HTMLTextAreaElement>(null)

  const isArchived = Boolean(saved?.archivedAt)
  const isPublished = saved?.status === 'published'
  const readOnly = !canWrite || isArchived
  const isDirty = fingerprint(form) !== fingerprint(formOf(saved))

  const set = (changes: Partial<TForm>) => {
    setForm((current) => ({ ...current, ...changes }))
    setTriedAt(null)
    if (changes.name !== undefined) setNameError(null)
  }

  /** Takes the server's copy as the new starting point. */
  const adopt = (next: TPlaybook, keepForm = false) => {
    setSaved(next)
    if (!keepForm) setForm(formOf(next))
    setProblem(null)
    setIsStale(false)
  }

  const fail = (answer: Extract<TApiResult<TPlaybook>, { ok: false }>) => {
    setProblem(answer.message)
    setIsStale(answer.code === 'changed_since')
    return null
  }

  /** Checks the form as the server will; says what's wrong, where it can. */
  const readForm = () => {
    const parsed = playbookCreateSchema.safeParse(inputOf(form))
    if (parsed.success) return inputOf(form)
    const [issue] = parsed.error.issues
    if (issue.path[0] === 'name') setNameError(issue.message)
    setProblem(issue.path[0] === 'name' ? null : issue.message)
    return null
  }

  /** Saves what's written. Returns the saved playbook, or null if it failed. */
  const save = async (): Promise<TPlaybook | null> => {
    const input = readForm()
    if (!input) return null
    if (!saved) {
      const answer = await bridge.create(input)
      if (!answer.ok) return fail(answer)
      adopt(answer.data, true)
      onCreated?.(answer.data)
      return answer.data
    }
    if (!isDirty) return saved
    const answer = await bridge.update(saved.id, {
      ...input,
      version: saved.version
    })
    if (!answer.ok) return fail(answer)
    adopt(answer.data, true)
    return answer.data
  }

  const handleSave = async () => {
    setBusy('save')
    await save()
    setBusy(null)
  }

  const handlePublish = async () => {
    if (!form.steps.trim()) {
      setProblem('Write the steps before publishing this playbook.')
      return
    }
    setBusy('publish')
    const current = await save()
    if (current) {
      const answer = await bridge.setState(
        current.id,
        'publish',
        current.version
      )
      if (answer.ok) adopt(answer.data, true)
      else fail(answer)
    }
    setBusy(null)
  }

  const handleState = async (action: 'unpublish' | 'archive' | 'restore') => {
    if (!saved) return
    setBusy('state')
    const answer = await bridge.setState(saved.id, action, saved.version)
    // Unsaved edits stay in the form through an unpublish.
    if (answer.ok) adopt(answer.data, action === 'unpublish')
    else fail(answer)
    setBusy(null)
  }

  const loadLatest = async () => {
    if (!saved) return
    const answer = await bridge.get(saved.id)
    if (answer.ok) adopt(answer.data)
    else fail(answer)
  }

  const useInSteps = (name: string) => {
    const placeholder = `{${name}}`
    const box = stepsRef.current
    const at = box?.selectionStart ?? form.steps.length
    const before = form.steps.slice(0, at)
    const gap = before && !/\s$/.test(before) ? ' ' : ''
    set({ steps: `${before}${gap}${placeholder}${form.steps.slice(at)}` })
    box?.focus()
  }

  /** Hands the steps, as written now, to Ask AI. */
  const tryIt = (answers: Record<string, string>) => {
    const name = form.name.trim() || 'Untitled playbook'
    askAi({
      prompt: buildPlaybookPrompt(
        {
          name,
          steps: form.steps.trim(),
          blanks: blanksOf(form),
          allowedChanges: changesOf(form)
        },
        { answers }
      ),
      record: { type: 'playbook', id: saved?.id ?? 'new', label: name }
    })
    setTriedAt(Date.now())
  }

  // Only blanks that can be asked yet: a name and a question.
  const askableBlanks = blanksOf(form).filter(
    (blank) => blank.name.trim() && blank.question.trim()
  )

  const handleTry = () => {
    if (!form.steps.trim()) {
      setProblem('Write the steps first, then try them.')
      return
    }
    setProblem(null)
    if (askableBlanks.length > 0) setIsAskingBlanks(true)
    else tryIt({})
  }

  const moreItems: TMenuItem[] = [
    ...(isPublished
      ? [
          {
            label: 'Unpublish',
            description: 'Back to a draft only managers see',
            onSelect: () => void handleState('unpublish')
          }
        ]
      : []),
    {
      label: 'Archive',
      description: 'Take it out of the library',
      onSelect: () => void handleState('archive')
    }
  ]

  const actions = readOnly ? (
    canWrite && isArchived ? (
      <Button
        loading={busy === 'state'}
        size="lg"
        onClick={() => void handleState('restore')}
      >
        Restore
      </Button>
    ) : null
  ) : (
    <div className="flex items-center gap-2">
      {saved ? (
        <Menu
          align="end"
          items={moreItems}
          label="More for this playbook"
          trigger={
            <Button
              aria-label="More"
              leadIcon={MoreHorizontalIcon}
              loading={busy === 'state'}
              size="lg"
              variant="ghost"
            />
          }
        />
      ) : null}
      {isPublished ? (
        <Button
          disabled={!isDirty}
          loading={busy === 'save'}
          size="lg"
          onClick={() => void handleSave()}
        >
          Save changes
        </Button>
      ) : (
        <>
          <Button
            disabled={Boolean(saved) && !isDirty}
            loading={busy === 'save'}
            size="lg"
            variant="secondary"
            onClick={() => void handleSave()}
          >
            Save as draft
          </Button>
          <Button
            loading={busy === 'publish'}
            size="lg"
            onClick={() => void handlePublish()}
          >
            Publish
          </Button>
        </>
      )}
    </div>
  )

  return (
    <PageBody narrow>
      <PageHeader
        actions={actions}
        backLink={{ label: 'Playbooks', href: '#/playbooks' }}
        title={saved?.name ?? 'New playbook'}
      />
      <div className="-mt-2 flex flex-wrap items-center gap-2">
        {saved ? (
          <>
            {isArchived ? (
              <Tag>Archived</Tag>
            ) : isPublished ? (
              <Tag dot="success">Published</Tag>
            ) : (
              <Tag dot="faint">Draft</Tag>
            )}
            <span className="text-body-sm text-muted-foreground">
              {versionNote(saved)}
              {isDirty && !readOnly ? ' · changes not saved' : ''}
            </span>
          </>
        ) : (
          <span className="text-body-sm text-muted-foreground">
            Not saved yet. A draft is only seen by you, managers and admins.
          </span>
        )}
      </div>

      {!canWrite ? (
        <Banner>
          Only managers and admins can change playbooks. You can run this one
          from any deal or account.
        </Banner>
      ) : isArchived ? (
        <Banner>This playbook is archived. Restore it to change it.</Banner>
      ) : null}

      {problem ? (
        <Banner role="alert" tone="accent">
          <span className="min-w-0 flex-1">{problem}</span>
          {isStale ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void loadLatest()}
            >
              Load their version
            </Button>
          ) : null}
        </Banner>
      ) : null}

      <div className="flex flex-col gap-3">
        <Field
          error={nameError ?? undefined}
          label="Name"
          placeholder="Follow-up after a demo"
          readOnly={readOnly}
          value={form.name}
          onChange={(event) => set({ name: event.target.value })}
        />
        <Field
          label="What it does"
          placeholder="One line the team sees in the library"
          readOnly={readOnly}
          value={form.description}
          onChange={(event) => set({ description: event.target.value })}
        />
      </div>

      <Field
        ref={stepsRef}
        hint={
          readOnly
            ? undefined
            : 'Write what the AI should do in plain words, one step to a line, as you’d brief a new colleague.'
        }
        kind="textarea"
        label="Steps"
        placeholder={
          'Read the demo notes.\nDraft a recap email with the three things they cared about.\nPropose the next step and close date.'
        }
        readOnly={readOnly}
        rows={Math.min(
          24,
          Math.max(readOnly ? 3 : 8, form.steps.split('\n').length + 2)
        )}
        value={form.steps}
        onChange={(event) => set({ steps: event.target.value })}
      />

      <Section
        intro={
          readOnly
            ? undefined
            : 'Questions to ask before it runs, like “Which plan did they pick?”. Give each a short name, and write that name in curly brackets in the steps where the answer belongs.'
        }
        title="Blanks"
      >
        <BlanksEditor
          blanks={form.blanks}
          readOnly={readOnly}
          onChange={(blanks) => set({ blanks })}
          onUseInSteps={useInSteps}
        />
      </Section>

      <Section
        intro="Whatever it proposes waits for a person to approve."
        title="What it may change"
      >
        <div className="flex flex-col rounded-card bg-muted px-3">
          {PLAYBOOK_CHANGES.map((change) => {
            const id = `playbook-change-${change}`
            const isOn = form.allowedChanges.includes(change)

            return (
              <div
                key={change}
                className="flex min-h-11 items-center gap-3 border-b border-border py-1.5"
              >
                <Checkbox
                  aria-describedby={`${id}-hint`}
                  checked={isOn}
                  disabled={readOnly}
                  id={id}
                  onCheckedChange={(checked) =>
                    set({
                      allowedChanges: PLAYBOOK_CHANGES.filter((other) =>
                        other === change
                          ? checked === true
                          : form.allowedChanges.includes(other)
                      )
                    })
                  }
                />
                <label className="flex min-w-0 flex-1 flex-col" htmlFor={id}>
                  <span className="text-sm font-semibold">
                    {PLAYBOOK_CHANGE_COPY[change].label}
                  </span>
                  <span
                    className="text-body-sm text-muted-foreground"
                    id={`${id}-hint`}
                  >
                    {PLAYBOOK_CHANGE_COPY[change].hint}
                  </span>
                </label>
              </div>
            )
          })}
          <p className="m-0 flex min-h-9 items-center gap-3 py-2 text-sm text-muted-foreground">
            <Icon className="flex-none" icon={LockIcon} size={16} />
            {PLAYBOOK_NEVER_LINE}
          </p>
        </div>
      </Section>

      {canWrite && !isArchived ? (
        <Section
          intro="Opens Ask AI with these steps as they’re written now, saved or not. It runs on your own Claude Code or Codex, so one of them has to be installed and signed in on this computer."
          title="Try it"
        >
          {aiToolReady === false ? (
            <Banner tone="accent">
              <span className="min-w-0 flex-1">
                No AI tool is ready on this computer yet, so a try won’t run.
              </span>
              <Button href="#/settings" size="sm" variant="secondary">
                Set one up in Settings
              </Button>
            </Banner>
          ) : null}
          <div className="flex items-center gap-3">
            <Button leadIcon={PlayIcon} variant="secondary" onClick={handleTry}>
              Try it
            </Button>
            {triedAt ? (
              <span
                className="text-body-sm text-muted-foreground"
                role="status"
              >
                Handed to Ask AI. Nothing changes until you approve it there.
              </span>
            ) : null}
          </div>
        </Section>
      ) : null}

      {isAskingBlanks ? (
        <PlaybookBlanksDialog
          blanks={askableBlanks}
          confirmLabel="Try it"
          playbookName={form.name.trim() || 'Untitled playbook'}
          onClose={() => setIsAskingBlanks(false)}
          onRun={(answers) => {
            setIsAskingBlanks(false)
            tryIt(answers)
          }}
        />
      ) : null}
    </PageBody>
  )
}

const Section = ({
  title,
  intro,
  children
}: {
  title: string
  intro?: string
  children: ReactNode
}) => (
  <section className="flex flex-col gap-2">
    <div className="flex flex-col">
      <h2 className="m-0 text-sm font-semibold">{title}</h2>
      {intro ? (
        <p className="m-0 text-body-sm text-muted-foreground">{intro}</p>
      ) : null}
    </div>
    {children}
  </section>
)
