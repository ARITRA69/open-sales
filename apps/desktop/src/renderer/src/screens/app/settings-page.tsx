import type { ReactNode } from 'react'

import { Logout01Icon, RefreshIcon } from '@hugeicons/core-free-icons'

import { AiToolLogo } from '@/components/sales/ai-tool-logo'
import { PageBody } from '@/components/sales/app-shell'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Dot } from '@/components/ui/status'
import { describeAiTool } from '@/lib/ai-tool-help'

import type {
  TAiToolsStatus,
  TAiToolStatus
} from '../../../../preload/bridge-types'

type TSettingsPageProps = {
  name: string
  email: string
  roleLabel: string
  workspaceName: string | null
  serverHost: string
  // Null while checking, or where there's no way to check.
  aiTools: TAiToolsStatus | null
  onCheckAiTools: () => void
  onSignOut: () => void
}

/** For now: who you are, your AI tool, which server you're on, and Sign out. */
export const SettingsPage = ({
  name,
  email,
  roleLabel,
  workspaceName,
  serverHost,
  aiTools,
  onCheckAiTools,
  onSignOut
}: TSettingsPageProps) => (
  <PageBody narrow>
    <PageHeader
      subtitle="Your account, your AI tool and this workspace."
      title="Settings"
    />
    <SettingsSection title="Your account">
      <SettingsRow label="Name" value={name} />
      <SettingsRow label="Email" value={email} />
      <SettingsRow label="Role" value={roleLabel} />
    </SettingsSection>
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
    <SettingsSection title="Workspace">
      <SettingsRow label="Name" value={workspaceName ?? 'Not named yet'} />
      <SettingsRow label="Server" value={serverHost} />
    </SettingsSection>
    <div>
      <Button leadIcon={Logout01Icon} variant="secondary" onClick={onSignOut}>
        Sign out
      </Button>
    </div>
  </PageBody>
)

const SettingsSection = ({
  title,
  intro,
  action,
  children
}: {
  title: string
  intro?: string
  action?: ReactNode
  children: ReactNode
}) => (
  <section className="flex flex-col gap-2">
    <div className="flex min-h-7 items-center gap-2">
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="m-0 text-sm font-semibold">{title}</h2>
        {intro ? (
          <p className="m-0 text-body-sm text-muted-foreground">{intro}</p>
        ) : null}
      </div>
      {action}
    </div>
    <dl className="m-0 flex flex-col rounded-card bg-muted px-3">{children}</dl>
  </section>
)

const ROW_CLASS =
  'flex min-h-9 items-start gap-4 border-b border-border py-2 text-sm last:border-b-0'

const SettingsRow = ({ label, value }: { label: string; value: string }) => (
  <div className={ROW_CLASS}>
    <dt className="w-32 flex-none text-muted-foreground">{label}</dt>
    <dd className="m-0 min-w-0 truncate">{value}</dd>
  </div>
)

const AiToolRow = ({ tool }: { tool: TAiToolStatus }) => {
  const { status, tone, fix } = describeAiTool(tool)

  return (
    <div className={ROW_CLASS}>
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
