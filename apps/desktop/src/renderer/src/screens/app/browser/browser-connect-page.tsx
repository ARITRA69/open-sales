import { useCallback, useEffect, useState, type ReactNode } from 'react'

import { Copy01Icon, Tick02Icon } from '@hugeicons/core-free-icons'

import { AiToolLogo } from '@/components/sales/ai-tool-logo'
import { PageBody } from '@/components/sales/app-shell'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Dot } from '@/components/ui/status'
import { useBrand } from '@/hooks/use-brand'

import type {
  TAiToolId,
  TBrowserBridge,
  TBrowserConnectInfo,
  TBrowserSite
} from '../../../../../preload/bridge-types'

const TOOLS: Array<{ id: TAiToolId; name: string }> = [
  { id: 'claude-code', name: 'Claude Code' },
  { id: 'codex', name: 'Codex' }
]

const RULE_LABELS: Record<TBrowserSite['rule'], string> = {
  always: 'Always allowed',
  once: 'Allowed in one tab, until you quit',
  blocked: 'Not allowed, until you quit'
}

const ROW_CLASS =
  'flex min-h-9 items-center gap-4 border-b border-border py-2 text-sm last:border-b-0'

type TSectionProps = { title: string; intro?: string; children: ReactNode }

const Section = ({ title, intro, children }: TSectionProps) => (
  <section className="flex flex-col gap-2">
    <div className="flex flex-col">
      <h2 className="m-0 text-sm font-semibold">{title}</h2>
      {intro ? (
        <p className="m-0 text-body-sm text-muted-foreground">{intro}</p>
      ) : null}
    </div>
    <div className="flex flex-col rounded-card bg-muted px-3">{children}</div>
  </section>
)

type TCommandRowProps = { id: TAiToolId; name: string; command: string }

const CommandRow = ({ id, name, command }: TCommandRowProps) => {
  const [isCopied, setIsCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(command)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

  return (
    <div className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0">
      <div className="flex items-center gap-2 text-sm font-medium">
        <AiToolLogo id={id} />
        <span className="flex-1">{name}</span>
        <Button
          leadIcon={isCopied ? Tick02Icon : Copy01Icon}
          size="sm"
          variant="secondary"
          onClick={() => void copy()}
        >
          {isCopied ? 'Copied' : 'Copy command'}
        </Button>
      </div>
      <code className="block rounded-row bg-background px-3 py-2 font-mono text-body-sm break-all text-foreground-soft select-all">
        {command}
      </code>
    </div>
  )
}

/**
 * Browser › Connect AI: the one command that lets the person's own Claude
 * Code or Codex use the browser, what it can and can't do, and the sites
 * they've answered for.
 */
export const BrowserConnectPage = ({ bridge }: { bridge: TBrowserBridge }) => {
  const { productName } = useBrand()
  const [info, setInfo] = useState<TBrowserConnectInfo | null>(null)

  const load = useCallback(
    () => bridge.getConnectInfo().then(setInfo),
    [bridge]
  )

  // Looks again when the window comes back: the command is run elsewhere.
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
        backLink={{ label: 'Browser', href: '#/browser' }}
        subtitle="Let your own Claude Code or Codex use this browser."
        title="Connect your AI tool"
      />

      <Section
        intro={`Copy the command for your tool and run it in a terminal. You do this once: it keeps working each time you open ${productName}.`}
        title="1. Run one command"
      >
        {TOOLS.map((tool) => (
          <CommandRow
            key={tool.id}
            command={info?.commands[tool.id] ?? 'Loading…'}
            id={tool.id}
            name={tool.name}
          />
        ))}
        <div className={ROW_CLASS}>
          <Dot
            size="sm"
            tone={info && info.connected.length > 0 ? 'success' : 'faint'}
          />
          <span className="text-muted-foreground">
            {info && info.connected.length > 0
              ? `${info.connected.join(' and ')} ${info.connected.length === 1 ? 'has' : 'have'} connected since you opened ${productName}.`
              : `No AI tool has connected since you opened ${productName}. Start a new session in your tool after running the command.`}
          </span>
        </div>
      </Section>

      <Section
        intro={`Keep ${productName} open, then ask in your AI tool. For example:`}
        title="2. Ask it to browse"
      >
        <div className={ROW_CLASS}>
          <span className="select-all">
            “Open haldencapital.com in the {productName} browser and tell me
            what they sell and who runs it.”
          </span>
        </div>
      </Section>

      <Section title="What happens when AI browses">
        {[
          'It works in its own tabs, marked AI. It can’t see or touch your tabs unless you press “Let AI use this tab”.',
          'The first time it wants to use a site, you’re asked: once, always, or no.',
          'You can watch it, and Stop takes effect at once. After Stop it does nothing until you let it carry on.',
          'It never types passwords, sign-in codes or payment details, and never sends a form that holds them. You sign in and pay.',
          'It can’t upload files, and a download it sets off waits for you.'
        ].map((line) => (
          <div key={line} className={ROW_CLASS}>
            <span>{line}</span>
          </div>
        ))}
      </Section>

      <Section
        intro={
          info && !info.canRememberSites
            ? 'This computer has no keychain, so “always” lasts until you quit.'
            : 'Remove one to be asked again.'
        }
        title="Sites you’ve answered for"
      >
        {info && info.sites.length > 0 ? (
          info.sites.map(({ site, rule }) => (
            <div key={`${site} ${rule}`} className={ROW_CLASS}>
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
            </div>
          ))
        ) : (
          <div className={ROW_CLASS}>
            <span className="text-muted-foreground">
              {info
                ? 'None yet. You’ll be asked the first time AI uses a site.'
                : 'Loading…'}
            </span>
          </div>
        )}
      </Section>
    </PageBody>
  )
}
