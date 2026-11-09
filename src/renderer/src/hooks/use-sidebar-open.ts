import { useCallback, useEffect, useState } from 'react'

const SIDEBAR_OPEN_KEY = 'open-sales-sidebar-open'

const readIsSidebarOpen = () => {
  try {
    return localStorage.getItem(SIDEBAR_OPEN_KEY) !== 'false'
  } catch {
    return true
  }
}

/** Whether the sidebar is open. It stays as left, and ⌘B or Ctrl+B flips it. */
export const useSidebarOpen = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(readIsSidebarOpen)

  const toggleSidebar = useCallback(
    () => setIsSidebarOpen((isOpen) => !isOpen),
    []
  )

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_OPEN_KEY, String(isSidebarOpen))
    } catch {
      // Note: without storage the choice just lasts until the window closes.
    }
  }, [isSidebarOpen])

  useEffect(() => {
    const handleKeyDown = (keyEvent: KeyboardEvent) => {
      const isToggleKey =
        (keyEvent.metaKey || keyEvent.ctrlKey) &&
        !keyEvent.shiftKey &&
        !keyEvent.altKey &&
        keyEvent.key.toLowerCase() === 'b'

      if (!isToggleKey || keyEvent.repeat) return

      keyEvent.preventDefault()
      toggleSidebar()
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleSidebar])

  return { isSidebarOpen, toggleSidebar }
}
