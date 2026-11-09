import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  PanelLeftIcon
} from '@hugeicons/core-free-icons'

import { Button } from '@/components/ui/button'
import { Icon, type TIcon } from '@/components/ui/icon'
import { useHistoryButtons } from '@/hooks/use-history-buttons'
import { cn } from '@/lib/utils'

type TWindowButtonProps = {
  icon: TIcon
  label: string
  disabled?: boolean
  onClick: () => void
}

const WindowButton = ({
  icon,
  label,
  disabled,
  onClick
}: TWindowButtonProps) => (
  <Button
    aria-label={label}
    disabled={disabled}
    lead={<Icon icon={icon} size={18} strokeWidth={1.6} />}
    size="sm"
    title={label}
    variant="ghost"
    onClick={onClick}
  />
)

type TWindowControlsProps = {
  isSidebarOpen: boolean
  onToggleSidebar: () => void
  className?: string
}

/** Beside the traffic lights, in the same place with the sidebar open or closed. */
export const WindowControls = ({
  isSidebarOpen,
  onToggleSidebar,
  className
}: TWindowControlsProps) => {
  const { canGoBack, canGoForward } = useHistoryButtons()

  return (
    <div className={cn('sales-no-drag flex items-center', className)}>
      <WindowButton
        icon={PanelLeftIcon}
        label={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        onClick={onToggleSidebar}
      />
      <WindowButton
        disabled={!canGoBack}
        icon={ArrowLeft01Icon}
        label="Back"
        onClick={() => window.history.back()}
      />
      <WindowButton
        disabled={!canGoForward}
        icon={ArrowRight01Icon}
        label="Forward"
        onClick={() => window.history.forward()}
      />
    </div>
  )
}
