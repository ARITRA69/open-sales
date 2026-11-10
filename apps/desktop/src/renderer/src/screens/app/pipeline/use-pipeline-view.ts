import { useEffect, useState } from 'react'

const PIPELINE_VIEW_KEY = 'open-sales-pipeline-view'

export const PIPELINE_VIEWS = ['board', 'list'] as const

export type TPipelineView = (typeof PIPELINE_VIEWS)[number]

const readView = (): TPipelineView => {
  try {
    return localStorage.getItem(PIPELINE_VIEW_KEY) === 'list' ? 'list' : 'board'
  } catch {
    return 'board'
  }
}

/** Board or list. It stays as left, on this computer. */
export const usePipelineView = () => {
  const [view, setView] = useState(readView)

  useEffect(() => {
    try {
      localStorage.setItem(PIPELINE_VIEW_KEY, view)
    } catch {
      // Note: without storage the choice just lasts until the window closes.
    }
  }, [view])

  return [view, setView] as const
}
