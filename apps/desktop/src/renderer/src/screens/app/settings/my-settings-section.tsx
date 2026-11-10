import { useState, type FormEvent } from 'react'

import { Logout01Icon, RefreshIcon } from '@hugeicons/core-free-icons'
import type { TSessionUser } from '@open-sales/shared'
import { profileUpdateSchema } from '@open-sales/shared'

import { AiToolLogo } from '@/components/sales/ai-tool-logo'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { PageHeader } from '@/components/ui/page-header'
import { Dot } from '@/components/ui/status'
import { describeAiTool } from '@/lib/ai-tool-help'

import type {
  TAiToolsStatus,
  TAiToolStatus
} from '../../../../../preload/bridge-types'
import type { TSettingsBridge } from './settings-bridge'
import {
  Problem,
  SETTINGS_ROW_CLASS,
  SettingsRow,
  SettingsSection,
  useSave
} from './settings-parts'

type TMySettingsSectionProps = {
  user: TSessionUser
  roleLabel: string
  workspaceName: string | null
  serverHost: string
  // Null while checking, or where there's no way to check.
  aiTools: TAiToolsStatus | null
  onCheckAiTools: () => void
  // Null where there's nowhere to save a new name.
  bridge: TSettingsBridge | null
  onSignOut: () => void
}

/** Settings › My settings: who you are, your AI tool, and Sign out. */
export const MySettingsSection = ({
  user,
  roleLabel,
  workspaceName,
  serverHost,
  aiTools,
  onCheckAiTools,
  bridge,
  onSignOut
}: TMySettingsSectionProps) => (
  <>
    <PageHeader
      subtitle="Your account and the AI tool on this computer."
      title="My settings"
    />
    <section className="flex flex-col gap-2">
      <h2 className="m-0 text-sm font-semibold">Your account</h2>
      {bridge ? <NameForm name={user.name} onSave={bridge.updateMe} /> : null}
      <dl className="m-0 flex flex-col rounded-card bg-muted px-3">
        {bridge ? null : <SettingsRow label="Name" value={user.name} />}
        <SettingsRow label="Email" value={user.email} />
        <SettingsRow label="Role" value={roleLabel} />
      </dl>
    </section>
    <SettingsSection
      action={
        <Button
          leadIcon={RefreshIcon}
          size="sm"
          variant="ghost"
          onClick={onCheckAiTools}
        >
          Check again
        </Button>
      }
      intro="AI help runs on your own Claude Code or Codex. One is enough."
      title="AI tool"
    >
      {aiTools ? (
        aiTools.tools.map((tool) => <AiToolRow key={tool.id} tool={tool} />)
      ) : (
        <SettingsRow label="Status" value="Checking…" />
      )}
    </SettingsSection>
    <SettingsSection title="This workspace">
      <SettingsRow label="Name" value={workspaceName ?? 'Not named yet'} />
      <SettingsRow label="Server" value={serverHost} />
    </SettingsSection>
    <div>
      <Button leadIcon={Logout01Icon} variant="secondary" onClick={onSignOut}>
        Sign out
      </Button>
    </div>
  </>
)

type TNameFormProps = {
  name: string
  onSave: TSettingsBridge['updateMe']
}

const NameForm = ({ name, onSave }: TNameFormProps) => {
  // What's typed, else what's saved.
  const [typed, setTyped] = useState<string | null>(null)
  // What the last save answered, until the app's own copy catches up.
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | undefined>()
  const save = useSave(onSave)
  const current = saved ?? name
  const shown = typed ?? current
  const isDirty = shown.trim() !== current

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const parsed = profileUpdateSchema.safeParse({ name: shown })
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }
    setError(undefined)
    const result = await save.run(parsed.data)
    if (!result.ok) return
    setSaved(result.data.name)
    setTyped(null)
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-2 rounded-card bg-background p-3 shadow-(--shadow-tile)"
      onSubmit={handleSubmit}
    >
      <div className="flex items-start gap-2">
        <Field
          autoComplete="name"
          className="max-w-100 flex-1"
          error={error}
          hint="How teammates see you on accounts, deals and the timeline."
          label="Name"
          maxLength={80}
          value={shown}
          onChange={(event) => setTyped(event.target.value)}
        />
        <Button
          className="mt-5.5"
          disabled={!isDirty}
          loading={save.isSaving}
          type="submit"
          variant="secondary"
        >
          Save
        </Button>
      </div>
      {save.problem ? <Problem>{save.problem}</Problem> : null}
    </form>
  )
}

const AiToolRow = ({ tool }: { tool: TAiToolStatus }) => {
  const { status, tone, fix } = describeAiTool(tool)

  return (
    <div className={SETTINGS_ROW_CLASS}>
      <dt className="flex w-32 flex-none items-center gap-2 text-muted-foreground">
        <AiToolLogo id={tool.id} muted={tool.state !== 'ready'} />
        {tool.name}
      </dt>
      <dd className="m-0 flex min-w-0 flex-col gap-1">
        <span className="flex items-center gap-2">
          <Dot size="sm" tone={tone} />
          {status}
        </span>
        {fix ? (
          <span className="text-body-sm text-muted-foreground">
            {fix.text}{' '}
            <code className="rounded-sm bg-background px-1 py-0.5 font-mono text-foreground select-all">
              {fix.command}
            </code>
          </span>
        ) : null}
      </dd>
    </div>
  )
}
