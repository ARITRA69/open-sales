import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'

import {
  BROWSER_CHANNELS,
  type TBrowserConnectInfo
} from '../../preload/bridge-types'
import type { TBrowserController } from './browser-controller'
import type { TTabViews } from './tab-views'

const id = z.string().min(1).max(40)
const typed = z.string().max(4096)

const tabAction = z.enum([
  'select',
  'close',
  'back',
  'forward',
  'reload',
  'stop-loading',
  'open-in-default-browser',
  'let-ai-use',
  'stop-ai'
])

const boundsSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().nonnegative(),
    height: z.number().finite().nonnegative()
  })
  .nullable()

type TBrowserIpcOptions = {
  controller: TBrowserController
  views: TTabViews
  getConnectInfo: () => TBrowserConnectInfo
  forgetSite: (site: string) => void
}

/**
 * Answers the Browser page. Only the app's own window may ask: these calls
 * approve sites and hand tabs to AI, so a web page must never reach them.
 * (Tabs have no preload, so they can't send anything; this checks anyway.)
 */
export const registerBrowserIpc = ({
  controller,
  views,
  getConnectInfo,
  forgetSite
}: TBrowserIpcOptions) => {
  const isFromApp = (event: IpcMainInvokeEvent | IpcMainEvent) => {
    const appContents = views.window()?.webContents
    return (
      appContents !== undefined &&
      event.sender === appContents &&
      event.senderFrame === appContents.mainFrame
    )
  }

  const handle = <TArgs extends z.ZodTuple>(
    channel: string,
    args: TArgs,
    run: (...parsed: z.infer<TArgs>) => unknown
  ) =>
    ipcMain.handle(channel, (event, ...given: unknown[]) => {
      if (!isFromApp(event)) return undefined
      const parsed = args.safeParse(given.slice(0, args.def.items.length))
      return parsed.success
        ? run(...(parsed.data as z.infer<TArgs>))
        : undefined
    })

  handle(BROWSER_CHANNELS.getState, z.tuple([]), () => controller.getState())
  handle(BROWSER_CHANNELS.openTab, z.tuple([typed.optional()]), (address) =>
    controller.openTab(address)
  )
  handle(BROWSER_CHANNELS.navigate, z.tuple([id, typed]), (tabId, address) =>
    controller.navigate(tabId, address)
  )
  handle(BROWSER_CHANNELS.actOnTab, z.tuple([id, tabAction]), (tabId, action) =>
    controller.actOnTab(tabId, action)
  )
  handle(
    BROWSER_CHANNELS.answerQuestion,
    z.tuple([id, z.enum(['once', 'always', 'no'])]),
    (questionId, answer) => controller.answerQuestion(questionId, answer)
  )
  handle(BROWSER_CHANNELS.resumeAi, z.tuple([]), () => controller.resumeAi())
  handle(
    BROWSER_CHANNELS.resolveDownload,
    z.tuple([id, z.enum(['download', 'dismiss'])]),
    (downloadId, action) => controller.resolveDownload(downloadId, action)
  )
  handle(BROWSER_CHANNELS.captureStill, z.tuple([]), () => views.captureStill())
  handle(BROWSER_CHANNELS.getConnectInfo, z.tuple([]), () => getConnectInfo())
  handle(BROWSER_CHANNELS.forgetSite, z.tuple([z.string().max(300)]), (site) =>
    forgetSite(site)
  )

  ipcMain.on(BROWSER_CHANNELS.setBounds, (event, bounds: unknown) => {
    if (!isFromApp(event)) return
    const parsed = boundsSchema.safeParse(bounds)
    if (parsed.success) views.setBounds(parsed.data)
  })
}
