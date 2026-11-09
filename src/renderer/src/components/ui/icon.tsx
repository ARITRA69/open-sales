import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'

export type TIcon = IconSvgElement

type TIconProps = {
  icon: TIcon
  size?: number
  strokeWidth?: number
  className?: string
}

/**
 * A decorative icon. Smaller sizes get a slightly heavier stroke so every size
 * looks the same weight on screen. Pair it with words: icons never stand alone
 * as the only label a person sees.
 */
export const Icon = ({
  icon,
  size = 16,
  strokeWidth,
  className
}: TIconProps) => (
  <HugeiconsIcon
    aria-hidden
    className={className}
    icon={icon}
    size={size}
    strokeWidth={strokeWidth ?? (size < 16 ? 2 : 1.75)}
  />
)
