import { join } from 'node:path'

import {
  app,
  BrowserWindow,
  dialog,
  nativeImage,
  safeStorage,
  shell
} from 'electron'

import brand from '../../brand.config.json'
import windowsIconPath from '../../build/icon.ico?asset'
import macIconPath from '../../build/icon.png?asset'
import { CONNECTION_CHANNELS } from '../preload/bridge-types'
import { createConnection } from './connection'
import { createConnectionStore } from './connection-store'
import { registerAiToolsIpc, registerConnectionIpc } from './ipc'
import { createServerApi } from './server-api'

const isWebLink = (url: string) => /^https?:\/\//.test(url)

const createMainWindow = () => {
  const mainWindow = new BrowserWindow({
    // The page sets its own title from the brand once it loads.
    title: brand.productName,
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    // Windows takes the taskbar icon from the window.
    ...(process.platform === 'win32' ? { icon: windowsIconPath } : {}),
    // On a Mac the traffic lights sit in the sidebar, centred on the 44px top bar.
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hidden' as const,
          trafficLightPosition: { x: 16, y: 15 }
        }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  // Note: The renderer never leaves the app. Web links open in the default browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isWebLink(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (navigationEvent, url) => {
    navigationEvent.preventDefault()
    if (isWebLink(url)) void shell.openExternal(url)
  })

  const rendererDevUrl = process.env.ELECTRON_RENDERER_URL

  if (rendererDevUrl) {
    void mainWindow.loadURL(rendererDevUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/*
 * Join links. The server's join page opens `open-sales://join?link=…` (the
 * scheme is brand.urlScheme). A Mac delivers it as `open-url`; Windows and
 * Linux start a second copy with it in argv, which hands it to this one.
 */
const JOIN_LINK_PREFIX = `${brand.urlScheme}://`
let openJoinLink: ((link: string) => Promise<void>) | null = null
// A link that arrived before the app was ready.
let earlyJoinLink: string | null = null

const handleJoinLink = (link: string) => {
  if (openJoinLink) void openJoinLink(link)
  else earlyJoinLink = link
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const link = argv.find((arg) => arg.startsWith(JOIN_LINK_PREFIX))
    if (link) handleJoinLink(link)
    const [window] = BrowserWindow.getAllWindows()
    if (window) {
      if (window.isMinimized()) window.restore()
      window.focus()
    }
  })
}
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleJoinLink(url)
})

// In development the app runs through Electron with a path argument, so the
// link has to say how to start it again.
if (process.defaultApp && process.argv[1]) {
  app.setAsDefaultProtocolClient(brand.urlScheme, process.execPath, [
    process.argv[1]
  ])
} else {
  app.setAsDefaultProtocolClient(brand.urlScheme)
}

void app.whenReady().then(() => {
  // Note: a packaged Mac app gets its dock icon from icon.icns in the bundle.
  if (!app.isPackaged) {
    app.dock?.setIcon(nativeImage.createFromPath(macIconPath))
  }
  // Without this, Windows groups the app under Electron in the taskbar.
  if (process.platform === 'win32') app.setAppUserModelId(brand.appId)

  // The main process talks to the server and keeps the session token.
  const connection = createConnection(
    createServerApi(),
    createConnectionStore(app.getPath('userData'), safeStorage)
  )
  registerConnectionIpc(connection)

  openJoinLink = async (link) => {
    const result = await connection.openJoinLink(link)
    const [window] = BrowserWindow.getAllWindows()
    if (!window) return
    if (result.ok) {
      window.webContents.send(CONNECTION_CHANNELS.onStateChange, result.state)
    } else {
      void dialog.showMessageBox(window, {
        type: 'warning',
        message: 'That join link didn’t work',
        detail: result.message
      })
    }
    window.focus()
  }
  // Finds the person's own Claude Code or Codex, which the AI help runs on.
  registerAiToolsIpc()

  createMainWindow()

  // Windows and Linux pass a link that started the app in argv.
  const startLink =
    earlyJoinLink ??
    process.argv.find((arg) => arg.startsWith(JOIN_LINK_PREFIX))
  if (startLink) {
    const [window] = BrowserWindow.getAllWindows()
    // After the page loads, so it hears the new state.
    window?.webContents.once('did-finish-load', () => handleJoinLink(startLink))
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
