import { Fragment, type ReactNode } from 'react'

import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'

import { Link } from '@/components/shared/link'
import { useLocale } from '@/hooks/use-locale'
import { cn } from '@/lib/utils'

import { Icon } from './icon'

export type THeaderLink = { label: string; href: string }
export type THeaderTab = THeaderLink & { active?: boolean }

const QUIET_LINK =
  'rounded-sm whitespace-nowrap text-muted-foreground no-underline outline-none transition-colors duration-150 hover:text-foreground keyboard-focus:shadow-(--halo-keyboard)'

type TPageHeaderProps = {
  title: string
  subtitle?: string
  // One level down: a back link above the title.
  backLink?: THeaderLink
  // Two or more levels down: a breadcrumb. The last link is this page.
  crumbs?: THeaderLink[]
  // A search box or search pill, left of the actions.
  search?: ReactNode
  // 40-tall buttons, with the main action last.
  actions?: ReactNode
  // Links to the sections of this page.
  tabs?: THeaderTab[]
  className?: string
}

/** The top of a list or section page: where you are, and what you can do. */
export const PageHeader = ({
  title,
  subtitle,
  backLink,
  crumbs = [],
  search,
  actions,
  tabs = [],
  className
}: TPageHeaderProps) => {
  const { t } = useLocale()

  return (
    <header
      className={cn('flex w-full flex-col gap-4 text-foreground', className)}
      data-slot="page-header"
    >
      {crumbs.length > 0 ? (
        <nav aria-label={t('Breadcrumb')}>
          <ol className="m-0 flex list-none items-center gap-1.5 p-0 text-sm font-medium">
            {crumbs.map((crumb, index) => {
              const isCurrent = index === crumbs.length - 1

              return (
                <Fragment key={crumb.href}>
                  {index > 0 ? (
                    <Icon
                      className="flex-none text-faint"
                      icon={ArrowRight01Icon}
                      size={14}
                    />
                  ) : null}
                  <li className="flex">
                    <Link
                      aria-current={isCurrent ? 'page' : undefined}
                      className={cn(QUIET_LINK, isCurrent && 'text-foreground')}
                      href={crumb.href}
                    >
                      {crumb.label}
                    </Link>
                  </li>
                </Fragment>
              )
            })}
          </ol>
        </nav>
      ) : null}
      {backLink ? (
        <Link
          className={cn(
            QUIET_LINK,
            '-mb-1 inline-flex items-center gap-1 self-start text-sm font-medium'
          )}
          href={backLink.href}
        >
          <Icon icon={ArrowLeft01Icon} size={14} />
          {backLink.label}
        </Link>
      ) : null}
      <div className="flex min-h-10 items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="m-0 truncate text-title-xl font-bold">{title}</h1>
          {subtitle ? (
            <p className="m-0 text-body-lg text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {search}
        {actions}
      </div>
      {tabs.length > 0 ? (
        <nav
          aria-label={t('Sections')}
          className="flex gap-6 shadow-[inset_0_-1px_0_var(--border)]"
        >
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              aria-current={tab.active ? 'page' : undefined}
              className={cn(
                'relative pb-3 text-body-lg whitespace-nowrap no-underline transition-colors duration-150 outline-none',
                'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors after:duration-200',
                'keyboard-focus:shadow-(--halo-keyboard)',
                tab.active
                  ? 'font-semibold text-foreground after:bg-foreground'
                  : 'font-medium text-muted-foreground after:bg-transparent hover:text-foreground hover:after:bg-input'
              )}
              href={tab.href}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  )
}
