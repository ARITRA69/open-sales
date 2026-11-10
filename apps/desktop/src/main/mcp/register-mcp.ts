import { join } from 'node:path'

import { app, ipcMain, type BrowserWindow } from 'electron'

import brand from '../../../brand.config.json'
import {
  relayCommands,
  removeConnectionFile,
  writeConnectionFile,
  type TMcpConnection
} from './connection-file'
import { createMcpHttpServer, newMcpToken } from './http-server'
import { createMcpHandler } from './mcp-handler'
import { buildMcpInfo } from './mcp-info'
import { registerMcpIpc } from './mcp-ipc'
import relayPath from './stdio-relay.mjs?asset&asarUnpack'
import {
  createToolRegistry,
  type TTool,
  type TToolGroup
} from './tool-registry'

type TAddedTools = {
  group: TToolGroup
  // Said to the AI tool when it connects, about using these tools.
  instructions: string
  tools: TTool[]
}

/**
 * Starts the app's MCP server, which the person's own Claude Code or Codex
 * reaches the app through, and answers the Connect AI page. Each part of the
 * app then adds its own tools with `addTools`: the browser's today, the
 * sales records' later. Call once the app is ready, before the window is
 * made.
 */
export const registerMcp = (userDataDir: string) => {
  const tools = createToolRegistry()
  const instructions: string[] = []
  const connected = new Set<string>()
  const handler = createMcpHandler({
    serverInfo: {
      name: brand.urlScheme,
      title: brand.productName,
      version: app.getVersion()
    },
    instructions: () => instructions.join('\n\n'),
    tools,
    onConnect: (client) => connected.add(client)
  })

  // On this machine only, with a secret made new at every launch.
  const token = newMcpToken()
  const server = createMcpHttpServer({ token, handler })
  const connectionPath = join(userDataDir, 'mcp-connection.json')
  let connection: TMcpConnection | null = null
  void server.start().then(async ({ url }) => {
    connection = { url, token }
    await writeConnectionFile(connectionPath, connection)
  })
  app.on('will-quit', () => {
    void removeConnectionFile(connectionPath)
    void server.stop()
  })

  // The app's own window: the only one the Connect AI page can be in.
  let appWindow: BrowserWindow | null = null
  app.on('browser-window-created', (_event, window: BrowserWindow) => {
    if (appWindow) return
    appWindow = window
    window.on('closed', () => {
      appWindow = null
    })
  })

  registerMcpIpc({
    ipcMain,
    appContents: () => appWindow?.webContents,
    getInfo: () =>
      buildMcpInfo({
        serverName: brand.urlScheme,
        commands: relayCommands({
          serverName: brand.urlScheme,
          appPath: process.execPath,
          relayPath,
          connectionPath,
          productName: brand.productName,
          platform: process.platform
        }),
        connected,
        tools
      })
  })

  return {
    /** Adds one part of the app's tools to the server. */
    addTools: ({ group, instructions: said, tools: added }: TAddedTools) => {
      tools.addGroup(group, ...added)
      instructions.push(said)
    },

    /**
     * Where this launch's MCP server is, for starting an AI tool with it
     * directly (no setup by the person). Null until it's listening.
     */
    getConnection: () => connection
  }
}

export type TMcp = ReturnType<typeof registerMcp>
