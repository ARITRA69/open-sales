import { useCallback, useEffect, useState } from 'react'

import { PageBody } from '@/components/sales/app-shell'
import { InfoRow, InfoSection } from '@/components/sales/info-section'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatePanel } from '@/components/ui/state-panel'
import { Dot, Tag } from '@/components/ui/status'
import { useBrand } from '@/hooks/use-brand'

import type {
  TAiToolId,
  TMcpBridge,
  TMcpInfo,
  TMcpTool
} from '../../../../../preload/bridge-types'
import { CommandRow } from './command-row'
import { getMcpBridge } from './mcp-bridge'

const TOOLS: Array<{ id: TAiToolId; name: string }> = [
  { id: 'claude-code', name: 'Claude Code' },
  { id: 'codex', name: 'Codex' }
]

const connectedLine = (connected: string[], productName: string) =>
  connected.length > 0
    ? `${connected.join(' and ')} ${connected.length === 1 ? 'has' : 'have'} connected since you opened ${productName}.`
    : `No AI tool has connected since you opened ${productName}. Start a new session in your tool after running the command.`

const ToolRow = ({ tool }: { tool: TMcpTool }) => (
  // Two lines in the 44px a table row with a second line gets.
  <InfoRow className="py-1">
    <div className="flex min-w-0 flex-1 flex-col">
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{tool.title}</span>
        <code className="font-mono text-body-sm text-muted-foreground">
          {tool.name}
        </code>
      </span>
      <span className="text-body-sm text-muted-foreground">
        {tool.description}
      </span>
    </div>
    {/* The ones that act stand out; reading is the quiet, usual case. */}
    {tool.readOnly ? (
      <Tag className="flex-none">Only reads</Tag>
    ) : (
      <Tag className="flex-none" dot="accent" tone="raised">
        Can act
      </Tag>
    )}
  </InfoRow>
)

/** The page itself, once there's a server to ask. */
const ConnectAi = ({ bridge }: { bridge: TMcpBridge }) => {
  const { productName } = useBrand()
  const [info, setInfo] = useState<TMcpInfo | null>(null)

  const load = useCallback(() => bridge.getInfo().then(setInfo), [bridge])

  // Looks again when the window comes back: the command is run elsewhere.
  useEffect(() => {
    void load()
    const look = () => void load()
    window.addEventListener('focus', look)
    return () => window.removeEventListener('focus', look)
  }, [load])

  const isConnected = info !== null && info.connected.length > 0

  return (
    <PageBody narrow>
      <PageHeader
        subtitle={`Let your own Claude Code or Codex work in ${productName}.`}
        title="Connect your AI tool"
      />

      <InfoSection title="How it works">
        <InfoRow>
          <span>
            {productName} runs a small server for your AI tool, on this computer
            only. Nothing on the internet or your network can reach it, and it
            stops when you quit {productName}.
          </span>
        </InfoRow>
        <InfoRow>
          <span>
            It’s your own Claude Code or Codex that does the work, on your own
            subscription.
            {info ? (
              <>
                {' '}
                Your tool lists what it gets from here under{' '}
                <code className="rounded-sm bg-background px-1 py-0.5 font-mono text-body-sm whitespace-nowrap">
                  {info.serverName}
                </code>
                .
              </>
            ) : null}
          </span>
        </InfoRow>
      </InfoSection>

      <InfoSection
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
        <InfoRow>
          <Dot size="sm" tone={isConnected ? 'success' : 'faint'} />
          <span className="text-muted-foreground" role="status">
            {info ? connectedLine(info.connected, productName) : 'Loading…'}
          </span>
        </InfoRow>
      </InfoSection>

      <InfoSection
        intro={`Keep ${productName} open, then ask in your AI tool. For example:`}
        title="2. Ask it something"
      >
        <InfoRow>
          <span className="select-all">
            “Open haldencapital.com in the {productName} browser and tell me
            what they sell and who runs it.”
          </span>
        </InfoRow>
      </InfoSection>

      <div className="flex flex-col pt-2">
        <h2 className="m-0 text-base font-semibold">
          What your AI tool can use
        </h2>
        <p className="m-0 text-body-sm text-muted-foreground">
          Every tool {productName} gives it, described as your AI tool is told,
          so “you” below means the AI tool.
        </p>
      </div>

      {info && info.toolGroups.length > 0 ? (
        info.toolGroups.map((group) => (
          <InfoSection
            key={group.title}
            count={group.tools.length}
            intro={
              <>
                {group.about}
                {group.more ? (
                  <>
                    {' '}
                    <Button href={group.more.href} variant="link">
                      {group.more.label}
                    </Button>
                  </>
                ) : null}
              </>
            }
            title={group.title}
          >
            {group.tools.map((tool) => (
              <ToolRow key={tool.name} tool={tool} />
            ))}
          </InfoSection>
        ))
      ) : (
        <InfoSection title="Tools">
          <InfoRow>
            <span className="text-muted-foreground">
              {info ? 'None yet.' : 'Loading…'}
            </span>
          </InfoRow>
        </InfoSection>
      )}
    </PageBody>
  )
}

type TMcpPageProps = {
  // Left out everywhere but tests: the app's bridge, or the preview's.
  bridge?: TMcpBridge | null
}

/**
 * Connect AI (`#/mcp`): the app's own MCP server. How the person connects
 * their Claude Code or Codex to it once, whether one has connected, and
 * every tool the server offers, by the part of the app it belongs to.
 */
export const McpPage = ({ bridge = getMcpBridge() }: TMcpPageProps) =>
  bridge ? (
    <ConnectAi bridge={bridge} />
  ) : (
    <PageBody>
      <StatePanel
        action=""
        body="Your AI tool connects to the desktop app, on your own computer."
        kind="noaccess"
        title="Open the desktop app to connect AI"
      />
    </PageBody>
  )
