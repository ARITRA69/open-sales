import type { ReactNode } from 'react'

import { useSidebarOpen } from '@/hooks/use-sidebar-open'
import { cn } from '@/lib/utils'

import { WindowControls } from './window-controls'

type TAppShellProps = {
  // The page's name, in the bar along the top of the window.
  title: string
  sidebar: ReactNode
  // The Ask AI panel, when it is open.
  aside?: ReactNode
  children: ReactNode
}

/**
 * The whole window. The sidebar runs to the top edge with the traffic lights in
 * it. The page and the Ask AI panel sit under a bar that drags the window.
 */
export const AppShell = ({
  title,
  sidebar,
  aside,
  children
}: TAppShellProps) => {
  const { isSidebarOpen, toggleSidebar } = useSidebarOpen()
  // Note: the traffic lights end about 76px in, so the controls start at 80px.
  // Other systems draw their own window buttons, so nothing needs clearing.
  const hasTrafficLights = window.openSales?.platform === 'darwin'

  return (
    <div className="relative flex h-screen min-h-180 min-w-275 overflow-hidden bg-background text-foreground antialiased">
      <div
        className={cn(
          'sales-sidebar-slot h-full flex-none overflow-hidden',
          isSidebarOpen ? 'w-50' : 'w-0 *:-translate-x-full'
        )}
        data-testid="sidebar-slot"
        inert={!isSidebarOpen}
      >
        {sidebar}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={cn(
            'sales-drag-region sales-window-bar box-border flex h-11 flex-none items-center border-b border-border pr-4 select-none',
            isSidebarOpen ? 'pl-6' : hasTrafficLights ? 'pl-44' : 'pl-27'
          )}
        >
          <span className="truncate text-sm font-semibold">{title}</span>
        </header>
        <div className="flex min-h-0 flex-1">
          <main className="relative flex min-w-0 flex-1 flex-col">
            {children}
          </main>
          {aside}
        </div>
      </div>

      <WindowControls
        className={cn(
          'absolute top-2',
          hasTrafficLights ? 'left-20' : 'left-3'
        )}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={toggleSidebar}
      />
    </div>
  )
}

type TPageBodyProps = {
  // Keeps long settings-style pages to a readable width.
  narrow?: boolean
  children: ReactNode
}

/** The scrolling area of a page, with the standard gutters. */
export const PageBody = ({ narrow = false, children }: TPageBodyProps) => (
  <div className="box-border flex min-h-0 flex-1 scrollbar-thin flex-col gap-4 overflow-y-auto px-6 pt-5 pb-8">
    <div
      className={cn(
        'flex w-full flex-col gap-4',
        narrow && 'mx-auto max-w-225'
      )}
    >
      {children}
    </div>
  </div>
)
