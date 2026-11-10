import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { describe, expect, it } from 'vitest'

import { MCP_CHANNELS, type TMcpInfo } from '../../preload/bridge-types'
import { registerMcpIpc } from './mcp-ipc'

const INFO: TMcpInfo = {
  serverName: 'open-sales',
  commands: { 'claude-code': 'claude mcp add', codex: 'codex mcp add' },
  connected: [],
  toolGroups: []
}

// Enough of a page for the sender check: itself and its main frame.
const makeContents = () => {
  const mainFrame = {}
  return { mainFrame } as unknown as WebContents
}

const setUp = (appContents: WebContents | undefined) => {
  const handlers = new Map<
    string,
    (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
  >()
  registerMcpIpc({
    ipcMain: {
      handle: (channel, handler) => {
        handlers.set(channel, handler)
      }
    },
    appContents: () => appContents,
    getInfo: () => INFO
  })
  const ask = (sender: WebContents, senderFrame: unknown = sender.mainFrame) =>
    handlers.get(MCP_CHANNELS.getInfo)?.({
      sender,
      senderFrame
    } as IpcMainInvokeEvent)
  return { handlers, ask }
}

describe('registerMcpIpc', () => {
  it('answers the app’s own window', () => {
    const app = makeContents()
    const { handlers, ask } = setUp(app)

    expect([...handlers.keys()]).toEqual(['mcp:get-info'])
    expect(ask(app)).toBe(INFO)
  })

  it('tells any other page nothing', () => {
    const app = makeContents()
    const { ask } = setUp(app)

    // A web page in a browser tab.
    expect(ask(makeContents())).toBeUndefined()
    // A frame inside the app's window that isn't the app itself.
    expect(ask(app, {})).toBeUndefined()
  })

  it('tells nobody anything while the app has no window', () => {
    const { ask } = setUp(undefined)
    expect(ask(makeContents())).toBeUndefined()
  })
})
