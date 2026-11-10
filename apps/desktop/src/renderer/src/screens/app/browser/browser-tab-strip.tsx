import {
  Add01Icon,
  Cancel01Icon,
  Globe02Icon,
  Plug01Icon
} from '@hugeicons/core-free-icons'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'

import type { TBrowserTab } from '../../../../../preload/bridge-types'

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** What a tab is called: its page's title, else its site, else "New tab". */
export const tabLabel = (tab: TBrowserTab) =>
  tab.title.trim() || (tab.url ? hostOf(tab.url) : 'New tab')

type TBrowserTabStripProps = {
  tabs: TBrowserTab[]
  activeTabId: string | null
  onSelect: (tabId: string) => void
  onClose: (tabId: string) => void
  onNewTab: () => void
}

/** The row of tabs. One AI is using says so. */
export const BrowserTabStrip = ({
  tabs,
  activeTabId,
  onSelect,
  onClose,
  onNewTab
}: TBrowserTabStripProps) => (
  <div className="flex h-10 flex-none items-center gap-2 border-b border-border bg-muted px-3">
    <div
      aria-label="Tabs"
      className="flex min-w-0 flex-1 items-center gap-1"
      role="tablist"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId
        const label = tabLabel(tab)

        return (
          <div
            key={tab.id}
            className={cn(
              'group flex h-7 max-w-52 min-w-0 flex-1 items-center rounded-panel text-body-sm transition-all duration-200',
              isActive
                ? 'bg-background font-semibold text-foreground shadow-(--shadow-tile)'
                : 'font-medium text-muted-foreground hover:bg-secondary hover:text-foreground'
            )}
            data-ai={tab.control === 'ai' || undefined}
          >
            <button
              aria-selected={isActive}
              className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-panel pr-1 pl-2 text-left outline-none keyboard-focus:shadow-(--halo-keyboard)"
              role="tab"
              title={label}
              type="button"
              onClick={() => onSelect(tab.id)}
            >
              {tab.favicon ? (
                <img alt="" className="size-3.5 flex-none" src={tab.favicon} />
              ) : (
                <span className="flex flex-none text-faint">
                  <Icon icon={Globe02Icon} size={14} />
                </span>
              )}
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {tab.control === 'ai' ? (
                <span
                  className="flex h-4 flex-none items-center gap-1 rounded-full bg-accent px-1.5 text-xs font-bold text-accent-foreground"
                  title={`${tab.aiName ?? 'AI'} ${tab.isAiWorking ? 'is working in' : 'can use'} this tab`}
                >
                  {tab.isAiWorking ? (
                    <span
                      aria-hidden
                      className="sales-browser-pulse size-1.5 rounded-full bg-accent-foreground"
                    />
                  ) : null}
                  AI
                </span>
              ) : null}
            </button>
            <button
              aria-label={`Close ${label}`}
              className={cn(
                'mr-1 flex size-5 flex-none items-center justify-center rounded-sm text-muted-foreground transition-all duration-150 outline-none hover:bg-secondary-hover hover:text-foreground keyboard-focus:opacity-100 keyboard-focus:shadow-(--halo-keyboard)',
                isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              )}
              title="Close tab"
              type="button"
              onClick={() => onClose(tab.id)}
            >
              <Icon icon={Cancel01Icon} size={12} />
            </button>
          </div>
        )
      })}
      <Button
        aria-label="New tab"
        leadIcon={Add01Icon}
        size="sm"
        title="New tab"
        variant="ghost"
        onClick={onNewTab}
      />
    </div>
    <Button href="#/mcp" leadIcon={Plug01Icon} size="sm" variant="ghost">
      Connect AI
    </Button>
  </div>
)
