import { useEffect, useRef, useState, type FormEvent } from 'react'

import {
  AiBrowserIcon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  LinkSquare02Icon,
  RefreshIcon
} from '@hugeicons/core-free-icons'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import type {
  TBrowserTab,
  TBrowserTabAction
} from '../../../../../preload/bridge-types'

type TBrowserToolbarProps = {
  // Null when there are no tabs: everything is switched off.
  tab: TBrowserTab | null
  onNavigate: (address: string) => void
  onAction: (action: TBrowserTabAction) => void
}

/**
 * Back, forward, reload, and the address box, which takes an address or
 * words to search for. Then the two things you can do with the page: hand
 * the tab to your AI tool, or open it in your usual browser.
 */
export const BrowserToolbar = ({
  tab,
  onNavigate,
  onAction
}: TBrowserToolbarProps) => {
  const inputRef = useRef<HTMLInputElement>(null)
  // What's being typed. While the box isn't in use it shows the tab's address.
  const [draft, setDraft] = useState<string | null>(null)
  const address = tab?.url ?? ''
  const isNewTab = tab !== null && address === ''

  // A new tab is for typing where to go.
  useEffect(() => {
    if (isNewTab) inputRef.current?.focus()
  }, [isNewTab, tab?.id])

  const submit = (submitEvent: FormEvent) => {
    submitEvent.preventDefault()
    const typed = (draft ?? address).trim()
    if (!typed) return
    onNavigate(typed)
    setDraft(null)
    inputRef.current?.blur()
  }

  return (
    <div className="flex h-11 flex-none items-center gap-1 px-3">
      <Button
        aria-label="Back"
        disabled={!tab?.canGoBack}
        leadIcon={ArrowLeft01Icon}
        size="sm"
        title="Back"
        variant="ghost"
        onClick={() => onAction('back')}
      />
      <Button
        aria-label="Forward"
        disabled={!tab?.canGoForward}
        leadIcon={ArrowRight01Icon}
        size="sm"
        title="Forward"
        variant="ghost"
        onClick={() => onAction('forward')}
      />
      <Button
        aria-label={tab?.isLoading ? 'Stop loading' : 'Reload'}
        disabled={!tab || isNewTab}
        leadIcon={tab?.isLoading ? Cancel01Icon : RefreshIcon}
        size="sm"
        title={tab?.isLoading ? 'Stop loading' : 'Reload'}
        variant="ghost"
        onClick={() => onAction(tab?.isLoading ? 'stop-loading' : 'reload')}
      />
      <form className="mx-1 flex min-w-0 flex-1" onSubmit={submit}>
        <Input
          ref={inputRef}
          aria-label="Address"
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          className="min-w-0"
          disabled={!tab}
          placeholder="Search or type an address"
          spellCheck={false}
          type="text"
          value={draft ?? address}
          onBlur={() => setDraft(null)}
          onChange={(changeEvent) => setDraft(changeEvent.target.value)}
          onFocus={(focusEvent) => {
            setDraft(address)
            focusEvent.target.select()
          }}
          onKeyDown={(keyEvent) => {
            if (keyEvent.key === 'Escape') keyEvent.currentTarget.blur()
          }}
        />
      </form>
      {tab && !isNewTab && tab.control === 'person' ? (
        <Button
          leadIcon={AiBrowserIcon}
          size="sm"
          title="Your AI tool can read and use this tab until you stop it"
          variant="secondary"
          onClick={() => onAction('let-ai-use')}
        >
          Let AI use this tab
        </Button>
      ) : null}
      <Button
        disabled={!tab || isNewTab}
        leadIcon={LinkSquare02Icon}
        size="sm"
        variant="ghost"
        onClick={() => onAction('open-in-default-browser')}
      >
        Open in my browser
      </Button>
    </div>
  )
}
