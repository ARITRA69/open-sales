import { useCallback, useEffect, useState } from 'react'

import { Plug01Icon } from '@hugeicons/core-free-icons'

import { PageBody } from '@/components/sales/app-shell'
import { InfoRow, InfoSection } from '@/components/sales/info-section'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'

import type {
  TBrowserBridge,
  TBrowserConnectInfo,
  TBrowserSite
} from '../../../../../preload/bridge-types'

const RULE_LABELS: Record<TBrowserSite['rule'], string> = {
  always: 'Always allowed',
  once: 'Allowed in one tab, until you quit',
  blocked: 'Not allowed, until you quit'
}

/**
 * Browser › AI in the browser: what the person's AI tool can and can't do
 * in the browser, and the sites they've answered for. Connecting the tool
 * itself is the app's Connect AI page (`#/mcp`).
 */
export const BrowserConnectPage = ({ bridge }: { bridge: TBrowserBridge }) => {
  const [info, setInfo] = useState<TBrowserConnectInfo | null>(null)

  const load = useCallback(
    () => bridge.getConnectInfo().then(setInfo),
    [bridge]
  )

  // Looks again when the window comes back: answers are given on other pages.
  useEffect(() => {
    void load()
    const look = () => void load()
    window.addEventListener('focus', look)
    return () => window.removeEventListener('focus', look)
  }, [load])

  const forget = async (site: string) => {
    await bridge.forgetSite(site)
    await load()
  }

  return (
    <PageBody narrow>
      <PageHeader
        actions={
          <Button
            href="#/mcp"
            leadIcon={Plug01Icon}
            size="lg"
            variant="secondary"
          >
            Connect AI
          </Button>
        }
        backLink={{ label: 'Browser', href: '#/browser' }}
        subtitle="What your own Claude Code or Codex may do in this browser."
        title="AI in the browser"
      />

      <InfoSection title="What happens when AI browses">
        {[
          'It works in its own tabs, marked AI. It can’t see or touch your tabs unless you press “Let AI use this tab”.',
          'The first time it wants to use a site, you’re asked: once, always, or no.',
          'You can watch it, and Stop takes effect at once. After Stop it does nothing until you let it carry on.',
          'It never types passwords, sign-in codes or payment details, and never sends a form that holds them. You sign in and pay.',
          'It can’t upload files, and a download it sets off waits for you.'
        ].map((line) => (
          <InfoRow key={line}>
            <span>{line}</span>
          </InfoRow>
        ))}
      </InfoSection>

      <InfoSection
        intro={
          info && !info.canRememberSites
            ? 'This computer has no keychain, so “always” lasts until you quit.'
            : 'Remove one to be asked again.'
        }
        title="Sites you’ve answered for"
      >
        {info && info.sites.length > 0 ? (
          info.sites.map(({ site, rule }) => (
            <InfoRow key={`${site} ${rule}`}>
              <span className="min-w-0 flex-1 truncate font-medium">
                {site}
              </span>
              <span className="flex-none text-body-sm text-muted-foreground">
                {RULE_LABELS[rule]}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void forget(site)}
              >
                Remove
              </Button>
            </InfoRow>
          ))
        ) : (
          <InfoRow>
            <span className="text-muted-foreground">
              {info
                ? 'None yet. You’ll be asked the first time AI uses a site.'
                : 'Loading…'}
            </span>
          </InfoRow>
        )}
      </InfoSection>
    </PageBody>
  )
}
