import { useCallback, useState } from 'react'

import type { TPipelineSettings } from '@open-sales/shared'

import { PageHeader } from '@/components/ui/page-header'
import { useCall } from '@/hooks/use-records'

import type { TApiResult } from '../../../../../preload/bridge-types'
import { LostReasonsEditor } from './lost-reasons-editor'
import type { TSettingsBridge } from './settings-bridge'
import { SectionStatus } from './settings-parts'
import { StagesEditor } from './stages-editor'

/**
 * The pipeline as an admin edits it: loaded once, replaced by each save's
 * answer, and loaded again on request (after someone else saved first).
 */
const usePipelineSettings = (bridge: TSettingsBridge) => {
  const loaded = useCall(bridge.getPipeline)
  // What the last save answered, until a fresh load replaces it.
  const [saved, setSaved] = useState<TPipelineSettings | null>(null)
  const { reload } = loaded

  const keep = useCallback(
    async (saving: Promise<TApiResult<TPipelineSettings>>) => {
      const result = await saving
      if (result.ok) setSaved(result.data)
      return result
    },
    []
  )

  return {
    pipeline: saved ?? loaded.data,
    problem: loaded.problem,
    keep,
    reload: () => {
      setSaved(null)
      reload()
    }
  }
}

/** Settings › Pipeline stages. Admins only; flow 5 in docs/user-flows.md. */
export const PipelineStagesSection = ({
  bridge
}: {
  bridge: TSettingsBridge
}) => {
  const { pipeline, problem, keep, reload } = usePipelineSettings(bridge)

  return (
    <>
      <PageHeader
        subtitle="The steps a deal moves through. Drag to reorder."
        title="Pipeline stages"
      />
      {pipeline ? (
        <StagesEditor
          // A new revision is a new list to edit.
          key={pipeline.revision}
          pipeline={pipeline}
          onLoadLatest={reload}
          onSave={(input) => keep(bridge.saveStages(input))}
        />
      ) : (
        <SectionStatus problem={problem} onRetry={reload} />
      )}
    </>
  )
}

/** Settings › Lost reasons. Admins only. */
export const LostReasonsSection = ({ bridge }: { bridge: TSettingsBridge }) => {
  const { pipeline, problem, keep, reload } = usePipelineSettings(bridge)

  return (
    <>
      <PageHeader
        subtitle="What people choose from when they close a deal as lost."
        title="Lost reasons"
      />
      {pipeline ? (
        <LostReasonsEditor
          key={pipeline.revision}
          pipeline={pipeline}
          onLoadLatest={reload}
          onSave={(input) => keep(bridge.saveLostReasons(input))}
        />
      ) : (
        <SectionStatus problem={problem} onRetry={reload} />
      )}
    </>
  )
}
