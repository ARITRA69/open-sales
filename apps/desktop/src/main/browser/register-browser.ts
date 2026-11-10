import { app, session, type BrowserWindow } from 'electron'

import {
  BROWSER_CHANNELS,
  type TBrowserConnectInfo
} from '../../preload/bridge-types'
import type { TMcp } from '../mcp/register-mcp'
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
 * Sets up the in-app browser and adds its tools to the app's MCP server,
 * which the person's own Claude Code or Codex uses to drive it. Call once
 * the app is ready, before the window is made.
 */
export const registerBrowser = (
  userDataDir: string,
  encryption: TEncryption,
  mcp: Pick<TMcp, 'addTools'>
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

  mcp.addTools({
    group: {
      title: 'Browser',
      about:
        'Opens, reads and works in web pages in the app’s browser, in tabs of its own.',
      more: {
        label: 'What AI may do in the browser',
        href: '#/browser/connect'
      }
    },
    instructions: BROWSER_INSTRUCTIONS,
    tools: createBrowserTools(controller)
  })

  const getConnectInfo = (): TBrowserConnectInfo => ({
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
}
