import type { ReactNode } from 'react'

import { Logout01Icon } from '@hugeicons/core-free-icons'

import { PageBody } from '@/components/sales/app-shell'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'

type TSettingsPageProps = {
  name: string
  email: string
  roleLabel: string
  workspaceName: string | null
  serverHost: string
  onSignOut: () => void
}

/** For now: who you are, which server you're on, and Sign out. */
export const SettingsPage = ({
  name,
  email,
  roleLabel,
  workspaceName,
  serverHost,
  onSignOut
}: TSettingsPageProps) => (
  <PageBody narrow>
    <PageHeader subtitle="Your account and this workspace." title="Settings" />
    <SettingsSection title="Your account">
      <SettingsRow label="Name" value={name} />
      <SettingsRow label="Email" value={email} />
      <SettingsRow label="Role" value={roleLabel} />
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
  children
}: {
  title: string
  children: ReactNode
}) => (
  <section className="flex flex-col gap-2">
    <h2 className="m-0 text-sm font-semibold">{title}</h2>
    <dl className="m-0 flex flex-col rounded-card bg-muted px-3">{children}</dl>
  </section>
)

const SettingsRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex min-h-9 items-center gap-4 border-b border-border text-sm last:border-b-0">
    <dt className="w-32 flex-none text-muted-foreground">{label}</dt>
    <dd className="m-0 min-w-0 truncate">{value}</dd>
  </div>
)
