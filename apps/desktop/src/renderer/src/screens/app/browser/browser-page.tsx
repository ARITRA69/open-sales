import { PageBody } from '@/components/sales/app-shell'
import { StatePanel } from '@/components/ui/state-panel'
import { useHashPath } from '@/hooks/use-hash-route'
import { cn } from '@/lib/utils'

import type {
  TBrowserBridge,
  TBrowserState
} from '../../../../../preload/bridge-types'
import { getBrowserBridge, hasLiveTabs } from './browser-bridge'
import { BrowserConnectPage } from './browser-connect-page'
import { BrowserStrips } from './browser-strips'
import { BrowserTabStrip } from './browser-tab-strip'
import { BrowserToolbar } from './browser-toolbar'
import { BrowserWebArea } from './browser-web-area'
import { useBrowserState } from './use-browser'

type TBrowserTabsProps = {
  bridge: TBrowserBridge
  state: TBrowserState
  hasLiveTabs: boolean
}

/** The tabs, the toolbar, what AI is doing, and the page. */
export const BrowserTabs = ({
  bridge,
  state,
  hasLiveTabs: isLive
}: TBrowserTabsProps) => {
  const activeTab =
    state.tabs.find((tab) => tab.id === state.activeTabId) ?? null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <BrowserTabStrip
        activeTabId={state.activeTabId}
        tabs={state.tabs}
        onClose={(tabId) => void bridge.actOnTab(tabId, 'close')}
        onNewTab={() => void bridge.openTab()}
        onSelect={(tabId) => void bridge.actOnTab(tabId, 'select')}
      />
      <BrowserToolbar
        // A tab's half-typed address doesn't follow you to another tab.
        key={activeTab?.id ?? 'none'}
        tab={activeTab}
        onAction={(action) => {
          if (activeTab) void bridge.actOnTab(activeTab.id, action)
        }}
        onNavigate={(address) => {
          if (activeTab) void bridge.navigate(activeTab.id, address)
        }}
      />
      <div aria-hidden className="h-0.5 flex-none overflow-hidden bg-border">
        <div
          className={cn(
            'h-full bg-foreground transition-opacity duration-300',
            activeTab?.isLoading
              ? 'sales-browser-loading opacity-100'
              : 'opacity-0'
          )}
        />
      </div>
      <BrowserStrips
        activeTab={activeTab}
        state={state}
        onAnswer={(questionId, answer) =>
          void bridge.answerQuestion(questionId, answer)
        }
        onDownload={(downloadId, action) =>
          void bridge.resolveDownload(downloadId, action)
        }
        onResume={() => void bridge.resumeAi()}
        onShowTab={(tabId) => void bridge.actOnTab(tabId, 'select')}
        onStop={(tabId) => void bridge.actOnTab(tabId, 'stop-ai')}
      />
      <BrowserWebArea
        bridge={bridge}
        hasLiveTabs={isLive}
        tab={activeTab}
        onNewTab={() => void bridge.openTab()}
        onReload={() => {
          if (activeTab) void bridge.actOnTab(activeTab.id, 'reload')
        }}
      />
    </div>
  )
}

/**
 * The in-app browser: `#/browser` for the tabs, `#/browser/connect` for
 * what AI may do in it. Connecting an AI tool is the app's own page, `#/mcp`.
 */
export const BrowserPage = () => {
  const bridge = getBrowserBridge()
  const [section] = useHashPath()
  const state = useBrowserState(bridge)

  if (!bridge) {
    return (
      <PageBody>
        <StatePanel
          action=""
          body="The browser runs inside the desktop app, on your own computer."
          kind="noaccess"
          title="Open the desktop app to browse"
        />
      </PageBody>
    )
  }
  if (section === 'connect') return <BrowserConnectPage bridge={bridge} />
  // The first answer takes a moment; an empty page beats a flash of one.
  if (!state) return null

  return (
    <BrowserTabs bridge={bridge} hasLiveTabs={hasLiveTabs()} state={state} />
  )
}
