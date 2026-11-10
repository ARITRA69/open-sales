import type { ComponentProps } from 'react'

import { ArrowDown02Icon } from '@hugeicons/core-free-icons'
import {
  MessageScroller as MessageScrollerPrimitive,
  useMessageScroller,
  useMessageScrollerScrollable,
  useMessageScrollerVisibility
} from '@shadcn/react/message-scroller'

import { useLocale } from '@/hooks/use-locale'
import { cn } from '@/lib/utils'

import { Button } from './button'

/**
 * The scrolling thread from shadcn's AI Elements. A new question settles near
 * the top and the reply grows below it; with `autoScroll` the view follows
 * the reply while the person stays at the newest line.
 */
export const MessageScrollerProvider = (
  props: ComponentProps<typeof MessageScrollerPrimitive.Provider>
) => <MessageScrollerPrimitive.Provider {...props} />

export const MessageScroller = ({
  className,
  ...rootProps
}: ComponentProps<typeof MessageScrollerPrimitive.Root>) => (
  <MessageScrollerPrimitive.Root
    {...rootProps}
    className={cn(
      'group/message-scroller relative flex size-full min-h-0 flex-col overflow-hidden',
      className
    )}
    data-slot="message-scroller"
  />
)

export const MessageScrollerViewport = ({
  className,
  ...viewportProps
}: ComponentProps<typeof MessageScrollerPrimitive.Viewport>) => (
  <MessageScrollerPrimitive.Viewport
    {...viewportProps}
    className={cn(
      'size-full min-h-0 min-w-0 scrollbar-thin overflow-y-auto overscroll-contain outline-none data-pending-scroll:invisible',
      className
    )}
    data-slot="message-scroller-viewport"
  />
)

export const MessageScrollerContent = ({
  className,
  ...contentProps
}: ComponentProps<typeof MessageScrollerPrimitive.Content>) => (
  <MessageScrollerPrimitive.Content
    {...contentProps}
    className={cn(
      'box-border flex h-max min-h-full flex-col gap-3 px-4 py-3',
      className
    )}
    data-slot="message-scroller-content"
  />
)

/** One turn. Give the person's turn `scrollAnchor`, so it settles at the top. */
export const MessageScrollerItem = ({
  className,
  scrollAnchor = false,
  ...itemProps
}: ComponentProps<typeof MessageScrollerPrimitive.Item>) => (
  <MessageScrollerPrimitive.Item
    {...itemProps}
    className={cn('min-w-0 shrink-0', className)}
    data-slot="message-scroller-item"
    scrollAnchor={scrollAnchor}
  />
)

type TMessageScrollerButtonProps = Omit<
  ComponentProps<typeof MessageScrollerPrimitive.Button>,
  'children' | 'render'
>

/** Appears when there's more thread out of view, and jumps to it. */
export const MessageScrollerButton = ({
  direction = 'end',
  className,
  ...buttonProps
}: TMessageScrollerButtonProps) => {
  const { t } = useLocale()

  return (
    <MessageScrollerPrimitive.Button
      {...buttonProps}
      className={cn(
        'absolute left-1/2 -translate-x-1/2 transition-[translate,opacity,box-shadow] duration-200 ease-(--ease-out-soft)',
        'data-[active=false]:pointer-events-none data-[active=false]:opacity-0',
        'data-[direction=end]:bottom-3 data-[direction=end]:data-[active=false]:translate-y-2',
        'data-[direction=start]:top-3 data-[direction=start]:data-[active=false]:-translate-y-2 data-[direction=start]:[&_svg]:rotate-180',
        className
      )}
      data-direction={direction}
      data-slot="message-scroller-button"
      direction={direction}
      render={({ children: _children, ...renderProps }) => (
        <Button
          {...renderProps}
          aria-label={
            direction === 'end'
              ? t('Scroll to the latest')
              : t('Scroll to the start')
          }
          leadIcon={ArrowDown02Icon}
          size="sm"
          variant="white"
        />
      )}
    />
  )
}

export {
  useMessageScroller,
  useMessageScrollerScrollable,
  useMessageScrollerVisibility
}
