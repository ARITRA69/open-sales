import type { TAiToolId, TMcpInfo } from '../../preload/bridge-types'
import type { TToolRegistry } from './tool-registry'

/*
 * What the app's Connect AI page shows about the MCP server: how to connect
 * a tool, which have connected, and what the server offers them. Never the
 * address or the secret: the page has no use for either.
 */

// Tools that no part of the app put in a group of its own.
const UNGROUPED = {
  title: 'Other tools',
  about: 'Tools that don’t belong to one part of the app.'
}

/** A description's first sentence, which is all the page has room for. */
export const firstSentence = (description: string) => {
  const text = description.replace(/`/g, '').replace(/\s+/g, ' ').trim()
  return /^.*?[.!?](?=\s|$)/.exec(text)?.[0] ?? text
}

type TMcpInfoOptions = {
  serverName: string
  commands: Record<TAiToolId, string>
  // Tools that have connected since the app opened, such as "Claude Code".
  connected: Iterable<string>
  tools: Pick<TToolRegistry, 'groups'>
}

export const buildMcpInfo = ({
  serverName,
  commands,
  connected,
  tools
}: TMcpInfoOptions): TMcpInfo => ({
  serverName,
  commands,
  connected: [...connected],
  toolGroups: tools.groups().map(({ group, tools: grouped }) => ({
    ...(group ?? UNGROUPED),
    tools: grouped.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: firstSentence(tool.description),
      readOnly: tool.readOnly ?? false
    }))
  }))
})
