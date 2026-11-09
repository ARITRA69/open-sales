import { useEffect, useState } from 'react'

type THistoryNavigation = EventTarget & {
  canGoBack: boolean
  canGoForward: boolean
}

const getNavigation = () =>
  (window as unknown as { navigation?: THistoryNavigation }).navigation

const readHistory = () => {
  const navigation = getNavigation()

  return {
    canGoBack: navigation?.canGoBack ?? false,
    canGoForward: navigation?.canGoForward ?? false
  }
}

/** Whether the window's back and forward buttons have anywhere to go. */
export const useHistoryButtons = () => {
  const [history, setHistory] = useState(readHistory)

  useEffect(() => {
    const navigation = getNavigation()
    const updateHistory = () => setHistory(readHistory())

    navigation?.addEventListener('currententrychange', updateHistory)

    return () =>
      navigation?.removeEventListener('currententrychange', updateHistory)
  }, [])

  return history
}
