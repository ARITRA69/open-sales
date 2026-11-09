import {
  Add01Icon,
  Alert02Icon,
  LockIcon,
  Search01Icon
} from '@hugeicons/core-free-icons'

import { useLocale } from '@/hooks/use-locale'
import type { TCssVariables } from '@/lib/css-variables'
import { cn } from '@/lib/utils'

import { Button } from './button'
import { Icon, type TIcon } from './icon'

type TPanelKind = 'first' | 'none' | 'error' | 'noaccess'

type TPanelCopy = { title: string; body: string; action: string; icon: TIcon }

const panelCopy = (
  kind: TPanelKind,
  t: ReturnType<typeof useLocale>['t']
): TPanelCopy => {
  switch (kind) {
    case 'none':
      return {
        title: t('Nothing matches'),
        body: t('Try a different word, or clear the filters.'),
        action: t('Clear filters'),
        icon: Search01Icon
      }
    case 'error':
      return {
        title: t("This didn't load"),
        body: t('Check your connection to the server, then try again.'),
        action: t('Try again'),
        icon: Alert02Icon
      }
    case 'noaccess':
      return {
        title: t("You can't see this"),
        body: t('Ask an admin on your team to give you access.'),
        action: '',
        icon: LockIcon
      }
    default:
      return {
        title: t('Nothing here yet'),
        body: t('Add the first one, or import a spreadsheet.'),
        action: t('Add the first one'),
        icon: Add01Icon
      }
  }
}

const SKELETON_WIDTHS = ['w-3/5', 'w-2/5', 'w-2/3', 'w-1/2']

/** Grey rows that stand in for content while it loads. */
export const SkeletonRows = ({
  rows = SKELETON_WIDTHS.length,
  className
}: {
  rows?: number
  className?: string
}) => {
  const { t } = useLocale()

  return (
    <div
      aria-label={t('Loading')}
      className={cn('flex flex-col gap-1.5', className)}
      data-slot="skeleton"
      role="status"
    >
      {Array.from({ length: rows }, (_, index) => {
        const order: TCssVariables = { '--skeleton-index': index }

        return (
          <div
            key={index}
            className="kit-skeleton flex h-11 items-center gap-2.5 rounded-row bg-muted px-3"
            style={order}
          >
            <span className="size-6 flex-none rounded-full bg-input" />
            <span
              className={cn(
                'h-2 rounded-full bg-input',
                SKELETON_WIDTHS[index % SKELETON_WIDTHS.length]
              )}
            />
          </div>
        )
      })}
    </div>
  )
}

type TStatePanelProps = {
  kind?: TPanelKind | 'loading'
  title?: string
  body?: string
  // An empty string hides the button.
  action?: string
  icon?: TIcon
  onAction?: () => void
  className?: string
}

/** What a page shows in place of content: first use, no results, an error, no access or loading. */
export const StatePanel = ({
  kind = 'first',
  title,
  body,
  action,
  icon,
  onAction,
  className
}: TStatePanelProps) => {
  const { t } = useLocale()

  if (kind === 'loading') return <SkeletonRows className={className} />

  const copy = panelCopy(kind, t)
  const actionLabel = action ?? copy.action

  return (
    <section
      className={cn(
        'flex flex-col items-center gap-3 rounded-dialog bg-muted px-6 py-8 text-center text-foreground',
        className
      )}
      data-kind={kind}
      data-slot="state-panel"
      role={kind === 'error' ? 'alert' : 'status'}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-10 items-center justify-center rounded-panel bg-background shadow-(--shadow-tile)',
          kind === 'error' ? 'text-destructive' : 'text-foreground-soft'
        )}
      >
        <Icon icon={icon ?? copy.icon} size={18} strokeWidth={1.6} />
      </span>
      <div className="flex max-w-95 flex-col gap-1">
        <h2 className="m-0 text-base font-semibold">{title ?? copy.title}</h2>
        <p className="m-0 text-body-lg text-muted-foreground">
          {body ?? copy.body}
        </p>
      </div>
      <Button hidden={!actionLabel} size="lg" onClick={onAction}>
        {actionLabel}
      </Button>
    </section>
  )
}
