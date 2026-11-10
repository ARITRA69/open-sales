import { useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Banner } from '@/components/ui/kit'

import type { TApiResult } from '../../../../../preload/bridge-types'

/** A titled group of rows on a grey card, like "Your account". */
export const SettingsSection = ({
  title,
  intro,
  action,
  children
}: {
  title: string
  intro?: string
  action?: ReactNode
  children: ReactNode
}) => (
  <section className="flex flex-col gap-2">
    <div className="flex min-h-7 items-center gap-2">
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="m-0 text-sm font-semibold">{title}</h2>
        {intro ? (
          <p className="m-0 text-body-sm text-muted-foreground">{intro}</p>
        ) : null}
      </div>
      {action}
    </div>
    <dl className="m-0 flex flex-col rounded-card bg-muted px-3">{children}</dl>
  </section>
)

export const SETTINGS_ROW_CLASS =
  'flex min-h-9 items-start gap-4 border-b border-border py-2 text-sm last:border-b-0'

export const SettingsRow = ({
  label,
  value
}: {
  label: string
  value: string
}) => (
  <div className={SETTINGS_ROW_CLASS}>
    <dt className="w-32 flex-none text-muted-foreground">{label}</dt>
    <dd className="m-0 min-w-0 truncate">{value}</dd>
  </div>
)

/** Something that went wrong, in the server's own words. */
export const Problem = ({ children }: { children: ReactNode }) => (
  <p className="m-0 text-sm text-destructive" role="alert">
    {children}
  </p>
)

/** Shown while a section's settings load, or when they can't. */
export const SectionStatus = ({
  problem,
  onRetry
}: {
  problem: string | null
  onRetry?: () => void
}) =>
  problem ? (
    <Banner>
      <span className="min-w-0 flex-1">{problem}</span>
      {onRetry ? (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </Banner>
  ) : (
    <p className="m-0 text-sm text-muted-foreground">Loading…</p>
  )

/**
 * Runs a save and remembers how it went. `isStale` means someone else saved
 * first (the server's `changed_since`): the latest has to be loaded before
 * trying again.
 */
export const useSave = <TInput, TData>(
  save: (input: TInput) => Promise<TApiResult<TData>>
) => {
  const [isSaving, setIsSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [isStale, setIsStale] = useState(false)

  return {
    isSaving,
    problem,
    isStale,
    // For problems found before anything is sent.
    setProblem,
    run: async (input: TInput) => {
      setIsSaving(true)
      const result = await save(input)
      setIsSaving(false)
      setProblem(result.ok ? null : result.message)
      setIsStale(!result.ok && result.code === 'changed_since')
      return result
    }
  }
}

type TSaveBarProps = {
  isDirty: boolean
  isSaving: boolean
  problem: string | null
  // Someone else saved first: offer the latest in place of Save.
  isStale?: boolean
  onDiscard: () => void
  onLoadLatest?: () => void
}

/**
 * Save and Discard for a list edited as a whole, kept in view at the bottom
 * of the page. The Save button submits the form it sits in. (`-bottom-8`
 * takes it down over the page's own bottom padding, so nothing shows under.)
 */
export const SaveBar = ({
  isDirty,
  isSaving,
  problem,
  isStale = false,
  onDiscard,
  onLoadLatest
}: TSaveBarProps) => (
  <div className="sticky -bottom-8 flex flex-col gap-2 bg-background pt-3 pb-5">
    {problem ? <Problem>{problem}</Problem> : null}
    <div className="flex items-center gap-2">
      {isStale && onLoadLatest ? (
        <Button onClick={onLoadLatest}>Load the latest</Button>
      ) : (
        <Button disabled={!isDirty} loading={isSaving} type="submit">
          Save
        </Button>
      )}
      <Button
        disabled={!isDirty || isSaving}
        variant="ghost"
        onClick={onDiscard}
      >
        Discard changes
      </Button>
      <span className="text-body-sm text-muted-foreground">
        {isDirty ? 'You have unsaved changes.' : 'Everything is saved.'}
      </span>
    </div>
  </div>
)
