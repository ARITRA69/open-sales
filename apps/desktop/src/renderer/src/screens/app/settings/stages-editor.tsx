import { useRef, useState, type FormEvent } from 'react'

import {
  Add01Icon,
  ArrowDown01Icon,
  Delete02Icon
} from '@hugeicons/core-free-icons'
import type { TPipelineSettings, TStagesSaveInput } from '@open-sales/shared'
import {
  findRepeatedName,
  MAX_STAGES,
  stagesSaveSchema
} from '@open-sales/shared'
import { AnimatePresence, motion, Reorder, useDragControls } from 'motion/react'

import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Banner } from '@/components/ui/kit'
import { Tag } from '@/components/ui/status'
import { cn } from '@/lib/utils'

import type { TApiResult } from '../../../../../preload/bridge-types'
import { moveBy, ReorderHandle } from './reorder-handle'
import { Problem, SaveBar, useSave } from './settings-parts'

// A stage as it's being edited: numbers are still what was typed.
type TDraftStage = {
  // Stable while editing; new stages have no `id` yet.
  key: string
  id?: string
  name: string
  winProbability: string
  stalledAfterDays: string
  goal: string
  exitCriteria: string
  dealCount: number
}

// A stage taken away, kept so Undo can put it back where it was.
type TRemovedStage = {
  stage: TDraftStage & { id: string }
  index: number
  moveDealsTo: string | null
}

type TDraft = {
  stages: TDraftStage[]
  wonName: string
  lostName: string
  removed: TRemovedStage[]
}

const toDraft = (pipeline: TPipelineSettings): TDraft => ({
  stages: pipeline.stages
    .filter((stage) => stage.kind === 'open')
    .map((stage) => ({
      key: stage.id,
      id: stage.id,
      name: stage.name,
      winProbability: String(stage.winProbability),
      stalledAfterDays:
        stage.stalledAfterDays === null ? '' : String(stage.stalledAfterDays),
      goal: stage.goal ?? '',
      exitCriteria: stage.exitCriteria ?? '',
      dealCount: stage.dealCount
    })),
  wonName: pipeline.stages.find((stage) => stage.kind === 'won')?.name ?? '',
  lostName: pipeline.stages.find((stage) => stage.kind === 'lost')?.name ?? '',
  removed: []
})

const toSave = (draft: TDraft, revision: string): TStagesSaveInput => ({
  revision,
  stages: draft.stages.map((stage) => ({
    id: stage.id,
    name: stage.name,
    // Empty isn't a probability: the schema says so in words.
    winProbability:
      stage.winProbability === '' ? NaN : Number(stage.winProbability),
    stalledAfterDays:
      stage.stalledAfterDays === '' ? null : Number(stage.stalledAfterDays),
    goal: stage.goal,
    exitCriteria: stage.exitCriteria
  })),
  wonName: draft.wonName,
  lostName: draft.lostName,
  removed: draft.removed.map(({ stage, moveDealsTo }) => ({
    id: stage.id,
    moveDealsTo
  }))
})

const dealsLabel = (count: number) =>
  count === 1 ? '1 deal' : `${count} deals`

const onlyDigits = (text: string) => text.replace(/\D/g, '').slice(0, 4)

type TStagesEditorProps = {
  pipeline: TPipelineSettings
  // Saves the whole list. The answer's pipeline replaces this one.
  onSave: (input: TStagesSaveInput) => Promise<TApiResult<TPipelineSettings>>
  // Someone else saved first: fetch theirs, dropping what's typed here.
  onLoadLatest?: () => void
}

/**
 * The pipeline's stages, edited as one list and saved in one go: rename,
 * drag to reorder, add, and remove (a stage with deals asks where they
 * should move). Won and Lost stay last; they can be renamed, not removed.
 */
export const StagesEditor = ({
  pipeline,
  onSave,
  onLoadLatest
}: TStagesEditorProps) => {
  const [baseline] = useState(() => JSON.stringify(toDraft(pipeline)))
  const [draft, setDraft] = useState(() => toDraft(pipeline))
  // Problems by field, like "<stage key>.name".
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [openKeys, setOpenKeys] = useState<string[]>([])
  // The stage whose deals need somewhere to go. It stays after its dialog
  // closes, so the dialog still says which stage while it fades out.
  const [removing, setRemoving] = useState<TDraftStage | null>(null)
  const [isAsking, setIsAsking] = useState(false)
  const [moveTo, setMoveTo] = useState<string | undefined>()
  const newCount = useRef(0)
  const save = useSave(onSave)

  const isDirty = JSON.stringify(draft) !== baseline
  const closed = pipeline.stages.filter((stage) => stage.kind !== 'open')
  const nameOf = (stageId: string | null) =>
    draft.stages.find((stage) => stage.id === stageId)?.name.trim() ?? ''

  const changeStage = (key: string, changes: Partial<TDraftStage>) =>
    setDraft((current) => ({
      ...current,
      stages: current.stages.map((stage) =>
        stage.key === key ? { ...stage, ...changes } : stage
      )
    }))

  const handleReorder = (keys: string[]) =>
    setDraft((current) => ({
      ...current,
      stages: keys.flatMap(
        (key) => current.stages.find((stage) => stage.key === key) ?? []
      )
    }))

  const handleAdd = () => {
    newCount.current += 1
    const key = `new-${newCount.current}`
    setDraft((current) => ({
      ...current,
      stages: [
        ...current.stages,
        {
          key,
          name: '',
          winProbability: '50',
          stalledAfterDays: '14',
          goal: '',
          exitCriteria: '',
          dealCount: 0
        }
      ]
    }))
  }

  const takeAway = (stage: TDraftStage, moveDealsTo: string | null) =>
    setDraft((current) => {
      const index = current.stages.findIndex((s) => s.key === stage.key)
      const { id } = stage
      return {
        ...current,
        stages: current.stages.filter((s) => s.key !== stage.key),
        // A stage that was never saved just goes.
        removed: id
          ? [
              ...current.removed,
              { stage: { ...stage, id }, index, moveDealsTo }
            ]
          : current.removed
      }
    })

  const handleRemove = (stage: TDraftStage) => {
    const waiting = draft.removed.find(
      (removed) => removed.moveDealsTo === stage.id
    )
    if (stage.id && waiting) {
      save.setProblem(
        `Deals from “${waiting.stage.name}” are set to move into “${stage.name}”. Undo that first.`
      )
      return
    }
    save.setProblem(null)
    if (stage.dealCount > 0) {
      setMoveTo(undefined)
      setRemoving(stage)
      setIsAsking(true)
      return
    }
    takeAway(stage, null)
  }

  const handleUndo = (removed: TRemovedStage) =>
    setDraft((current) => {
      const stages = [...current.stages]
      stages.splice(Math.min(removed.index, stages.length), 0, removed.stage)
      return {
        ...current,
        stages,
        removed: current.removed.filter((r) => r.stage.id !== removed.stage.id)
      }
    })

  const handleDiscard = () => {
    setDraft(toDraft(pipeline))
    setErrors({})
    save.setProblem(null)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const input = toSave(draft, pipeline.revision)
    const parsed = stagesSaveSchema.safeParse(input)
    if (!parsed.success) {
      const found: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const [list, index, field] = issue.path
        const key =
          list === 'stages' && typeof index === 'number'
            ? `${draft.stages[index]?.key}.${String(field)}`
            : String(list)
        found[key] ??= issue.message
      }
      setErrors(found)
      save.setProblem(parsed.error.issues[0].message)
      return
    }
    setErrors({})
    const repeated = findRepeatedName([
      ...draft.stages.map((stage) => stage.name),
      draft.wonName,
      draft.lostName
    ])
    if (repeated) {
      save.setProblem(
        `Two stages are called “${repeated}”. Give each its own name.`
      )
      return
    }
    await save.run(input)
  }

  // Deals can only move to a stage the server already knows.
  const moveChoices = draft.stages
    .filter((stage) => stage.id && stage.key !== removing?.key)
    .map((stage) => ({
      label: stage.name.trim() || 'Unnamed stage',
      value: stage.id ?? ''
    }))

  return (
    <form noValidate className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <div
        aria-hidden
        className="flex items-center gap-2 px-2 text-body-sm font-semibold text-muted-foreground"
      >
        <span className="w-5 flex-none" />
        <span className="min-w-0 flex-1">Stage</span>
        <span className="w-24 flex-none">Win probability</span>
        <span className="w-28 flex-none">Stalled after</span>
        <span className="w-16 flex-none text-right">Deals</span>
        <span className="w-7 flex-none" />
      </div>
      <Reorder.Group
        aria-label="Stages, in order"
        as="ol"
        axis="y"
        className="m-0 flex list-none flex-col gap-2 p-0"
        values={draft.stages.map((stage) => stage.key)}
        onReorder={handleReorder}
      >
        {draft.stages.map((stage, index) => (
          <StageRow
            key={stage.key}
            canRemove={draft.stages.length > 1}
            errors={errors}
            isOpen={openKeys.includes(stage.key)}
            stage={stage}
            onChange={(changes) => changeStage(stage.key, changes)}
            onMove={(by) =>
              setDraft((current) => ({
                ...current,
                stages: moveBy(current.stages, index, by)
              }))
            }
            onRemove={() => handleRemove(stage)}
            onToggle={() =>
              setOpenKeys((keys) =>
                keys.includes(stage.key)
                  ? keys.filter((key) => key !== stage.key)
                  : [...keys, stage.key]
              )
            }
          />
        ))}
      </Reorder.Group>
      <div>
        <Button
          disabled={draft.stages.length >= MAX_STAGES}
          leadIcon={Add01Icon}
          variant="secondary"
          onClick={handleAdd}
        >
          Add stage
        </Button>
      </div>

      <section className="mt-2 flex flex-col gap-2">
        <div className="flex flex-col">
          <h2 className="m-0 text-sm font-semibold">Closed</h2>
          <p className="m-0 text-body-sm text-muted-foreground">
            Every deal ends in one of these. You can rename them, but not remove
            them.
          </p>
        </div>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {closed.map((stage) => {
            const field = stage.kind === 'won' ? 'wonName' : 'lostName'
            return (
              <li
                key={stage.id}
                className="flex flex-col gap-2 rounded-card bg-muted p-2"
              >
                <div className="flex items-center gap-2">
                  <span className="w-5 flex-none" />
                  <Input
                    aria-label={
                      stage.kind === 'won'
                        ? 'Name of the Won stage'
                        : 'Name of the Lost stage'
                    }
                    className="min-w-0 flex-1"
                    invalid={Boolean(errors[field])}
                    maxLength={40}
                    value={draft[field]}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        [field]: event.target.value
                      }))
                    }
                  />
                  <span className="flex w-24 flex-none items-center text-sm text-muted-foreground tabular-nums">
                    {stage.winProbability}%
                  </span>
                  <span className="flex w-28 flex-none">
                    <Tag>{stage.kind === 'won' ? 'Won' : 'Lost'}</Tag>
                  </span>
                  <span className="w-16 flex-none text-right text-body-sm text-muted-foreground tabular-nums">
                    {dealsLabel(stage.dealCount)}
                  </span>
                  <span className="w-7 flex-none" />
                </div>
                {errors[field] ? <Problem>{errors[field]}</Problem> : null}
              </li>
            )
          })}
        </ul>
      </section>

      {draft.removed.map((removed) => (
        <Banner key={removed.stage.id}>
          <span className="min-w-0 flex-1">
            “{removed.stage.name}” will be removed when you save.
            {removed.moveDealsTo
              ? ` Its ${dealsLabel(removed.stage.dealCount)} will move to ${nameOf(removed.moveDealsTo)}.`
              : ''}
          </span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handleUndo(removed)}
          >
            Undo
          </Button>
        </Banner>
      ))}

      <SaveBar
        isDirty={isDirty}
        isSaving={save.isSaving}
        isStale={save.isStale}
        problem={save.problem}
        onDiscard={handleDiscard}
        onLoadLatest={onLoadLatest}
      />

      <Dialog
        description={
          removing
            ? `${dealsLabel(removing.dealCount)} ${removing.dealCount === 1 ? 'is' : 'are'} in this stage. Choose where ${removing.dealCount === 1 ? 'it' : 'they'} should move.`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsAsking(false)}>
              Cancel
            </Button>
            <Button
              disabled={!moveTo}
              onClick={() => {
                if (!removing || !moveTo) return
                takeAway(removing, moveTo)
                setIsAsking(false)
              }}
            >
              Remove stage
            </Button>
          </>
        }
        open={isAsking}
        title={`Remove “${removing?.name ?? ''}”?`}
        onOpenChange={setIsAsking}
      >
        {moveChoices.length > 0 ? (
          <Field
            hint="Nothing moves until you save."
            kind="select"
            label="Move its deals to"
            options={moveChoices}
            placeholder="Choose a stage"
            value={moveTo}
            onValueChange={setMoveTo}
          />
        ) : (
          <p className="m-0 text-sm text-muted-foreground">
            Save your new stages first, so these deals have somewhere to go.
          </p>
        )}
      </Dialog>
    </form>
  )
}

type TStageRowProps = {
  stage: TDraftStage
  errors: Record<string, string>
  isOpen: boolean
  // The last stage before Won and Lost has to stay.
  canRemove: boolean
  onChange: (changes: Partial<TDraftStage>) => void
  onMove: (by: -1 | 1) => void
  onToggle: () => void
  onRemove: () => void
}

const StageRow = ({
  stage,
  errors,
  isOpen,
  canRemove,
  onChange,
  onMove,
  onToggle,
  onRemove
}: TStageRowProps) => {
  const controls = useDragControls()
  const label = stage.name.trim() || 'New stage'
  const error = (field: keyof TDraftStage) => errors[`${stage.key}.${field}`]
  const rowProblem =
    error('name') ?? error('winProbability') ?? error('stalledAfterDays')
  const summary = stage.exitCriteria.trim() || stage.goal.trim()

  return (
    <Reorder.Item
      aria-label={label}
      as="li"
      className="flex flex-col gap-1.5 rounded-card bg-background p-2 shadow-(--shadow-tile)"
      dragControls={controls}
      dragListener={false}
      value={stage.key}
    >
      <div className="flex items-center gap-2">
        <ReorderHandle
          name={label}
          onMove={onMove}
          onPointerDown={(event) => controls.start(event)}
        />
        <Input
          aria-label="Stage name"
          className="min-w-0 flex-1"
          invalid={Boolean(error('name'))}
          maxLength={40}
          placeholder="Stage name"
          value={stage.name}
          onChange={(event) => onChange({ name: event.target.value })}
        />
        <span className="flex w-24 flex-none items-center gap-1.5 text-sm text-muted-foreground">
          <Input
            aria-label="Win probability, percent"
            className="w-14"
            inputMode="numeric"
            invalid={Boolean(error('winProbability'))}
            value={stage.winProbability}
            onChange={(event) =>
              onChange({ winProbability: onlyDigits(event.target.value) })
            }
          />
          %
        </span>
        <span className="flex w-28 flex-none items-center gap-1.5 text-sm text-muted-foreground">
          <Input
            aria-label="Stalled after, days"
            className="w-14"
            inputMode="numeric"
            invalid={Boolean(error('stalledAfterDays'))}
            placeholder="–"
            value={stage.stalledAfterDays}
            onChange={(event) =>
              onChange({ stalledAfterDays: onlyDigits(event.target.value) })
            }
          />
          {stage.stalledAfterDays === '' ? 'never' : 'days'}
        </span>
        <span className="w-16 flex-none text-right text-body-sm text-muted-foreground tabular-nums">
          {dealsLabel(stage.dealCount)}
        </span>
        <Button
          aria-label={`Remove ${label}`}
          disabled={!canRemove}
          leadIcon={Delete02Icon}
          size="sm"
          title={canRemove ? undefined : 'Keep at least one stage'}
          variant="ghost"
          onClick={onRemove}
        />
      </div>
      {rowProblem ? (
        <div className="pl-7">
          <Problem>{rowProblem}</Problem>
        </div>
      ) : null}
      <button
        aria-expanded={isOpen}
        className="ml-7 flex min-w-0 items-center gap-1.5 self-start rounded-sm text-left text-body-sm text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground keyboard-focus:shadow-(--halo-keyboard)"
        type="button"
        onClick={onToggle}
      >
        <span
          className={cn(
            'flex flex-none transition-transform duration-200',
            isOpen ? 'rotate-0' : '-rotate-90'
          )}
        >
          <Icon icon={ArrowDown01Icon} size={12} />
        </span>
        <span className="flex-none font-semibold">Goal and exit criteria</span>
        {isOpen ? null : (
          <span className="min-w-0 truncate">{summary || 'None yet'}</span>
        )}
      </button>
      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            animate={{ height: 'auto', opacity: 1 }}
            className="overflow-hidden"
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div className="grid grid-cols-2 gap-3 py-1 pr-1 pl-7">
              <Field
                hint="What this stage is for."
                kind="textarea"
                label="Goal"
                maxLength={500}
                placeholder="Send a proposal that fits what they told us."
                rows={2}
                value={stage.goal}
                onChange={(event) => onChange({ goal: event.target.value })}
              />
              <Field
                hint="What must be true to move on. AI reads this to suggest stage changes."
                kind="textarea"
                label="Exit criteria"
                maxLength={500}
                placeholder="Pricing sent and budget confirmed."
                rows={2}
                value={stage.exitCriteria}
                onChange={(event) =>
                  onChange({ exitCriteria: event.target.value })
                }
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Reorder.Item>
  )
}
