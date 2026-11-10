import { useMemo, useState, type FormEvent } from 'react'

import type { TWorkspaceSettings, TWorkspaceUpdate } from '@open-sales/shared'
import { workspaceUpdateSchema } from '@open-sales/shared'

import { Button } from '@/components/ui/button'
import { Field, type TSelectOption } from '@/components/ui/field'
import { PageHeader } from '@/components/ui/page-header'
import { useCall } from '@/hooks/use-records'

import type { TSettingsBridge } from './settings-bridge'
import { Problem, SectionStatus, useSave } from './settings-parts'

/** Every currency this machine knows, as "USD · US Dollar". */
const currencyOptions = (current: string): TSelectOption[] => {
  const names = new Intl.DisplayNames(undefined, { type: 'currency' })
  const codes = new Set([...Intl.supportedValuesOf('currency'), current])
  return [...codes].sort().map((code) => {
    let name: string | undefined
    try {
      name = names.of(code)
    } catch {
      name = undefined
    }
    return {
      value: code,
      label: name && name !== code ? `${code} · ${name}` : code
    }
  })
}

/** Every time zone this machine knows, as "Europe/London". */
const timeZoneOptions = (current: string): TSelectOption[] =>
  [...new Set(['UTC', ...Intl.supportedValuesOf('timeZone'), current])].map(
    (zone) => ({ value: zone, label: zone.replaceAll('_', ' ') })
  )

/** Settings › Workspace: its name, currency and time zone. Admins only. */
export const WorkspaceSection = ({ bridge }: { bridge: TSettingsBridge }) => {
  const loaded = useCall(bridge.getWorkspace)
  // What the last save answered.
  const [saved, setSaved] = useState<TWorkspaceSettings | null>(null)
  const workspace = saved ?? loaded.data

  return (
    <>
      <PageHeader
        subtitle="What everyone on this server shares."
        title="Workspace"
      />
      {workspace ? (
        <WorkspaceForm
          workspace={workspace}
          onSave={async (changes) => {
            const result = await bridge.updateWorkspace(changes)
            if (result.ok) setSaved(result.data)
            return result
          }}
        />
      ) : (
        <SectionStatus problem={loaded.problem} onRetry={loaded.reload} />
      )}
    </>
  )
}

type TWorkspaceFormProps = {
  workspace: TWorkspaceSettings
  onSave: TSettingsBridge['updateWorkspace']
}

export const WorkspaceForm = ({ workspace, onSave }: TWorkspaceFormProps) => {
  // What's typed or picked, else what's saved.
  const [edits, setEdits] = useState<Partial<TWorkspaceSettings>>({})
  const [nameError, setNameError] = useState<string | undefined>()
  const save = useSave(onSave)
  const shown = { ...workspace, ...edits }

  const currencies = useMemo(
    () => currencyOptions(workspace.currency),
    [workspace.currency]
  )
  const timeZones = useMemo(
    () => timeZoneOptions(workspace.timeZone),
    [workspace.timeZone]
  )

  const changes: TWorkspaceUpdate = {
    name: shown.name.trim() !== workspace.name ? shown.name : undefined,
    currency:
      shown.currency !== workspace.currency ? shown.currency : undefined,
    timeZone: shown.timeZone !== workspace.timeZone ? shown.timeZone : undefined
  }
  const isDirty = Object.values(changes).some((value) => value !== undefined)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const parsed = workspaceUpdateSchema.safeParse(changes)
    if (!parsed.success) {
      setNameError(parsed.error.issues[0].message)
      return
    }
    setNameError(undefined)
    const result = await save.run(parsed.data)
    if (result.ok) setEdits({})
  }

  return (
    <form
      noValidate
      className="flex max-w-120 flex-col gap-4"
      onSubmit={handleSubmit}
    >
      <Field
        error={nameError}
        hint="Shown on the sign-in screen and to people who open the join link."
        label="Name"
        maxLength={80}
        value={shown.name}
        onChange={(event) => setEdits({ ...edits, name: event.target.value })}
      />
      <Field
        searchable
        hint="New deals start in this currency. Deals you already have keep theirs."
        kind="select"
        label="Currency"
        options={currencies}
        value={shown.currency}
        onValueChange={(currency) => setEdits({ ...edits, currency })}
      />
      <Field
        searchable
        hint="Decides when “today” starts and ends for due dates and reports."
        kind="select"
        label="Time zone"
        options={timeZones}
        value={shown.timeZone}
        onValueChange={(timeZone) => setEdits({ ...edits, timeZone })}
      />
      {save.problem ? <Problem>{save.problem}</Problem> : null}
      <div className="flex items-center gap-2">
        <Button disabled={!isDirty} loading={save.isSaving} type="submit">
          Save
        </Button>
        <Button
          disabled={!isDirty || save.isSaving}
          variant="ghost"
          onClick={() => {
            setEdits({})
            setNameError(undefined)
          }}
        >
          Discard changes
        </Button>
      </div>
    </form>
  )
}
