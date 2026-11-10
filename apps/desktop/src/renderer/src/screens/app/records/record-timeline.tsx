import { useState } from 'react'

import { Call02Icon, Note01Icon, Task01Icon } from '@hugeicons/core-free-icons'
import type { TOwner, TTimelineItem } from '@open-sales/shared'

import { Button } from '@/components/ui/button'
import { StatePanel } from '@/components/ui/state-panel'

import type {
  TApiResult,
  TTimelineRecord
} from '../../../../../preload/bridge-types'
import { askAi } from './ask-ai'
import { SectionTitle } from './record-layout'
import type { TTimelineBridge } from './timeline-bridge'
import { CallForm, NoteForm, TaskForm } from './timeline-forms'
import { TimelineItem, type TTimelineActions } from './timeline-item'
import type { TRecordNoun } from './timeline-words'
import { useTimeline } from './use-timeline'

// How much history the Overview shows before "See all activity".
const OVERVIEW_HISTORY = 5

type TComposer = 'note' | 'call' | 'task'

const keyOf = (item: TTimelineItem) => `${item.kind}:${item.id}`

type TRecordTimelineProps = {
  bridge: TTimelineBridge
  // The record this timeline belongs to; `label` is its name, for the AI.
  record: TTimelineRecord & { label: string }
  // The account's people, suggested for who was on a call.
  people: { id: string; name: string }[]
  // Everyone who can take a task.
  users: TOwner[]
  // `overview`: what's coming up and the latest few. `notes`: notes only.
  show?: 'all' | 'overview' | 'notes'
  // For money in field changes on a deal.
  currency?: string
  // Overview only: goes to the whole timeline.
  onSeeAll?: () => void
  // After anything is added or changed, for the page to refresh its own data.
  onChanged?: () => void
}

/**
 * A record's timeline: write a note, log a call or add a task at the top;
 * what's coming up next; then everything that happened, newest first.
 */
export const RecordTimeline = ({
  bridge,
  record,
  people,
  users,
  show = 'all',
  currency,
  onSeeAll,
  onChanged
}: TRecordTimelineProps) => {
  const timeline = useTimeline(bridge, record)
  const [composer, setComposer] = useState<TComposer | null>(null)
  const [busy, setBusy] = useState(false)
  // What went wrong, and where: the composer, or one row.
  const [problem, setProblem] = useState<{
    at: string
    message: string
  } | null>(null)

  const on = { type: record.type, id: record.id }
  const noun: TRecordNoun = record.type

  /** Runs a change; on success the timeline loads again from the top. */
  const run = async <TData,>(
    at: string,
    call: () => Promise<TApiResult<TData>>
  ) => {
    const answer = await call()
    if (answer.ok) {
      setProblem(null)
      timeline.reload()
      onChanged?.()
      return true
    }
    setProblem({ at, message: answer.message })
    // Someone changed it first: show what it is now.
    if (answer.code === 'changed_since') timeline.reload()
    return false
  }

  /** Saves from the composer, and closes it when that worked. */
  const compose = async <TData,>(call: () => Promise<TApiResult<TData>>) => {
    setBusy(true)
    const worked = await run('composer', call)
    setBusy(false)
    if (worked) setComposer(null)
    return worked
  }

  const actions: TTimelineActions = {
    setTaskDone: (task, done) =>
      run(`task:${task.id}`, () =>
        bridge.setTaskDone(task.id, done, task.version)
      ),
    updateTask: (task, input) =>
      run(`task:${task.id}`, () =>
        bridge.updateTask(task.id, { ...input, version: task.version })
      ),
    archiveTask: (task) =>
      run(`task:${task.id}`, () => bridge.archiveTask(task.id, task.version)),
    updateActivity: (activity, body) =>
      run(`activity:${activity.id}`, () =>
        bridge.updateActivity(activity.id, { body })
      ),
    archiveActivity: (activity) =>
      run(`activity:${activity.id}`, () => bridge.archiveActivity(activity.id))
  }

  const isNotes = show === 'notes'
  const upcoming = isNotes ? [] : timeline.items.filter((item) => item.upcoming)
  const allHistory = timeline.items.filter(
    (item) =>
      !item.upcoming &&
      (!isNotes || (item.kind === 'activity' && item.activity.type === 'note'))
  )
  const history =
    show === 'overview' ? allHistory.slice(0, OVERVIEW_HISTORY) : allHistory
  const hasHidden =
    show === 'overview' &&
    (allHistory.length > OVERVIEW_HISTORY || timeline.hasMore)
  const composerProblem = problem?.at === 'composer' ? problem.message : null

  const renderItems = (items: TTimelineItem[]) => (
    <ul className="m-0 flex list-none flex-col p-0">
      {items.map((item) => (
        <TimelineItem
          key={keyOf(item)}
          actions={actions}
          currency={currency}
          item={item}
          problem={problem?.at === keyOf(item) ? problem.message : null}
          record={noun}
          users={users}
        />
      ))}
    </ul>
  )

  return (
    <div className="flex flex-col gap-4" data-slot="record-timeline">
      <div
        className="flex flex-col gap-3 rounded-card bg-muted p-3"
        data-slot="timeline-composer"
      >
        {composer === null ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              leadIcon={Note01Icon}
              variant="white"
              onClick={() => setComposer('note')}
            >
              Write a note
            </Button>
            {isNotes ? null : (
              <>
                <Button
                  leadIcon={Call02Icon}
                  variant="white"
                  onClick={() => setComposer('call')}
                >
                  Log a call
                </Button>
                <Button
                  leadIcon={Task01Icon}
                  variant="white"
                  onClick={() => setComposer('task')}
                >
                  Add a task
                </Button>
              </>
            )}
          </div>
        ) : null}
        {composer === 'note' ? (
          <NoteForm
            busy={busy}
            problem={composerProblem}
            onCancel={() => setComposer(null)}
            onSubmit={(body) =>
              void compose(() =>
                bridge.createActivity({ type: 'note', on, body })
              )
            }
          />
        ) : null}
        {composer === 'call' ? (
          <CallForm
            busy={busy}
            defaultPersonIds={record.type === 'person' ? [record.id] : []}
            people={people}
            problem={composerProblem}
            onCancel={() => setComposer(null)}
            onSubmit={async (call, wantsAi) => {
              const saved = await compose(() =>
                bridge.createActivity({ type: 'call', on, ...call })
              )
              if (!saved || !wantsAi) return
              askAi({
                prompt: call.body.trim()
                  ? `I just finished a call with ${record.label}. From my notes, propose record updates, tasks and a follow-up email.\n\n${call.body.trim()}`
                  : `I just logged a call with ${record.label}. Propose what to do next.`,
                record: {
                  type: record.type,
                  id: record.id,
                  label: record.label
                }
              })
            }}
          />
        ) : null}
        {composer === 'task' ? (
          <TaskForm
            busy={busy}
            problem={composerProblem}
            users={users}
            onCancel={() => setComposer(null)}
            onSubmit={(task) =>
              void compose(() => bridge.createTask({ ...task, on }))
            }
          />
        ) : null}
      </div>

      {timeline.state === 'loading' ? <StatePanel kind="loading" /> : null}
      {timeline.state === 'error' ? (
        <StatePanel
          body={timeline.problem ?? undefined}
          kind="error"
          onAction={timeline.reload}
        />
      ) : null}

      {timeline.state === 'ready' ? (
        <>
          {upcoming.length > 0 ? (
            <section
              aria-label="Coming up"
              className="flex flex-col gap-1"
              data-slot="timeline-upcoming"
            >
              <SectionTitle>Coming up</SectionTitle>
              {renderItems(upcoming)}
            </section>
          ) : null}
          <section
            aria-label={isNotes ? 'Notes' : 'Earlier'}
            className="flex flex-col gap-1"
            data-slot="timeline-history"
          >
            {upcoming.length > 0 ? <SectionTitle>Earlier</SectionTitle> : null}
            {history.length > 0 ? (
              renderItems(history)
            ) : (
              <p className="m-0 py-2 text-sm text-muted-foreground">
                {isNotes
                  ? 'No notes yet. Write the first one above.'
                  : 'Nothing has happened here yet.'}
              </p>
            )}
          </section>
          {hasHidden ? (
            <Button
              className="self-start"
              variant="secondary"
              onClick={onSeeAll}
            >
              See all activity
            </Button>
          ) : null}
          {show !== 'overview' && timeline.hasMore ? (
            <Button
              className="self-center"
              variant="secondary"
              onClick={() => void timeline.loadMore()}
            >
              Load more
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
