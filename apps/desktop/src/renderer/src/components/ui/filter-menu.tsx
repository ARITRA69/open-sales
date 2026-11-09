import { AnimatePresence, motion } from 'motion/react'

import { useLocale } from '@/hooks/use-locale'

import { AnimatedLabel } from './animated-label'
import { Button } from './button'
import { Field } from './field'
import { Menu } from './menu'
import { PickPillTrigger } from './pick-pill'

export type TFilterOption = { label: string; count?: number }

export type TFilter = { key: string; name: string; options: TFilterOption[] }

type TFilterMenuProps = {
  name: string
  options: TFilterOption[]
  // Labels of the options that are on.
  picked: string[]
  onPickedChange: (picked: string[]) => void
}

/** A filter button with a checklist. It turns dark and names the choice once on. */
export const FilterMenu = ({
  name,
  options,
  picked,
  onPickedChange
}: TFilterMenuProps) => {
  const { t } = useLocale()

  const isOn = picked.length > 0
  const summary = picked.length === 1 ? picked[0] : String(picked.length)

  const toggle = (label: string) =>
    onPickedChange(
      picked.includes(label)
        ? picked.filter((pickedLabel) => pickedLabel !== label)
        : [...picked, label]
    )

  return (
    <Menu
      items={options.map((option) => ({
        label: option.label,
        checked: picked.includes(option.label),
        hint: option.count === undefined ? undefined : String(option.count),
        onSelect: () => toggle(option.label)
      }))}
      label={name}
      trigger={
        <PickPillTrigger size="lg" tone={isOn ? 'primary' : 'secondary'}>
          {isOn ? t('{name}: {value}', { name, value: summary }) : name}
        </PickPillTrigger>
      }
    />
  )
}

type TFilterToolbarProps = {
  // Names the toolbar to assistive tech.
  label: string
  searchPlaceholder: string
  query: string
  onQueryChange: (query: string) => void
  filters: TFilter[]
  // Labels that are on, by filter key.
  picked: Record<string, string[]>
  onPickedChange: (filterKey: string, picked: string[]) => void
  onClear: () => void
  // How much is showing, like "2 of 4 accounts".
  countLabel?: string
}

/** Search, filter buttons, a way to clear them, and a count, above a list. */
export const FilterToolbar = ({
  label,
  searchPlaceholder,
  query,
  onQueryChange,
  filters,
  picked,
  onPickedChange,
  onClear,
  countLabel
}: TFilterToolbarProps) => {
  const { t } = useLocale()

  const isFiltered =
    query.trim() !== '' ||
    filters.some((filter) => (picked[filter.key] ?? []).length > 0)

  return (
    <div
      aria-label={label}
      className="flex flex-wrap items-center gap-2"
      data-slot="filter-toolbar"
      role="toolbar"
    >
      <Field
        className="w-64 flex-none"
        kind="search"
        placeholder={searchPlaceholder}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      {filters.map((filter) => (
        <FilterMenu
          key={filter.key}
          name={filter.name}
          options={filter.options}
          picked={picked[filter.key] ?? []}
          onPickedChange={(next) => onPickedChange(filter.key, next)}
        />
      ))}
      <AnimatePresence initial={false}>
        {isFiltered ? (
          <motion.span
            key="clear"
            animate={{ opacity: 1, width: 'auto' }}
            className="-my-1 inline-flex flex-none overflow-hidden py-1"
            exit={{ opacity: 0, width: 0 }}
            initial={{ opacity: 0, width: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
          >
            <Button
              className="mx-1.5"
              size="lg"
              variant="link"
              onClick={onClear}
            >
              {t('Clear filters')}
            </Button>
          </motion.span>
        ) : null}
      </AnimatePresence>
      {countLabel ? (
        <span className="ml-auto inline-flex text-body-sm font-medium whitespace-nowrap text-muted-foreground">
          <AnimatedLabel>{countLabel}</AnimatedLabel>
        </span>
      ) : null}
    </div>
  )
}
