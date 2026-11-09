import { useRef, useState, type ComponentProps } from 'react'

import {
  ArrowDown01Icon,
  Attachment01Icon,
  Note01Icon
} from '@hugeicons/core-free-icons'
import { Popover } from 'radix-ui'

import { Icon } from '@/components/ui/icon'
import { Menu, type TMenuItem } from '@/components/ui/menu'
import { cn } from '@/lib/utils'

import {
  DEAL_STATUS_NONE,
  NOT_STARTED,
  STATUS_TONE_CLASS,
  STATUSES_BY_STAGE,
  statusLookFor,
  type TDealStatus
} from './deal-status-config'
import { DealStatusNote } from './deal-status-note'

type TDealStatusChipProps = {
  status: string
} & ComponentProps<'button'>

// Radix hands the menu's props and ref through to this button.
const DealStatusChip = ({
  status,
  className,
  ...buttonProps
}: TDealStatusChipProps) => {
  const statusLook = statusLookFor(status)
  const isIdle = statusLook.tone === 'idle'

  return (
    <button
      type="button"
      {...buttonProps}
      className={cn(
        'relative box-border inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border-none bg-secondary px-2 text-body-sm whitespace-nowrap transition-colors outline-none hover:bg-input keyboard-focus:shadow-(--halo-search)',
        isIdle
          ? 'font-medium text-muted-foreground'
          : 'font-semibold text-foreground',
        className
      )}
    >
      <span
        className={cn('flex flex-none', STATUS_TONE_CLASS[statusLook.tone])}
      >
        <Icon icon={statusLook.icon} size={15} strokeWidth={1.7} />
      </span>
      <span className="truncate">{status}</span>
      <Icon className="flex-none" icon={ArrowDown01Icon} size={12} />
    </button>
  )
}

type TDealStatusProps = {
  stage: string
  account: string
  value?: TDealStatus
  onChange: (dealStatus: TDealStatus) => void
  // On one line, for table rows. Without it the note sits under the chip.
  inline?: boolean
}

const isNoteDirty = (draft: TDealStatus, base: TDealStatus) =>
  draft.note !== base.note || draft.files.length !== base.files.length

/**
 * A deal's status in its stage. Not started applies at once. Anything else asks
 * for a note and up to 5 files, and clicking outside won't lose what was typed.
 */
export const DealStatus = ({
  stage,
  account,
  value = DEAL_STATUS_NONE,
  onChange,
  inline = false
}: TDealStatusProps) => {
  // Note: The note waits for the menu to finish closing, so the menu can't take
  // focus back from the note box on its way out.
  const noteAfterMenu = useRef<TDealStatus | null>(null)

  const [noteDraft, setNoteDraft] = useState<TDealStatus | null>(null)
  const [noteBase, setNoteBase] = useState<TDealStatus>(value)

  const fileCount = value.files.length
  const hasExtra = Boolean(value.note) || fileCount > 0
  const statusOptions = STATUSES_BY_STAGE[stage] ?? [NOT_STARTED]

  const openNote = (dealStatus: TDealStatus) => {
    setNoteDraft(dealStatus)
    setNoteBase(dealStatus)
  }

  const pickStatus = (status: string) => {
    if (status === NOT_STARTED) {
      if (value.status !== NOT_STARTED) onChange(DEAL_STATUS_NONE)
      return
    }
    noteAfterMenu.current =
      status === value.status ? value : { status, note: '', files: [] }
  }

  const statusMenuItems: TMenuItem[] = statusOptions.map((status) => ({
    label: status,
    icon: statusLookFor(status).icon,
    hint: status === value.status ? 'Current' : undefined,
    onSelect: () => pickStatus(status)
  }))

  return (
    <Popover.Root
      open={noteDraft !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) setNoteDraft(null)
      }}
    >
      <Popover.Anchor asChild>
        <div
          className={cn(
            'flex w-full min-w-0 flex-col items-start gap-1',
            inline && 'flex-row items-center gap-1.5'
          )}
        >
          <Menu
            items={statusMenuItems}
            label="Status"
            trigger={
              <DealStatusChip
                aria-label={`Status for ${account}: ${value.status}. Change status`}
                status={value.status}
              />
            }
            onCloseAutoFocus={(focusEvent) => {
              if (!noteAfterMenu.current) return
              focusEvent.preventDefault()
              openNote(noteAfterMenu.current)
              noteAfterMenu.current = null
            }}
          />
          {hasExtra ? (
            <button
              aria-label={`Open the note and files for ${account}`}
              className={cn(
                'box-border flex min-h-6 min-w-0 items-center gap-1.5 rounded-sm border-none bg-transparent px-1.5 py-0.5 text-left text-body-sm text-foreground-soft transition-colors outline-none hover:bg-secondary keyboard-focus:shadow-(--halo-search)',
                inline ? 'flex-none' : 'w-full'
              )}
              title={value.note || undefined}
              type="button"
              onClick={() => openNote(value)}
            >
              {inline ? null : (
                <span className="min-w-0 flex-1 truncate">
                  {value.note ||
                    (fileCount === 1 ? '1 file' : `${fileCount} files`)}
                </span>
              )}
              {inline && value.note ? (
                <span className="flex text-muted-foreground">
                  <Icon icon={Note01Icon} size={14} strokeWidth={1.6} />
                </span>
              ) : null}
              {fileCount > 0 ? (
                <span className="inline-flex flex-none items-center gap-0.75 text-muted-foreground tabular-nums">
                  <Icon icon={Attachment01Icon} size={13} strokeWidth={1.6} />
                  {value.note || inline ? fileCount : null}
                </span>
              ) : null}
            </button>
          ) : null}
        </div>
      </Popover.Anchor>

      <Popover.Portal>
        <Popover.Content
          align="start"
          aria-label={`${noteDraft?.status}, note and files`}
          className="sales-popover z-50 box-border max-h-(--radix-popover-content-available-height) w-85 scrollbar-thin overflow-y-auto rounded-dialog bg-background p-4.5 shadow-(--shadow-menu)"
          collisionPadding={12}
          sideOffset={6}
          onInteractOutside={(outsideEvent) => {
            if (noteDraft && isNoteDirty(noteDraft, noteBase)) {
              outsideEvent.preventDefault()
            }
          }}
        >
          {noteDraft ? (
            <DealStatusNote
              account={account}
              draft={noteDraft}
              stage={stage}
              onCancel={() => setNoteDraft(null)}
              onDraftChange={setNoteDraft}
              onSave={() => {
                onChange({ ...noteDraft, note: noteDraft.note.trim() })
                setNoteDraft(null)
              }}
            />
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
