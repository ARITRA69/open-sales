import type { ReactNode } from 'react'

import {
  Building06Icon,
  CancelCircleIcon,
  KanbanIcon,
  UserCircleIcon,
  UserGroupIcon
} from '@hugeicons/core-free-icons'
import type { TSessionUser } from '@open-sales/shared'
import { canManageWorkspace } from '@open-sales/shared'

import { PageBody } from '@/components/sales/app-shell'
import { Link } from '@/components/shared/link'
import { Icon, type TIcon } from '@/components/ui/icon'
import { PageHeader } from '@/components/ui/page-header'
import { useHashPath } from '@/hooks/use-hash-route'
import type { TTeamControls } from '@/hooks/use-team'
import { cn } from '@/lib/utils'

import type { TAiToolsStatus } from '../../../../preload/bridge-types'
import { MySettingsSection } from './settings/my-settings-section'
import {
  LostReasonsSection,
  PipelineStagesSection
} from './settings/pipeline-sections'
import {
  getSettingsBridge,
  type TSettingsBridge
} from './settings/settings-bridge'
import { SectionStatus } from './settings/settings-parts'
import { ROLE_LABELS } from './settings/team-list'
import { WorkspaceSection } from './settings/workspace-section'
import { TeamSection } from './team-section'

type TSectionId = 'me' | 'workspace' | 'pipeline' | 'lost-reasons' | 'team'

type TSection = {
  id: TSectionId
  label: string
  icon: TIcon
  // Run by admins; nobody else is shown it.
  adminOnly: boolean
}

// Each has its own address: #/settings/<id>.
const SECTIONS: TSection[] = [
  { id: 'me', label: 'My settings', icon: UserCircleIcon, adminOnly: false },
  {
    id: 'workspace',
    label: 'Workspace',
    icon: Building06Icon,
    adminOnly: true
  },
  {
    id: 'pipeline',
    label: 'Pipeline stages',
    icon: KanbanIcon,
    adminOnly: true
  },
  {
    id: 'lost-reasons',
    label: 'Lost reasons',
    icon: CancelCircleIcon,
    adminOnly: true
  },
  { id: 'team', label: 'Team', icon: UserGroupIcon, adminOnly: true }
]

type TSettingsPageProps = {
  user: TSessionUser
  workspaceName: string | null
  serverHost: string
  // Null while checking, or where there's no way to check.
  aiTools: TAiToolsStatus | null
  onCheckAiTools: () => void
  // Admins only: the join link and the team.
  team?: TTeamControls | null
  // How settings reach the server. Left out, it's the app's own bridge;
  // null means there's none.
  bridge?: TSettingsBridge | null
  onSignOut: () => void
}

/**
 * Settings, in sections down the left: My settings for everyone, and the
 * workspace's own (Workspace, Pipeline stages, Lost reasons, Team) for
 * admins. The server refuses the admin sections' changes from anyone else;
 * here they simply aren't offered.
 */
export const SettingsPage = ({
  user,
  workspaceName,
  serverHost,
  aiTools,
  onCheckAiTools,
  team = null,
  bridge,
  onSignOut
}: TSettingsPageProps) => {
  const [wanted] = useHashPath()
  const settingsBridge = bridge === undefined ? getSettingsBridge() : bridge
  const isAdmin = canManageWorkspace(user.role)
  const sections = SECTIONS.filter((section) => isAdmin || !section.adminOnly)
  // An address someone can't use, or mistyped, shows their own settings.
  const active = sections.find((section) => section.id === wanted)?.id ?? 'me'

  // An admin section with no way to reach the server has nothing to show.
  const withBridge = (render: (found: TSettingsBridge) => ReactNode) =>
    settingsBridge ? (
      render(settingsBridge)
    ) : (
      <SectionStatus problem="These settings need a connection to your server." />
    )

  const body = (() => {
    switch (active) {
      case 'workspace':
        return withBridge((found) => <WorkspaceSection bridge={found} />)
      case 'pipeline':
        return withBridge((found) => <PipelineStagesSection bridge={found} />)
      case 'lost-reasons':
        return withBridge((found) => <LostReasonsSection bridge={found} />)
      case 'team':
        return (
          <>
            <PageHeader
              subtitle="Who can join, who has, and what each person can do."
              title="Team"
            />
            {team ? (
              <TeamSection bridge={settingsBridge} meId={user.id} team={team} />
            ) : (
              <SectionStatus problem="The team list needs a connection to your server." />
            )}
          </>
        )
      default:
        return (
          <MySettingsSection
            aiTools={aiTools}
            bridge={settingsBridge}
            roleLabel={ROLE_LABELS[user.role]}
            serverHost={serverHost}
            user={user}
            workspaceName={workspaceName}
            onCheckAiTools={onCheckAiTools}
            onSignOut={onSignOut}
          />
        )
    }
  })()

  return (
    <div className="flex min-h-0 flex-1">
      <nav
        aria-label="Settings"
        className="box-border flex w-48 flex-none flex-col gap-0.5 overflow-y-auto border-r border-border px-2 pt-5 pb-4"
      >
        {sections.map((section, index) => (
          <SectionLink
            key={section.id}
            isActive={section.id === active}
            section={section}
            // The first section an admin runs starts a new group.
            startsGroup={section.adminOnly && !sections[index - 1]?.adminOnly}
          />
        ))}
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <PageBody narrow>{body}</PageBody>
      </div>
    </div>
  )
}

const SectionLink = ({
  section,
  isActive,
  startsGroup
}: {
  section: TSection
  isActive: boolean
  startsGroup: boolean
}) => (
  <>
    {startsGroup ? (
      <span className="mt-3 px-2.5 pb-1 text-body-sm font-semibold text-muted-foreground">
        Workspace settings
      </span>
    ) : null}
    <Link
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex h-7.5 flex-none items-center gap-2.5 rounded-panel px-2.5 text-sm font-medium text-foreground no-underline transition-colors outline-none keyboard-focus:shadow-(--halo-keyboard)',
        isActive ? 'bg-secondary font-semibold' : 'hover:bg-muted'
      )}
      href={`#/settings/${section.id}`}
    >
      <Icon
        className="flex-none"
        icon={section.icon}
        size={16}
        strokeWidth={1.6}
      />
      <span className="truncate">{section.label}</span>
    </Link>
  </>
)
