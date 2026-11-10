import { useCallback } from 'react'

import type { TSessionUser } from '@open-sales/shared'
import { canWritePlaybooks } from '@open-sales/shared'

import { PageBody } from '@/components/sales/app-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SkeletonRows, StatePanel } from '@/components/ui/state-panel'
import { useHashPath } from '@/hooks/use-hash-route'
import { useCall } from '@/hooks/use-records'
import { EMPTY_PAGES, EmptyPage } from '@/screens/app/empty-page'

import type { TAiToolsStatus } from '../../../../../preload/bridge-types'
import { PlaybookEditor } from './playbook-editor'
import { playbookHref, PlaybookLibrary } from './playbook-library'
import {
  DEFAULT_PLAYBOOKS_BRIDGE,
  PREVIEW_ROLE,
  type TPlaybooksBridge
} from './playbooks-bridge'

type TPlaybooksPageProps = {
  me: TSessionUser
  // Which AI tools this computer has, for "Try it". Null while unknown.
  aiTools?: TAiToolsStatus | null
  // Defaults to the app's own; tests pass theirs.
  bridge?: TPlaybooksBridge | null
}

/**
 * Playbooks: the library at `#/playbooks`, and one playbook's editor at
 * `#/playbooks/<id>` (`new` for one not saved yet).
 */
export const PlaybooksPage = ({
  me,
  aiTools = null,
  bridge = DEFAULT_PLAYBOOKS_BRIDGE
}: TPlaybooksPageProps) => {
  const [id] = useHashPath()

  // No way to reach a server: the same calm page as before there were playbooks.
  if (!bridge) return <EmptyPage page="playbooks" />

  const canWrite = canWritePlaybooks(PREVIEW_ROLE ?? me.role)
  const aiToolReady = aiTools
    ? aiTools.tools.some((tool) => tool.state === 'ready')
    : null

  if (!id) return <PlaybookLibrary bridge={bridge} canWrite={canWrite} />

  if (id === 'new') {
    return canWrite ? (
      <PlaybookEditor
        key="new"
        canWrite
        aiToolReady={aiToolReady}
        bridge={bridge}
        playbook={null}
        // The address becomes the playbook's own without leaving the editor,
        // so Back goes to the library and a reload opens what was saved.
        onCreated={(created) =>
          window.history.replaceState(null, '', playbookHref(created.id))
        }
      />
    ) : (
      <Missing message="Only managers and admins can write playbooks." />
    )
  }

  return (
    <SavedPlaybook
      key={id}
      aiToolReady={aiToolReady}
      bridge={bridge}
      canWrite={canWrite}
      id={id}
    />
  )
}

/** One saved playbook, fetched by the id in the address. */
const SavedPlaybook = ({
  bridge,
  id,
  canWrite,
  aiToolReady
}: {
  bridge: TPlaybooksBridge
  id: string
  canWrite: boolean
  aiToolReady: boolean | null
}) => {
  const load = useCallback(() => bridge.get(id), [bridge, id])
  const found = useCall(load)

  if (found.state === 'loading') {
    return (
      <PageBody narrow>
        <PageHeader
          backLink={{ label: 'Playbooks', href: '#/playbooks' }}
          title={EMPTY_PAGES.playbooks.title}
        />
        <SkeletonRows />
      </PageBody>
    )
  }
  if (!found.data) return <Missing message={found.problem} />

  return (
    <PlaybookEditor
      aiToolReady={aiToolReady}
      bridge={bridge}
      canWrite={canWrite && found.data.canEdit}
      playbook={found.data}
    />
  )
}

const Missing = ({ message }: { message: string | null }) => (
  <PageBody narrow>
    <PageHeader
      backLink={{ label: 'Playbooks', href: '#/playbooks' }}
      title={EMPTY_PAGES.playbooks.title}
    />
    <StatePanel
      action="Back to playbooks"
      body={message ?? 'That playbook isn’t here.'}
      kind="none"
      title="This playbook isn’t here"
      onAction={() => {
        window.location.hash = '#/playbooks'
      }}
    />
  </PageBody>
)
