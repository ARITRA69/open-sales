import { join } from 'node:path'

import { app, session, type BrowserWindow } from 'electron'

import brand from '../../../brand.config.json'
import {
  BROWSER_CHANNELS,
  type TBrowserConnectInfo
} from '../../preload/bridge-types'
import {
  relayCommands,
  removeConnectionFile,
  writeConnectionFile,
  type TMcpConnection
} from '../mcp/connection-file'
import { createMcpHttpServer, newMcpToken } from '../mcp/http-server'
import { createMcpHandler } from '../mcp/mcp-handler'
import relayPath from '../mcp/stdio-relay.mjs?asset&asarUnpack'
import { createToolRegistry } from '../mcp/tool-registry'
import { createApprovalStore } from './approval-store'
import { createApprovals } from './approvals'
import { createBrowserController } from './browser-controller'
import { registerBrowserIpc } from './browser-ipc'
import { BROWSER_INSTRUCTIONS, createBrowserTools } from './browser-tools'
import { armPage } from './page-actions'
import { applySessionRules } from './session-rules'
import { createTabViews } from './tab-views'

type TEncryption = Parameters<typeof createApprovalStore>[1]

/**
 * Sets up the in-app browser and the app's MCP server, which the person's
 * own Claude Code or Codex uses to drive it. Call once the app is ready,
 * before the window is made.
 */
export const registerBrowser = (
  userDataDir: string,
  encryption: TEncryption
) => {
  // Sign-ins made in the browser are kept here, apart from the app's own.
  const browserSession = session.fromPartition('persist:browser')
  const views = createTabViews(browserSession)

  // Pages change state in bursts; the Browser page hears once they settle.
  let pushTimer: NodeJS.Timeout | null = null
  const push = () => {
    pushTimer ??= setTimeout(() => {
      pushTimer = null
      const contents = views.window()?.webContents
      if (contents && !contents.isDestroyed()) {
        contents.send(BROWSER_CHANNELS.onStateChange, controller.getState())
      }
    }, 30)
  }

  const approvals = createApprovals({
    store: createApprovalStore(userDataDir, encryption),
    onChange: push
  })
  const controller = createBrowserController({
    host: views.host,
    approvals,
    onChange: push,
    armPage
  })
  views.connect(controller)
  applySessionRules(browserSession, {
    tabIdOf: views.tabIdOf,
    shouldHoldDownload: controller.shouldHoldDownload
  })

  // The tools this app gives the person's AI tool. The sales-record tools
  // will be added to the same registry.
  const tools = createToolRegistry()
  tools.add(...createBrowserTools(controller))
  const connected = new Set<string>()
  const handler = createMcpHandler({
    serverInfo: {
      name: brand.urlScheme,
      title: brand.productName,
      version: app.getVersion()
    },
    instructions: BROWSER_INSTRUCTIONS,
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

  const getConnectInfo = (): TBrowserConnectInfo => ({
    serverName: brand.urlScheme,
    commands: relayCommands({
      serverName: brand.urlScheme,
      appPath: process.execPath,
      relayPath,
      connectionPath,
      productName: brand.productName,
      platform: process.platform
    }),
    connected: [...connected],
    sites: approvals.sites(),
    canRememberSites: approvals.canRemember()
  })

  registerBrowserIpc({
    controller,
    views,
    getConnectInfo,
    forgetSite: approvals.forgetSite
  })

  // The tabs live in the app's window. When it closes they close with it,
  // and anything AI was doing ends.
  app.on('browser-window-created', (_event, window: BrowserWindow) => {
    if (views.window()) return
    views.attach(window)
    window.on('closed', () => {
      // The window has gone, so there's nothing left to take the views off.
      views.detach()
      controller.closeAll()
    })
  })

  return {
    /**
     * Where this launch's MCP server is, for starting an AI tool with it
     * directly (no setup by the person). Null until it's listening.
     */
    getMcpConnection: () => connection
  }
}
