import type { ReactNode } from 'react'

import { Download01Icon, StopIcon } from '@hugeicons/core-free-icons'
import { AnimatePresence, motion } from 'motion/react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type {
  TBrowserAnswer,
  TBrowserState,
  TBrowserTab
} from '../../../../../preload/bridge-types'

const STRIP_MOTION = {
  initial: { height: 0, opacity: 0 },
  animate: { height: 'auto', opacity: 1 },
  exit: { height: 0, opacity: 0 },
  transition: { duration: 0.2, ease: [0.22, 0.8, 0.24, 1] as const }
}

type TStripProps = {
  // `accent` for what needs the person, or what AI is doing.
  tone?: 'accent' | 'muted'
  actions?: ReactNode
  children: ReactNode
}

/** One line across the top of the page, with its buttons on the right. */
const Strip = ({ tone = 'accent', actions, children }: TStripProps) => (
  <motion.div {...STRIP_MOTION} className="flex-none overflow-hidden">
    <div
      className={cn(
        'flex min-h-10 items-center gap-3 border-b border-border px-4 py-1.5 text-sm',
        tone === 'accent' ? 'bg-accent-soft' : 'bg-muted'
      )}
    >
      <p className="m-0 min-w-0 flex-1">{children}</p>
      {actions ? (
        <div className="flex flex-none items-center gap-1.5">{actions}</div>
      ) : null}
    </div>
  </motion.div>
)

type TBrowserStripsProps = {
  state: TBrowserState
  activeTab: TBrowserTab | null
  onStop: (tabId: string) => void
  onAnswer: (questionId: string, answer: TBrowserAnswer) => void
  onResume: () => void
  onDownload: (downloadId: string, action: 'download' | 'dismiss') => void
  onShowTab: (tabId: string) => void
}

/**
 * What the person needs to know or decide about AI in the browser: that it's
 * using this tab (with Stop), that it wants to use a site, that it's been
 * stopped, or that a download it set off is waiting. They sit above the page
 * rather than over it, so the page never hides them.
 */
export const BrowserStrips = ({
  state,
  activeTab,
  onStop,
  onAnswer,
  onResume,
  onDownload,
  onShowTab
}: TBrowserStripsProps) => {
  const isAiTab = activeTab?.control === 'ai'
  const aiName = activeTab?.aiName ?? 'AI'

  return (
    <div aria-live="polite" className="flex flex-none flex-col">
      <AnimatePresence initial={false}>
        {state.isAiPaused ? (
          <Strip
            key="paused"
            actions={
              <Button size="sm" variant="secondary" onClick={onResume}>
                Let AI carry on
              </Button>
            }
          >
            {state.pausedAiName ? (
              <>
                <strong className="font-semibold">{state.pausedAiName}</strong>{' '}
                wants to carry on. You stopped it, so it’s doing nothing.
              </>
            ) : (
              <>
                <strong className="font-semibold">You stopped AI.</strong> It
                does nothing in the browser until you let it carry on.
              </>
            )}
          </Strip>
        ) : null}

        {isAiTab && activeTab ? (
          <Strip
            key={`ai-${activeTab.id}`}
            actions={
              <Button
                leadIcon={StopIcon}
                size="sm"
                onClick={() => onStop(activeTab.id)}
              >
                Stop
              </Button>
            }
          >
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className={cn(
                  'size-2 flex-none rounded-full bg-accent',
                  activeTab.isAiWorking && 'sales-browser-pulse'
                )}
              />
              <span className="min-w-0 truncate">
                <strong className="font-semibold">{aiName}</strong>{' '}
                {activeTab.aiName
                  ? activeTab.isAiWorking
                    ? 'is working in this tab.'
                    : 'is using this tab.'
                  : 'can use this tab.'}{' '}
                <span className="text-muted-foreground">
                  You can watch, and use the page yourself.
                </span>
              </span>
            </span>
          </Strip>
        ) : null}

        {state.questions.map((question) => {
          const isElsewhere = question.tabId !== activeTab?.id

          return (
            <Strip
              key={question.id}
              actions={
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onAnswer(question.id, 'no')}
                  >
                    Don’t allow
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onAnswer(question.id, 'always')}
                  >
                    Always allow
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => onAnswer(question.id, 'once')}
                  >
                    Allow once
                  </Button>
                </>
              }
            >
              <strong className="font-semibold">{question.aiName}</strong> wants
              to use <strong className="font-semibold">{question.site}</strong>
              {isElsewhere ? (
                <>
                  {' '}
                  in{' '}
                  <button
                    className="rounded-sm underline decoration-faint underline-offset-4 outline-none hover:decoration-current keyboard-focus:shadow-(--halo-keyboard)"
                    type="button"
                    onClick={() => onShowTab(question.tabId)}
                  >
                    another tab
                  </button>
                </>
              ) : null}
              .{' '}
              <span className="text-muted-foreground">
                It can read pages there, and click and type as you.
              </span>
            </Strip>
          )
        })}

        {state.heldDownloads.map((held) => (
          <Strip
            key={held.id}
            actions={
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onDownload(held.id, 'dismiss')}
                >
                  Not now
                </Button>
                <Button
                  leadIcon={Download01Icon}
                  size="sm"
                  variant="secondary"
                  onClick={() => onDownload(held.id, 'download')}
                >
                  Download
                </Button>
              </>
            }
          >
            AI started a download:{' '}
            <strong className="font-semibold">{held.fileName}</strong> from{' '}
            {held.site}.{' '}
            <span className="text-muted-foreground">
              Nothing is saved unless you download it.
            </span>
          </Strip>
        ))}

        {activeTab?.note ? (
          <Strip key={`note-${activeTab.id}`} tone="muted">
            <span className="text-muted-foreground">{activeTab.note}</span>
          </Strip>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
