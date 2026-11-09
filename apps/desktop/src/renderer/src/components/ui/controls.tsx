import type { ComponentProps, ReactNode } from 'react'

import {
  Checkbox as CheckboxPrimitive,
  RadioGroup as RadioGroupPrimitive,
  Switch as SwitchPrimitive
} from 'radix-ui'

import { cn } from '@/lib/utils'

const FOCUS = 'outline-none keyboard-focus:shadow-(--halo-keyboard)'
const DISABLED = 'disabled:cursor-not-allowed disabled:opacity-50'

// The fill stays mounted so it can fade and grow both ways.
const MARK =
  'absolute inset-0 flex items-center justify-center rounded-[inherit] bg-primary text-primary-foreground transition-[opacity,scale] duration-200 ease-(--ease-out-soft) data-[state=unchecked]:scale-75 data-[state=unchecked]:opacity-0'

export const Checkbox = ({
  className,
  checked,
  ...checkboxProps
}: ComponentProps<typeof CheckboxPrimitive.Root>) => (
  <CheckboxPrimitive.Root
    {...checkboxProps}
    checked={checked}
    className={cn(
      'relative inline-flex size-4 flex-none rounded-sm bg-background shadow-(--shadow-outline)',
      FOCUS,
      DISABLED,
      className
    )}
    data-slot="checkbox"
  >
    <CheckboxPrimitive.Indicator forceMount className={MARK}>
      <svg
        aria-hidden
        className="kit-tick"
        fill="none"
        height="14"
        viewBox="0 0 20 20"
        width="14"
      >
        <path
          d={
            checked === 'indeterminate'
              ? 'M5.5 10h9'
              : 'M4.5 10.5l3.5 3.5 7.5-8'
          }
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.6"
        />
      </svg>
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
)

export const RadioGroup = ({
  className,
  ...groupProps
}: ComponentProps<typeof RadioGroupPrimitive.Root>) => (
  <RadioGroupPrimitive.Root
    {...groupProps}
    className={cn('flex flex-col gap-2', className)}
    data-slot="radio-group"
  />
)

export const Radio = ({
  className,
  ...radioProps
}: ComponentProps<typeof RadioGroupPrimitive.Item>) => (
  <RadioGroupPrimitive.Item
    {...radioProps}
    className={cn(
      'relative inline-flex size-4 flex-none rounded-full bg-background shadow-(--shadow-outline)',
      FOCUS,
      DISABLED,
      className
    )}
    data-slot="radio"
  >
    <RadioGroupPrimitive.Indicator forceMount className={MARK}>
      <span className="size-1.5 rounded-full bg-primary-foreground" />
    </RadioGroupPrimitive.Indicator>
  </RadioGroupPrimitive.Item>
)

type TSwitchProps = ComponentProps<typeof SwitchPrimitive.Root> & {
  // `sm` fits inside a table row.
  size?: 'md' | 'sm'
}

export const Switch = ({
  size = 'md',
  className,
  ...switchProps
}: TSwitchProps) => (
  <SwitchPrimitive.Root
    {...switchProps}
    className={cn(
      'group/switch inline-flex flex-none items-center rounded-full bg-input p-0.5 transition-colors duration-200 data-[state=checked]:bg-primary',
      size === 'sm' ? 'h-4.5 w-7.5' : 'h-5 w-8.5',
      FOCUS,
      DISABLED,
      className
    )}
    data-slot="switch"
  >
    <SwitchPrimitive.Thumb
      className={cn(
        'block rounded-full bg-background shadow-(--shadow-knob) transition-transform duration-200 ease-(--ease-out-soft)',
        size === 'sm'
          ? 'size-3.5 data-[state=checked]:translate-x-3'
          : 'size-4 data-[state=checked]:translate-x-3.5'
      )}
    />
  </SwitchPrimitive.Root>
)

type TChipProps = {
  active?: boolean
  count?: number
  children: ReactNode
} & Omit<ComponentProps<'button'>, 'children'>

/** A filter or choice that is on or off. It turns dark when on. */
export const Chip = ({
  active = false,
  count,
  children,
  className,
  type = 'button',
  ...buttonProps
}: TChipProps) => (
  <button
    {...buttonProps}
    aria-pressed={active}
    className={cn(
      'inline-flex h-7 flex-none items-center gap-1.5 rounded-full px-3 text-sm font-semibold whitespace-nowrap transition-colors duration-200',
      active
        ? 'bg-primary text-primary-foreground hover:bg-primary-hover'
        : 'bg-secondary text-secondary-foreground hover:bg-secondary-hover',
      FOCUS,
      DISABLED,
      className
    )}
    data-slot="chip"
    type={type}
  >
    {children}
    {count === undefined ? null : (
      <span
        className={cn(
          'text-body-sm font-medium tabular-nums transition-colors duration-200',
          active ? 'text-on-primary-soft' : 'text-muted-foreground'
        )}
      >
        {count}
      </span>
    )}
  </button>
)
