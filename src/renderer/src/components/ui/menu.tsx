import type { ReactNode } from 'react'

import { Tick02Icon } from '@hugeicons/core-free-icons'
import { DropdownMenu } from 'radix-ui'

import { Link } from '@/components/shared/link'
import { useLocale } from '@/hooks/use-locale'
import { cn } from '@/lib/utils'

import { Checkbox } from './controls'
import { Icon, type TIcon } from './icon'
import { POPUP_CLASS, POPUP_ITEM_CLASS } from './popup'

export type TMenuItem =
  | { line: true }
  | {
      line?: false
      label: string
      icon?: TIcon
      // Drawn where the icon goes, for anything that isn't an icon.
      lead?: ReactNode
      // A second, quieter line under the label.
      description?: string
      // Quiet text at the end, like a shortcut or a count.
      hint?: string
      danger?: boolean
      disabled?: boolean
      href?: string
      onSelect?: () => void
      // One choice among several: the chosen one gets a tick.
      selected?: boolean
      // An on/off item with a checkbox. Picking it keeps the menu open.
      checked?: boolean
    }

type TMenuProps = {
  // What opens the menu, usually a Button. It must accept a ref and props.
  trigger: ReactNode
  items: TMenuItem[]
  // Anything above the items, like who is signed in.
  header?: ReactNode
  // Names the menu to assistive tech.
  label?: string
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'right' | 'bottom' | 'left'
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  // Runs once the menu has closed. Prevent the event to keep focus from going
  // back to the trigger, for an item that opens something else.
  onCloseAutoFocus?: (event: Event) => void
}

/** A list of actions or choices that opens from a button and fits its content. */
export const Menu = ({
  trigger,
  items,
  header,
  label,
  align = 'start',
  side = 'bottom',
  open,
  defaultOpen,
  onOpenChange,
  onCloseAutoFocus
}: TMenuProps) => {
  const { t } = useLocale()

  return (
    <DropdownMenu.Root
      defaultOpen={defaultOpen}
      modal={false}
      open={open}
      onOpenChange={onOpenChange}
    >
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          aria-label={label ?? t('Actions')}
          className={cn(
            POPUP_CLASS,
            'max-w-80 origin-(--radix-dropdown-menu-content-transform-origin)'
          )}
          collisionPadding={12}
          data-slot="menu"
          side={side}
          sideOffset={6}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          {header}
          {items.map((item, index) => {
            if (item.line) {
              return (
                <DropdownMenu.Separator
                  key={`line-${index}`}
                  className="mx-3 my-1.5 h-px bg-border"
                />
              )
            }

            const isCheckItem = item.checked !== undefined
            const isChoiceItem = item.selected !== undefined
            const itemClass = cn(
              POPUP_ITEM_CLASS,
              item.description && 'py-2',
              item.danger && 'text-destructive',
              item.selected && 'bg-muted font-semibold'
            )

            const body = (
              <>
                {isCheckItem ? (
                  <Checkbox
                    aria-hidden
                    checked={item.checked}
                    className="pointer-events-none"
                    tabIndex={-1}
                  />
                ) : null}
                {item.lead}
                {item.icon ? (
                  <Icon className="flex-none" icon={item.icon} />
                ) : null}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{item.label}</span>
                  {item.description ? (
                    <span className="truncate text-body-sm font-normal text-muted-foreground">
                      {item.description}
                    </span>
                  ) : null}
                </span>
                {item.hint ? (
                  <span className="text-body-sm font-normal text-muted-foreground tabular-nums">
                    {item.hint}
                  </span>
                ) : null}
                {isChoiceItem ? (
                  <Icon
                    className={cn(
                      'flex-none transition-opacity duration-150',
                      item.selected ? 'opacity-100' : 'opacity-0'
                    )}
                    icon={Tick02Icon}
                    size={14}
                  />
                ) : null}
              </>
            )

            if (isCheckItem) {
              return (
                <DropdownMenu.CheckboxItem
                  key={item.label}
                  checked={item.checked}
                  className={itemClass}
                  disabled={item.disabled}
                  onSelect={(event) => {
                    event.preventDefault()
                    item.onSelect?.()
                  }}
                >
                  {body}
                </DropdownMenu.CheckboxItem>
              )
            }

            return (
              <DropdownMenu.Item
                key={item.label}
                aria-checked={isChoiceItem ? item.selected : undefined}
                asChild={Boolean(item.href)}
                className={itemClass}
                disabled={item.disabled}
                role={isChoiceItem ? 'menuitemradio' : 'menuitem'}
                onSelect={() => item.onSelect?.()}
              >
                {item.href ? <Link href={item.href}>{body}</Link> : body}
              </DropdownMenu.Item>
            )
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
