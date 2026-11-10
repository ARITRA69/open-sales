import { getBrowserBridge } from './browser-bridge'
import { useBrowserState } from './use-browser'

/**
 * What the sidebar's Browser item shows beside its name: how many things are
 * waiting on the person (AI asking to use a site, a download it set off, AI
 * wanting to carry on after Stop), or a dot while AI is working in a tab.
 * Nothing otherwise. It reads the browser itself, so the sidebar needn't be
 * told.
 */
export const BrowserNavStatus = () => {
  const state = useBrowserState(getBrowserBridge())
  if (!state) return null

  const waiting =
    state.questions.length +
    state.heldDownloads.length +
    (state.pausedAiName ? 1 : 0)

  if (waiting > 0) {
    return (
      <span
        aria-label={`${waiting} waiting on you`}
        className="ml-auto flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-accent px-1 text-xs font-bold text-accent-foreground"
      >
        {waiting}
      </span>
    )
  }
  if (state.tabs.some((tab) => tab.isAiWorking)) {
    return (
      <span
        aria-label="AI is working in the browser"
        className="sales-browser-pulse ml-auto size-2 flex-none rounded-full bg-accent"
        role="img"
      />
    )
  }
  return null
}
