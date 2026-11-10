import { useState, type ReactNode } from 'react'

import {
  ArrowDataTransferHorizontalIcon,
  Calendar03Icon,
  Call02Icon,
  Delete02Icon,
  Mail01Icon,
  MoreHorizontalIcon,
  Note01Icon,
  PencilEdit02Icon
} from '@hugeicons/core-free-icons'
import type {
  TActivity,
  TOwner,
  TTask,
  TTimelineItem
} from '@open-sales/shared'
import { CALL_OUTCOME_LABELS } from '@open-sales/shared'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/controls'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Icon, type TIcon } from '@/components/ui/icon'
import { Menu } from '@/components/ui/menu'
import { Tag } from '@/components/ui/status'
import { cn } from '@/lib/utils'

import { RecordLink } from './record-layout'
import { NoteForm, TaskForm, type TTaskInput } from './timeline-forms'
import {
  describeActor,
  describeChangeItem,
  describeStageItem,
  joinNames,
  type TRecordNoun
} from './timeline-words'
import { formatDue, formatWhen, isOverdue } from './when'

/**
 * What a row can do. Each answers whether it worked, so the row knows to
 * close its form; the timeline shows what went wrong.
 */
export type TTimelineActions = {
  setTaskDone: (task: TTask, done: boolean) => Promise<boolean>
  updateTask: (task: TTask, input: TTaskInput) => Promise<boolean>
  archiveTask: (task: TTask) => Promise<boolean>
  updateActivity: (activity: TActivity, body: string) => Promise<boolean>
  archiveActivity: (activity: TActivity) => Promise<boolean>
}

const ACTIVITY_ICONS: Record<TActivity['type'], TIcon> = {
  note: Note01Icon,
  call: Call02Icon,
  meeting: Calendar03Icon,
  email: Mail01Icon
}

type TRowProps = {
  icon?: TIcon
  // Something else where the icon goes: a task's checkbox.
  lead?: ReactNode
  // The sentence: who did what.
  children: ReactNode
  when?: string
  menu?: ReactNode
  // Anything under the sentence: a note's text, a form.
  below?: ReactNode
  // Field changes and stage moves are quieter than what people wrote.
  quiet?: boolean
}

const Row = ({
  icon,
  lead,
  children,
  when,
  menu,
  below,
  quiet = false
}: TRowProps) => (
  <li className="group/item flex gap-3 py-2" data-slot="timeline-item">
    <span className="flex size-6 flex-none items-center justify-center text-muted-foreground">
      {lead ?? (icon ? <Icon icon={icon} size={quiet ? 14 : 16} /> : null)}
    </span>
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex min-h-6 items-center gap-2">
        <p
          className={cn(
            'm-0 min-w-0 flex-1 text-sm',
            quiet ? 'text-muted-foreground' : 'text-foreground'
          )}
        >
          {children}
        </p>
        {when ? (
          <span className="flex-none text-body-sm whitespace-nowrap text-muted-foreground">
            {when}
          </span>
        ) : null}
        {menu ? (
          // Waits for hover, but stays for the keyboard, touch and an open menu.
          <span className="flex flex-none opacity-0 transition-opacity duration-150 group-hover/item:opacity-100 focus-within:opacity-100 has-aria-expanded:opacity-100 pointer-coarse:opacity-100">
            {menu}
          </span>
        ) : null}
      </div>
      {below}
    </div>
  </li>
)

/** The words someone wrote, as they wrote them. */
const Body = ({ children }: { children: string }) => (
  <p className="m-0 rounded-card bg-muted px-3 py-2 text-base wrap-break-word whitespace-pre-wrap text-foreground">
    {children}
  </p>
)

const Strong = ({ children }: { children: ReactNode }) => (
  <span className="font-semibold text-foreground">{children}</span>
)

type TRowMenuProps = {
  label: string
  onEdit: () => void
  onDelete: () => void
}

/** Edit and Delete, for whoever may change the row. */
const RowMenu = ({ label, onEdit, onDelete }: TRowMenuProps) => (
  <Menu
    align="end"
    items={[
      { label: 'Edit', icon: PencilEdit02Icon, onSelect: onEdit },
      { label: 'Delete', icon: Delete02Icon, danger: true, onSelect: onDelete }
    ]}
    label={label}
    trigger={
      <Button
        aria-label={label}
        lead={<Icon icon={MoreHorizontalIcon} />}
        size="sm"
        variant="ghost"
      />
    }
  />
)

type TActivityRowProps = {
  activity: TActivity
  actions: TTimelineActions
  problem: string | null
}

const ActivityRow = ({ activity, actions, problem }: TActivityRowProps) => {
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view')
  const [busy, setBusy] = useState(false)
  const author = activity.author?.name ?? 'Someone'
  const isCall = activity.type === 'call'
  const what = isCall ? 'call' : 'note'

  const settle = async (work: Promise<boolean>) => {
    setBusy(true)
    const worked = await work
    setBusy(false)
    if (worked) setMode('view')
  }

  return (
    <Row
      below={
        mode === 'edit' ? (
          <NoteForm
            busy={busy}
            initial={activity.body ?? ''}
            placeholder={isCall ? 'What was said on the call?' : undefined}
            problem={problem}
            submitLabel="Save"
            onCancel={() => setMode('view')}
            onSubmit={(body) =>
              void settle(actions.updateActivity(activity, body))
            }
          />
        ) : activity.body ? (
          <Body>{activity.body}</Body>
        ) : null
      }
      icon={ACTIVITY_ICONS[activity.type]}
      menu={
        activity.canEdit && mode === 'view' ? (
          <RowMenu
            label={`More for this ${what}`}
            onDelete={() => setMode('delete')}
            onEdit={() => setMode('edit')}
          />
        ) : null
      }
      when={formatWhen(activity.occurredAt)}
    >
      <Strong>{author}</Strong>
      {isCall ? (
        <>
          {activity.people.length > 0
            ? ` called ${joinNames(activity.people)} `
            : ' logged a call '}
          {activity.outcome ? (
            <Tag>{CALL_OUTCOME_LABELS[activity.outcome]}</Tag>
          ) : null}
        </>
      ) : activity.type === 'note' ? (
        activity.people.length > 0 ? (
          ` wrote a note about ${joinNames(activity.people)}`
        ) : (
          ' wrote a note'
        )
      ) : (
        ` · ${activity.title ?? activity.type}`
      )}
      <ConfirmDialog
        danger
        body={`It comes off this timeline for everyone.`}
        busy={busy}
        confirmLabel="Delete"
        open={mode === 'delete'}
        title={`Delete this ${what}?`}
        onCancel={() => setMode('view')}
        onConfirm={() => void settle(actions.archiveActivity(activity))}
        onOpenChange={(open) => {
          if (!open) setMode('view')
        }}
      />
    </Row>
  )
}

type TTaskRowProps = {
  task: TTask
  users: TOwner[]
  actions: TTimelineActions
  problem: string | null
}

const TaskRow = ({ task, users, actions, problem }: TTaskRowProps) => {
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view')
  const [busy, setBusy] = useState(false)
  const isDone = Boolean(task.completedAt)
  const isLate = !isDone && task.dueOn !== null && isOverdue(task.dueOn)

  const settle = async (work: Promise<boolean>) => {
    setBusy(true)
    const worked = await work
    setBusy(false)
    if (worked) setMode('view')
  }

  return (
    <Row
      below={
        mode === 'edit' ? (
          <TaskForm
            busy={busy}
            initial={{
              title: task.title,
              dueOn: task.dueOn,
              assigneeId: task.assignee.id
            }}
            problem={problem}
            users={users}
            onCancel={() => setMode('view')}
            onSubmit={(input) => void settle(actions.updateTask(task, input))}
          />
        ) : null
      }
      lead={
        <Checkbox
          aria-label={
            isDone ? `Reopen “${task.title}”` : `Mark “${task.title}” as done`
          }
          checked={isDone}
          disabled={!task.canEdit || busy}
          onCheckedChange={(checked) =>
            void settle(actions.setTaskDone(task, checked === true))
          }
        />
      }
      menu={
        task.canEdit && !isDone && mode === 'view' ? (
          <RowMenu
            label="More for this task"
            onDelete={() => setMode('delete')}
            onEdit={() => setMode('edit')}
          />
        ) : null
      }
      when={
        isDone && task.completedAt ? formatWhen(task.completedAt) : undefined
      }
    >
      <span
        className={cn(
          'font-medium',
          isDone && 'text-muted-foreground line-through'
        )}
      >
        {task.title}
      </span>
      {isDone ? null : (
        <span className="text-muted-foreground">
          {' · '}
          {task.dueOn ? (
            <span
              className={cn(isLate && 'font-semibold text-destructive')}
              data-late={isLate || undefined}
            >
              {isLate
                ? `Overdue, was due ${formatDue(task.dueOn)}`
                : `Due ${formatDue(task.dueOn)}`}
            </span>
          ) : (
            'No date'
          )}
          {` · ${task.assignee.name}`}
        </span>
      )}
      <ConfirmDialog
        danger
        body="It comes off every list, for everyone."
        busy={busy}
        confirmLabel="Delete"
        open={mode === 'delete'}
        title="Delete this task?"
        onCancel={() => setMode('view')}
        onConfirm={() => void settle(actions.archiveTask(task))}
        onOpenChange={(open) => {
          if (!open) setMode('view')
        }}
      />
    </Row>
  )
}

type TTimelineItemProps = {
  item: TTimelineItem
  // The kind of record this timeline belongs to.
  record: TRecordNoun
  users: TOwner[]
  // For money in field changes.
  currency?: string
  actions: TTimelineActions
  // Why the last change to this row didn't work, if it didn't.
  problem: string | null
}

/** One line of a timeline: a note, a call, a task, a change or a stage move. */
export const TimelineItem = ({
  item,
  record,
  users,
  currency,
  actions,
  problem
}: TTimelineItemProps) => {
  if (item.kind === 'activity') {
    return (
      <ActivityRow
        actions={actions}
        activity={item.activity}
        problem={problem}
      />
    )
  }
  if (item.kind === 'task') {
    return (
      <TaskRow
        actions={actions}
        problem={problem}
        task={item.task}
        users={users}
      />
    )
  }
  if (item.kind === 'stage') {
    return (
      <Row
        quiet
        icon={ArrowDataTransferHorizontalIcon}
        when={item.at ? formatWhen(item.at) : undefined}
      >
        {`${describeActor(item.actor)} `}
        {record === 'deal' ? (
          describeStageItem(item, true)
        ) : (
          <>
            {item.from ? 'moved ' : 'added '}
            <RecordLink href={`#/deals/${item.deal.id}`}>
              {item.deal.name}
            </RecordLink>
            {item.from
              ? ` from ${item.from.name} to ${item.to.name}`
              : ` in ${item.to.name}`}
          </>
        )}
      </Row>
    )
  }
  return (
    <Row
      quiet
      icon={PencilEdit02Icon}
      when={item.at ? formatWhen(item.at) : undefined}
    >
      {`${describeActor(item.actor, item.via)} ${describeChangeItem(item, record, currency)}`}
    </Row>
  )
}
