import { useRef, useState, type DragEvent } from 'react'

import {
  Alert02Icon,
  Attachment01Icon,
  Cancel01Icon,
  File01Icon
} from '@hugeicons/core-free-icons'

import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'

import {
  formatFileSize,
  MAX_STATUS_FILES,
  STATUS_TONE_CLASS,
  statusLookFor,
  type TDealStatus
} from './deal-status-config'

type TDealStatusNoteProps = {
  draft: TDealStatus
  account: string
  stage: string
  onDraftChange: (draft: TDealStatus) => void
  onSave: () => void
  onCancel: () => void
}

/** The note and files behind a status: what happened, in a person's words. */
export const DealStatusNote = ({
  draft,
  account,
  stage,
  onDraftChange,
  onSave,
  onCancel
}: TDealStatusNoteProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isFileOver, setIsFileOver] = useState(false)
  const [fileWarning, setFileWarning] = useState('')

  const statusLook = statusLookFor(draft.status)
  const isFull = draft.files.length >= MAX_STATUS_FILES

  const addFiles = (incomingFiles: File[]) => {
    const newFiles = incomingFiles.filter(
      (incomingFile) =>
        !draft.files.some(
          (existingFile) =>
            existingFile.name === incomingFile.name &&
            existingFile.bytes === incomingFile.size
        )
    )
    const roomLeft = Math.max(MAX_STATUS_FILES - draft.files.length, 0)
    const filesToAdd = newFiles.slice(0, roomLeft).map((newFile) => ({
      name: newFile.name,
      bytes: newFile.size
    }))
    const leftOverCount = newFiles.length - filesToAdd.length

    onDraftChange({ ...draft, files: [...draft.files, ...filesToAdd] })
    setIsFileOver(false)
    setFileWarning(
      leftOverCount > 0
        ? `A status can hold 5 files, so ${leftOverCount} ${leftOverCount === 1 ? 'file was' : 'files were'} not added.`
        : ''
    )
  }

  const handleFileDrop = (dropEvent: DragEvent<HTMLDivElement>) => {
    dropEvent.preventDefault()
    addFiles(Array.from(dropEvent.dataTransfer.files))
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-3 transition-colors',
        isFileOver && 'bg-muted'
      )}
      onDragLeave={(dragEvent) => {
        if (
          !dragEvent.currentTarget.contains(dragEvent.relatedTarget as Node)
        ) {
          setIsFileOver(false)
        }
      }}
      onDragOver={(dragEvent) => {
        dragEvent.preventDefault()
        setIsFileOver(true)
      }}
      onDrop={handleFileDrop}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            'flex size-7 flex-none items-center justify-center rounded-panel bg-secondary',
            STATUS_TONE_CLASS[statusLook.tone]
          )}
        >
          <Icon icon={statusLook.icon} size={15} strokeWidth={1.7} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm leading-4.5 font-semibold">
            {draft.status}
          </span>
          <span className="truncate text-body-sm text-muted-foreground">
            {account} · {stage}
          </span>
        </div>
      </div>

      <Field
        autoFocus
        kind="textarea"
        label="Note"
        placeholder={statusLook.prompt}
        rows={3}
        value={draft.note}
        onChange={(changeEvent) =>
          onDraftChange({ ...draft, note: changeEvent.target.value })
        }
      />

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-body-sm font-semibold">Files</span>
          <span className="ml-auto text-body-sm text-muted-foreground tabular-nums">
            {draft.files.length} of {MAX_STATUS_FILES}
          </span>
        </div>

        {draft.files.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {draft.files.map((statusFile, fileIndex) => (
              <li
                key={`${statusFile.name}-${statusFile.bytes}`}
                className="flex min-h-7 items-center gap-2 rounded-panel bg-muted py-0.5 pr-0.5 pl-2"
              >
                <span className="flex flex-none text-foreground-soft">
                  <Icon icon={File01Icon} size={14} strokeWidth={1.6} />
                </span>
                <span
                  className="min-w-0 flex-1 truncate text-sm"
                  title={statusFile.name}
                >
                  {statusFile.name}
                </span>
                <span className="flex-none text-body-sm text-muted-foreground">
                  {formatFileSize(statusFile.bytes)}
                </span>
                <Button
                  aria-label={`Remove ${statusFile.name}`}
                  leadIcon={Cancel01Icon}
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    onDraftChange({
                      ...draft,
                      files: draft.files.filter(
                        (_, otherIndex) => otherIndex !== fileIndex
                      )
                    })
                    setFileWarning('')
                  }}
                />
              </li>
            ))}
          </ul>
        ) : null}

        <input
          ref={fileInputRef}
          multiple
          aria-label="Add files"
          className="hidden"
          type="file"
          onChange={(changeEvent) =>
            addFiles(Array.from(changeEvent.target.files ?? []))
          }
        />
        <Button
          disabled={isFull}
          leadIcon={Attachment01Icon}
          variant="secondary"
          onClick={() => {
            if (fileInputRef.current) {
              fileInputRef.current.value = ''
              fileInputRef.current.click()
            }
          }}
        >
          {isFull ? '5 files added' : 'Add files, or drop them here'}
        </Button>

        {fileWarning ? (
          <p
            className="m-0 flex items-start gap-1.5 text-body-sm text-foreground-soft"
            role="alert"
          >
            <Icon className="mt-0.5 flex-none" icon={Alert02Icon} size={14} />
            <span>{fileWarning}</span>
          </p>
        ) : null}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onSave}>Save</Button>
      </div>
    </div>
  )
}
