import { ArrowDown01Icon } from '@hugeicons/core-free-icons'

import { useLocale } from '@/hooks/use-locale'
import { cn } from '@/lib/utils'

import { Button, type TButtonProps } from './button'
import { Icon } from './icon'
import { Menu } from './menu'

// 28 in a table row, 32 in a list row, 36 in a toolbar.
const PILL_SIZE = { sm: 'sm', md: 'md', lg: 'lg' } as const

type TPickPillSize = keyof typeof PILL_SIZE

// `white` is for a pill sitting on a grey tile, like a selected table row.
type TPickPillTone = 'secondary' | 'white' | 'primary'

type TPickPillTriggerProps = {
  size?: TPickPillSize
  tone?: TPickPillTone
} & Omit<TButtonProps, 'size' | 'variant' | 'trail' | 'trailIcon'>

/** The pill on its own, for opening a menu of your own. */
export const PickPillTrigger = ({
  size = 'sm',
  tone = 'secondary',
  className,
  ...buttonProps
}: TPickPillTriggerProps) => (
  <Button
    {...buttonProps}
    className={cn('max-w-full pr-2.5 pl-3', className)}
    size={PILL_SIZE[size]}
    trail={
      <Icon
        className="flex-none opacity-70 transition-transform duration-200 in-aria-expanded:rotate-180"
        icon={ArrowDown01Icon}
        size={12}
        strokeWidth={2.2}
      />
    }
    variant={
      tone === 'primary' ? 'primary' : tone === 'white' ? 'white' : 'secondary'
    }
  />
)

export type TPickPillOption = { label: string; value: string } | string

const toOption = (option: TPickPillOption) =>
  typeof option === 'string' ? { label: option, value: option } : option

type TPickPillProps = {
  value: string
  options: TPickPillOption[]
  onChange?: (value: string) => void
  // What is being picked, like "Owner of Lumen Retail". Screen readers hear it
  // with the current value.
  label: string
  size?: TPickPillSize
  tone?: TPickPillTone
  align?: 'start' | 'center' | 'end'
  className?: string
}

/** Shows the current choice as a pill; clicking it lists the others. */
export const PickPill = ({
  value,
  options,
  onChange,
  label,
  size,
  tone,
  align,
  className
}: TPickPillProps) => {
  const { t } = useLocale()

  const pickOptions = options.map(toOption)
  const shown =
    pickOptions.find((option) => option.value === value)?.label ?? value

  return (
    <span className={cn('inline-flex max-w-full min-w-0', className)}>
      <Menu
        align={align}
        items={pickOptions.map((option) => ({
          label: option.label,
          selected: option.value === value,
          onSelect: () => onChange?.(option.value)
        }))}
        label={label}
        trigger={
          <PickPillTrigger
            aria-label={t('{name}: {value}', { name: label, value: shown })}
            size={size}
            tone={tone}
          >
            {shown}
          </PickPillTrigger>
        }
      />
    </span>
  )
}
