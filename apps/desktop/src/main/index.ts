import { join } from 'node:path'

import { app, BrowserWindow, nativeImage, shell } from 'electron'

import windowsIconPath from '../../build/icon.ico?asset'
import macIconPath from '../../build/icon.png?asset'

const WINDOWS_APP_ID = 'io.github.aritra69.open-sales'

const isWebLink = (url: string) => /^https?:\/\//.test(url)

const createMainWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    // Windows takes the taskbar icon from the window.
    ...(process.platform === 'win32' ? { icon: windowsIconPath } : {}),
    // On a Mac the traffic lights sit in the sidebar, centred on the 52px top bar.
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

void app.whenReady().then(() => {
  // Note: a packaged Mac app gets its dock icon from icon.icns in the bundle.
  if (!app.isPackaged) {
    app.dock?.setIcon(nativeImage.createFromPath(macIconPath))
  }
  // Without this, Windows groups the app under Electron in the taskbar.
  if (process.platform === 'win32') app.setAppUserModelId(WINDOWS_APP_ID)

  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
