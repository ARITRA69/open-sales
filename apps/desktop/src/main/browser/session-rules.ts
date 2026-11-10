import { join } from 'node:path'

import { app, type Session, type WebContents } from 'electron'

import { browserUserAgent, siteOf } from './site'

/*
 * What web pages in the browser's tabs may and may not do. They get their
 * own session, kept on disk so sign-ins survive a restart and apart from the
 * app's own. Pages are refused the camera, microphone, location,
 * notifications and devices outright; nothing downloads without the person
 * seeing where it's going.
 */

// A "Copy" button on a page works; nothing else is granted.
const ALLOWED_PERMISSIONS = new Set(['clipboard-sanitized-write'])

type TSessionRulesOptions = {
  // Which tab a page belongs to, and whether its download should wait.
  tabIdOf: (webContents: WebContents | null) => string | null
  shouldHoldDownload: (
    tabId: string,
    download: { url: string; fileName: string }
  ) => boolean
}

export const applySessionRules = (
  session: Session,
  { tabIdOf, shouldHoldDownload }: TSessionRulesOptions
) => {
  // Sites treat an embedded browser worse; this is the Chrome it's built on.
  session.setUserAgent(browserUserAgent(session.getUserAgent()))

  session.setPermissionRequestHandler((_webContents, permission, callback) =>
    callback(ALLOWED_PERMISSIONS.has(permission))
  )
  session.setPermissionCheckHandler((_webContents, permission) =>
    ALLOWED_PERMISSIONS.has(permission)
  )
  session.setDevicePermissionHandler(() => false)

  session.on('will-download', (event, item, webContents) => {
    const tabId = tabIdOf(webContents)
    const download = { url: item.getURL(), fileName: item.getFilename() }
    // One AI set off waits for the person's yes in the Browser page.
    if (tabId && shouldHoldDownload(tabId, download)) {
      event.preventDefault()
      return
    }
    // Every other one asks where to save it, and says where it came from.
    item.setSaveDialogOptions({
      title: `Save a file from ${siteOf(download.url) ?? 'this page'}`,
      defaultPath: join(app.getPath('downloads'), download.fileName)
    })
  })
}
