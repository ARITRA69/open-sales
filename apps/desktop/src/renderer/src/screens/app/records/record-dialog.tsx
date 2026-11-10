import { useState, type FormEvent, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import type { TRecordsBridge } from '@/hooks/use-records'

import type {
  TApiResult,
  TRecordKind,
  TRecordTypes
} from '../../../../../preload/bridge-types'

type TItemOf<TKind extends TRecordKind> = TRecordTypes[TKind]['item']

type TRecordDialogProps<TKind extends TRecordKind> = {
  bridge: TRecordsBridge
  kind: TKind
  // Null for a new record.
  record: TItemOf<TKind> | null
  // "account", "person", "deal": used in titles and buttons.
  noun: string
  title: string
  // Checks the form; returns the create or update input, or a problem.
  readForm: () =>
    | { ok: true; input: Record<string, unknown> }
    | { ok: false; problem: string }
  // After a save, archive or restore, with the record as it now is.
  onSaved: (record: TItemOf<TKind>) => void
  // Someone else changed it first: the latest copy, to fill the form again.
  onStale: (record: TItemOf<TKind>) => void
  onClose: () => void
  children: ReactNode
}

/**
 * Creating or editing one record. People who can't change it see the same
 * fields, read-only. Archive and Restore sit at the bottom left.
 */
export const RecordDialog = <TKind extends TRecordKind>({
  bridge,
  kind,
  record,
  noun,
  title,
  readForm,
  onSaved,
  onStale,
  onClose,
  children
}: TRecordDialogProps<TKind>) => {
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState<'save' | 'archive' | null>(null)

  const canEdit = record === null || record.canEdit
  const isArchived = Boolean(record?.archivedAt)

  /** Runs a call; on success hands the record back, else shows why not. */
  const settle = async (
    action: 'save' | 'archive',
    call: () => Promise<TApiResult<TItemOf<TKind>>>
  ) => {
    setBusy(action)
    const answer = await call()
    setBusy(null)
    if (answer.ok) {
      setProblem(null)
      onSaved(answer.data)
      return
    }
    setProblem(answer.message)
    if (answer.code === 'changed_since' && record) {
      const latest = await bridge.get(kind, record.id)
      if (latest.ok) onStale(latest.data)
    }
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const form = readForm()
    if (!form.ok) {
      setProblem(form.problem)
      return
    }
    void settle('save', () =>
      record
        ? bridge.update(kind, record.id, {
            ...form.input,
            version: record.version
          } as TRecordTypes[TKind]['update'])
        : bridge.create(kind, form.input as TRecordTypes[TKind]['create'])
    )
  }

  const handleArchive = () => {
    if (!record) return
    void settle('archive', () =>
      bridge.setArchived(
        kind,
        record.id,
        isArchived ? 'restore' : 'archive',
        record.version
      )
    )
  }

  const description = !canEdit
    ? `Only its owner, a manager or an admin can change this ${noun}.`
    : isArchived
      ? `This ${noun} is archived. Restore it to change it.`
      : undefined

  return (
    <Dialog
      open
      description={description}
      footer={
        <>
          {record && canEdit ? (
            <Button
              className="mr-auto"
              loading={busy === 'archive'}
              variant="ghost"
              onClick={handleArchive}
            >
              {isArchived ? 'Restore' : 'Archive'}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            {canEdit && !isArchived ? 'Cancel' : 'Close'}
          </Button>
          {canEdit && !isArchived ? (
            <Button form="record-form" loading={busy === 'save'} type="submit">
              {record ? 'Save' : `Add ${noun}`}
            </Button>
          ) : null}
        </>
      }
      title={title}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <form
        noValidate
        className="flex flex-col gap-3"
        id="record-form"
        onSubmit={handleSubmit}
      >
        <fieldset
          className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0"
          disabled={!canEdit || isArchived}
        >
          {children}
        </fieldset>
        {problem ? (
          <p className="m-0 text-sm text-destructive" role="alert">
            {problem}
          </p>
        ) : null}
      </form>
    </Dialog>
  )
}
