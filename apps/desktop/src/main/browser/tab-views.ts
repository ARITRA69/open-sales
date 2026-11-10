import {
  app,
  clipboard,
  Menu,
  nativeImage,
  shell,
  WebContentsView,
  type BrowserWindow,
  type MenuItemConstructorOptions,
  type NativeImage,
  type Rectangle,
  type Session,
  type WebContents
} from 'electron'

import type { TBrowserBounds } from '../../preload/bridge-types'
import type {
  TBrowserController,
  TMask,
  TTabHost,
  TTabPage
} from './browser-controller'
import { createCdp } from './cdp'
import { isWebUrl } from './site'

/*
 * The real tabs: one view per tab, laid over the part of the window the
 * Browser page says is the web area. Each runs sandboxed, with no preload
 * and no Node: a web page in a tab can never reach the app's own bridge or
 * the session token. Views stay attached while the person is on another
 * page of the app, so AI can keep working in its tabs.
 */

const SCREENSHOT_MAX_WIDTH = 1280
const CAPTURE_TIMEOUT_MS = 5000
const ICON_MAX_BYTES = 100 * 1024
const ICON_TYPES = new Set([
  'image/png',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml'
])

type TView = { view: WebContentsView; page: TTabPage }

/** Paints grey over parts of a picture, so what's there can't be read. */
const paintOver = (image: NativeImage, masks: TMask[]) => {
  if (masks.length === 0) return image
  const { width, height } = image.getSize()
  const pixels = image.toBitmap()
  // Four bytes a pixel. A bitmap for a sharper screen holds more of them.
  const scale = Math.sqrt(pixels.length / 4 / (width * height))
  const columns = Math.round(width * scale)
  const rows = Math.round(height * scale)
  for (const mask of masks) {
    const left = Math.max(0, Math.floor(mask.x * columns) - 1)
    const top = Math.max(0, Math.floor(mask.y * rows) - 1)
    const right = Math.min(
      columns,
      Math.ceil((mask.x + mask.width) * columns) + 1
    )
    const bottom = Math.min(rows, Math.ceil((mask.y + mask.height) * rows) + 1)
    for (let row = top; row < bottom; row += 1) {
      for (let column = left; column < right; column += 1) {
        const at = (row * columns + column) * 4
        pixels[at] = pixels[at + 1] = pixels[at + 2] = 0x9a
        pixels[at + 3] = 0xff
      }
    }
  }
  return nativeImage.createFromBitmap(pixels, { width: columns, height: rows })
}

const withTimeout = <TValue>(work: Promise<TValue>, ms: number) =>
  Promise.race([
    work,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))
  ])

export const createTabViews = (session: Session) => {
  let window: BrowserWindow | null = null
  let controller: TBrowserController | null = null
  const views = new Map<string, TView>()
  let frontId: string | null = null
  // Where the Browser page wants the tab in front. Null: it isn't showing one.
  let bounds: Rectangle | null = null
  let lastBounds: Rectangle | null = null
  // One picture at a time: capturing two at once can take the app down.
  let capturing: Promise<unknown> = Promise.resolve()

  const sizeBeforeAnyLayout = (): Rectangle => {
    const [width, height] = window?.getContentSize() ?? [1440, 900]
    return { x: 200, y: 124, width: width - 200, height: height - 124 }
  }

  const layOut = () => {
    for (const [tabId, { view }] of views) {
      view.setBounds(lastBounds ?? sizeBeforeAnyLayout())
      view.setVisible(tabId === frontId && bounds !== null)
    }
  }

  const capture = (webContents: WebContents) => {
    const take = async (): Promise<NativeImage | null> => {
      if (webContents.isDestroyed()) return null
      const image = await withTimeout(
        webContents.capturePage().catch(() => null),
        CAPTURE_TIMEOUT_MS
      )
      return image && !image.isEmpty() ? image : null
    }
    const result = capturing.then(take, take)
    capturing = result.catch(() => null)
    return result
  }

  /**
   * A site's icon as a picture the tab strip can show. The app's own page
   * may not load anything from the web, so it's fetched here, in the
   * browser's session, and handed over as data. Small images only.
   */
  const fetchIcon = async (url: string | undefined) => {
    if (!url) return null
    try {
      const response = await session.fetch(url)
      const type = response.headers.get('content-type')?.split(';')[0] ?? ''
      if (!response.ok || !ICON_TYPES.has(type)) return null
      const bytes = Buffer.from(await response.arrayBuffer())
      if (bytes.length === 0 || bytes.length > ICON_MAX_BYTES) return null
      return `data:${type};base64,${bytes.toString('base64')}`
    } catch {
      return null
    }
  }

  const popUpMenu = (
    tabId: string,
    webContents: WebContents,
    params: Electron.ContextMenuParams
  ) => {
    const items: MenuItemConstructorOptions[] = []
    if (isWebUrl(params.linkURL)) {
      items.push(
        {
          label: 'Open link in new tab',
          click: () => controller?.handlePopup(tabId, params.linkURL)
        },
        {
          label: 'Copy link address',
          click: () => clipboard.writeText(params.linkURL)
        },
        { type: 'separator' }
      )
    }
    if (params.isEditable) {
      items.push(
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { type: 'separator' }
      )
    } else if (params.selectionText) {
      items.push({ role: 'copy' }, { type: 'separator' })
    }
    items.push(
      {
        label: 'Back',
        enabled: webContents.navigationHistory.canGoBack(),
        click: () => webContents.navigationHistory.goBack()
      },
      {
        label: 'Forward',
        enabled: webContents.navigationHistory.canGoForward(),
        click: () => webContents.navigationHistory.goForward()
      },
      { label: 'Reload', click: () => webContents.reload() }
    )
    Menu.buildFromTemplate(items).popup(window ? { window } : undefined)
  }

  const create = (tabId: string): TTabPage => {
    const view = new WebContentsView({
      webPreferences: {
        session,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        // A page that keeps popping up boxes can be told to stop.
        safeDialogs: true
      }
    })
    const webContents = view.webContents
    const connection = createCdp(webContents.debugger)
    // True from the moment a load is asked for until the page has settled.
    let isLoadPending = false
    const tell = (
      event: Parameters<TBrowserController['handlePageEvent']>[1]
    ) => controller?.handlePageEvent(tabId, event)

    view.setBackgroundColor('#ffffff')
    window?.contentView.addChildView(view)

    // Pop-ups open as tabs, under the same rules as the tab that asked.
    webContents.setWindowOpenHandler(({ url }) => {
      controller?.handlePopup(tabId, url)
      return { action: 'deny' }
    })
    const holdIfNeeded = (details: {
      isMainFrame: boolean
      url: string
      preventDefault: () => void
    }) => {
      if (
        details.isMainFrame &&
        controller?.shouldHoldNavigation(tabId, details.url)
      ) {
        details.preventDefault()
      }
    }
    webContents.on('will-navigate', holdIfNeeded)
    webContents.on('will-redirect', holdIfNeeded)

    webContents.on('did-start-loading', () => tell({ type: 'changed' }))
    webContents.on('did-stop-loading', () => {
      isLoadPending = false
      tell({ type: 'changed' })
    })
    webContents.on('page-title-updated', () => tell({ type: 'changed' }))
    webContents.on('did-navigate-in-page', (_event, _url, isMainFrame) => {
      if (isMainFrame) tell({ type: 'changed' })
    })
    webContents.on('did-navigate', () => tell({ type: 'navigated' }))
    webContents.on('page-favicon-updated', (_event, favicons) => {
      void fetchIcon(favicons.find(isWebUrl)).then((url) =>
        tell({ type: 'favicon', url })
      )
    })
    webContents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription, _url, isMainFrame) => {
        // -3 is a load that was stopped or replaced, not a failure.
        if (!isMainFrame || errorCode === -3) return
        isLoadPending = false
        tell({
          type: 'failed',
          message: `This page didn’t load (${errorDescription || errorCode}). Check the address and your connection, then try again.`
        })
      }
    )
    webContents.on('render-process-gone', () => tell({ type: 'crashed' }))
    webContents.on('destroyed', () => tell({ type: 'closed' }))
    connection.onDetach(() => tell({ type: 'ai-disconnected' }))

    webContents.on('context-menu', (_event, params) =>
      popUpMenu(tabId, webContents, params)
    )
    // The browser's own shortcuts, while the cursor is in the page.
    webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || input.alt) return
      const hasCommand =
        process.platform === 'darwin' ? input.meta : input.control
      if (!hasCommand) return
      const key = input.key.toLowerCase()
      if (key === 'r') {
        event.preventDefault()
        webContents.reload()
      } else if (key === 'w') {
        event.preventDefault()
        controller?.actOnTab(tabId, 'close')
      } else if (key === 't') {
        event.preventDefault()
        controller?.openTab()
      }
    })

    const page: TTabPage = {
      url: () => (webContents.isDestroyed() ? '' : webContents.getURL()),
      title: () => (webContents.isDestroyed() ? '' : webContents.getTitle()),
      isLoading: () =>
        !webContents.isDestroyed() &&
        (isLoadPending || webContents.isLoading()),
      canGoBack: () =>
        !webContents.isDestroyed() && webContents.navigationHistory.canGoBack(),
      canGoForward: () =>
        !webContents.isDestroyed() &&
        webContents.navigationHistory.canGoForward(),
      load: (url) => {
        if (webContents.isDestroyed()) return
        isLoadPending = true
        // A failed load is reported by `did-fail-load`.
        void webContents.loadURL(url).catch(() => undefined)
      },
      back: () => webContents.navigationHistory.goBack(),
      forward: () => webContents.navigationHistory.goForward(),
      reload: () => webContents.reload(),
      stopLoading: () => {
        isLoadPending = false
        if (!webContents.isDestroyed()) webContents.stop()
      },
      whenLoaded: (ms) =>
        new Promise((resolve) => {
          if (!page.isLoading()) {
            resolve('loaded')
            return
          }
          const finish = (state: 'loaded' | 'still-loading') => {
            clearTimeout(timer)
            webContents.removeListener('did-stop-loading', onStop)
            resolve(state)
          }
          const onStop = () => finish('loaded')
          const timer = setTimeout(() => finish('still-loading'), ms)
          webContents.once('did-stop-loading', onStop)
        }),
      cdp: connection.cdp,
      setAiMode: async (on) => {
        if (webContents.isDestroyed()) return false
        if (!on) {
          connection.detach()
          webContents.setBackgroundThrottling(true)
          return true
        }
        if (!connection.attach()) return false
        // AI's tab is often not the one in front; it must keep running.
        webContents.setBackgroundThrottling(false)
        return true
      },
      screenshot: async (masks = []) => {
        // Asking the page itself draws a fresh frame, which matters for a
        // tab that isn't on screen. The window's own capture is the fallback.
        const fresh = connection.isAttached()
          ? await connection.cdp
              .send<{ data: string }>('Page.captureScreenshot', {
                format: 'png'
              })
              .then(
                ({ data }) =>
                  nativeImage.createFromBuffer(Buffer.from(data, 'base64')),
                () => null
              )
          : null
        const image =
          fresh && !fresh.isEmpty() ? fresh : await capture(webContents)
        if (!image) return null
        const { width } = image.getSize()
        const sized =
          width > SCREENSHOT_MAX_WIDTH
            ? image.resize({ width: SCREENSHOT_MAX_WIDTH, quality: 'good' })
            : image
        return {
          data: paintOver(sized, masks).toJPEG(70).toString('base64'),
          mimeType: 'image/jpeg'
        }
      },
      download: (url) => {
        if (!webContents.isDestroyed()) webContents.downloadURL(url)
      },
      close: () => {
        if (!views.delete(tabId)) return
        connection.detach()
        window?.contentView.removeChildView(view)
        if (!webContents.isDestroyed()) webContents.close()
      }
    }

    views.set(tabId, { view, page })
    layOut()
    return page
  }

  const host: TTabHost = {
    create,
    show: (tabId) => {
      frontId = tabId
      layOut()
    },
    openInDefaultBrowser: (url) => {
      if (isWebUrl(url)) void shell.openExternal(url)
    },
    askForAttention: () => {
      if (!window || window.isFocused()) return
      if (process.platform === 'darwin') app.dock?.bounce('informational')
      else window.flashFrame(true)
    }
  }

  return {
    host,
    connect: (next: TBrowserController) => {
      controller = next
    },
    attach: (next: BrowserWindow) => {
      window = next
    },
    detach: () => {
      window = null
      bounds = null
    },
    window: () => window,
    tabIdOf: (webContents: WebContents | null) =>
      [...views].find(
        ([, { view }]) => view.webContents === webContents
      )?.[0] ?? null,

    /** Where the tab in front goes, in the app page's own pixels. */
    setBounds: (next: TBrowserBounds | null) => {
      if (next && window) {
        // The app's page may be zoomed; views are placed in window pixels.
        const zoom = window.webContents.getZoomFactor()
        bounds = {
          x: Math.round(next.x * zoom),
          y: Math.round(next.y * zoom),
          width: Math.max(1, Math.round(next.width * zoom)),
          height: Math.max(1, Math.round(next.height * zoom))
        }
        lastBounds = bounds
      } else {
        bounds = null
      }
      layOut()
    },

    /** A picture of the tab in front, to show while an app menu covers it. */
    captureStill: async () => {
      const front = frontId ? views.get(frontId) : null
      if (!front || bounds === null) return null
      const image = await capture(front.view.webContents)
      return image
        ? `data:image/jpeg;base64,${image.toJPEG(80).toString('base64')}`
        : null
    }
  }
}

export type TTabViews = ReturnType<typeof createTabViews>
