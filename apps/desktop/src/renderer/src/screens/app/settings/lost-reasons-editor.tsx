import { useRef, useState, type FormEvent } from 'react'

import { Add01Icon } from '@hugeicons/core-free-icons'
import type { TLostReasonsSave, TPipelineSettings } from '@open-sales/shared'
import {
  findRepeatedName,
  lostReasonsSaveSchema,
  MAX_LOST_REASONS
} from '@open-sales/shared'
import { Reorder, useDragControls } from 'motion/react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import type { TApiResult } from '../../../../../preload/bridge-types'
import { moveBy, ReorderHandle } from './reorder-handle'
import { Problem, SaveBar, useSave } from './settings-parts'

type TDraftReason = {
  // Stable while editing; new reasons have no `id` yet.
  key: string
  id?: string
  label: string
}

type TDraft = {
  reasons: TDraftReason[]
  // Off the list: archived already, or about to be.
  archived: { id: string; label: string }[]
}

const toDraft = (pipeline: TPipelineSettings): TDraft => ({
  reasons: pipeline.lostReasons
    .filter((reason) => !reason.archivedAt)
    .map(({ id, label }) => ({ key: id, id, label })),
  archived: pipeline.lostReasons
    .filter((reason) => reason.archivedAt)
    .map(({ id, label }) => ({ id, label }))
})

type TLostReasonsEditorProps = {
  pipeline: TPipelineSettings
  // Saves the whole list. The answer's pipeline replaces this one.
  onSave: (input: TLostReasonsSave) => Promise<TApiResult<TPipelineSettings>>
  // Someone else saved first: fetch theirs, dropping what's typed here.
  onLoadLatest?: () => void
}

/**
 * The reasons offered when a deal is closed as lost: add, rename, drag to
 * reorder, archive and bring back, saved in one go.
 */
export const LostReasonsEditor = ({
  pipeline,
  onSave,
  onLoadLatest
}: TLostReasonsEditorProps) => {
  const [baseline] = useState(() => JSON.stringify(toDraft(pipeline)))
  const [draft, setDraft] = useState(() => toDraft(pipeline))
  // Problems by reason key.
  const [errors, setErrors] = useState<Record<string, string>>({})
  const newCount = useRef(0)
  const save = useSave(onSave)

  const isDirty = JSON.stringify(draft) !== baseline

  const handleAdd = () => {
    newCount.current += 1
    const key = `new-${newCount.current}`
    setDraft((current) => ({
      ...current,
      reasons: [...current.reasons, { key, label: '' }]
    }))
  }

  const handleArchive = (reason: TDraftReason) =>
    setDraft((current) => {
      const { id } = reason
      return {
        reasons: current.reasons.filter((r) => r.key !== reason.key),
        // A reason that was never saved just goes.
        archived: id
          ? [...current.archived, { id, label: reason.label }]
          : current.archived
      }
    })

  const handleRestore = (reason: { id: string; label: string }) =>
    setDraft((current) => ({
      reasons: [...current.reasons, { key: reason.id, ...reason }],
      archived: current.archived.filter((r) => r.id !== reason.id)
    }))

  const handleDiscard = () => {
    setDraft(toDraft(pipeline))
    setErrors({})
    save.setProblem(null)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const input: TLostReasonsSave = {
      revision: pipeline.revision,
      reasons: draft.reasons.map(({ id, label }) => ({ id, label }))
    }
    const parsed = lostReasonsSaveSchema.safeParse(input)
    if (!parsed.success) {
      const found: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const index = issue.path[1]
        if (typeof index === 'number') {
          found[draft.reasons[index]?.key] ??= issue.message
        }
      }
      setErrors(found)
      save.setProblem(parsed.error.issues[0].message)
      return
    }
    setErrors({})
    const repeated = findRepeatedName(draft.reasons.map((r) => r.label))
    if (repeated) {
      save.setProblem(
        `“${repeated}” is on the list twice. Give each reason its own name.`
      )
      return
    }
    await save.run(input)
  }

  return (
    <form noValidate className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <Reorder.Group
        aria-label="Lost reasons, in order"
        as="ol"
        axis="y"
        className="m-0 flex list-none flex-col gap-2 p-0"
        values={draft.reasons.map((reason) => reason.key)}
        onReorder={(keys: string[]) =>
          setDraft((current) => ({
            ...current,
            reasons: keys.flatMap(
              (key) => current.reasons.find((r) => r.key === key) ?? []
            )
          }))
        }
      >
        {draft.reasons.map((reason, index) => (
          <ReasonRow
            key={reason.key}
            canArchive={draft.reasons.length > 1}
            error={errors[reason.key]}
            reason={reason}
            onArchive={() => handleArchive(reason)}
            onChange={(label) =>
              setDraft((current) => ({
                ...current,
                reasons: current.reasons.map((r) =>
                  r.key === reason.key ? { ...r, label } : r
                )
              }))
            }
            onMove={(by) =>
              setDraft((current) => ({
                ...current,
                reasons: moveBy(current.reasons, index, by)
              }))
            }
          />
        ))}
      </Reorder.Group>
      <div>
        <Button
          disabled={draft.reasons.length >= MAX_LOST_REASONS}
          leadIcon={Add01Icon}
          variant="secondary"
          onClick={handleAdd}
        >
          Add reason
        </Button>
      </div>

      {draft.archived.length > 0 ? (
        <section className="mt-2 flex flex-col gap-2">
          <div className="flex flex-col">
            <h2 className="m-0 text-sm font-semibold">Archived</h2>
            <p className="m-0 text-body-sm text-muted-foreground">
              No longer offered. Deals already lost for one of these keep it.
            </p>
          </div>
          <ul
            aria-label="Archived reasons"
            className="m-0 flex list-none flex-col rounded-card bg-muted px-3 py-0.5"
          >
            {draft.archived.map((reason) => (
              <li
                key={reason.id}
                aria-label={reason.label}
                className="flex min-h-9 items-center gap-2 border-b border-border py-1 text-sm last:border-b-0"
              >
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {reason.label}
                </span>
                <Button
                  disabled={draft.reasons.length >= MAX_LOST_REASONS}
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRestore(reason)}
                >
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <SaveBar
        isDirty={isDirty}
        isSaving={save.isSaving}
        isStale={save.isStale}
        problem={save.problem}
        onDiscard={handleDiscard}
        onLoadLatest={onLoadLatest}
      />
    </form>
  )
}

type TReasonRowProps = {
  reason: TDraftReason
  error?: string
  // The last reason has to stay: closing a deal as lost needs one.
  canArchive: boolean
  onChange: (label: string) => void
  onMove: (by: -1 | 1) => void
  onArchive: () => void
}

const ReasonRow = ({
  reason,
  error,
  canArchive,
  onChange,
  onMove,
  onArchive
}: TReasonRowProps) => {
  const controls = useDragControls()
  const label = reason.label.trim() || 'New reason'

  return (
    <Reorder.Item
      aria-label={label}
      as="li"
      className="flex flex-col gap-1.5 rounded-card bg-background p-2 shadow-(--shadow-tile)"
      dragControls={controls}
      dragListener={false}
      value={reason.key}
    >
      <div className="flex items-center gap-2">
        <ReorderHandle
          name={label}
          onMove={onMove}
          onPointerDown={(event) => controls.start(event)}
        />
        <Input
          aria-label="Reason"
          className="min-w-0 flex-1"
          invalid={Boolean(error)}
          maxLength={60}
          placeholder="Why a deal was lost"
          value={reason.label}
          onChange={(event) => onChange(event.target.value)}
        />
        <Button
          aria-label={`Archive ${label}`}
          disabled={!canArchive}
          size="sm"
          title={canArchive ? undefined : 'Keep at least one reason'}
          variant="ghost"
          onClick={onArchive}
        >
          {reason.id ? 'Archive' : 'Remove'}
        </Button>
      </div>
      {error ? (
        <div className="pl-7">
          <Problem>{error}</Problem>
        </div>
      ) : null}
    </Reorder.Item>
  )
}
