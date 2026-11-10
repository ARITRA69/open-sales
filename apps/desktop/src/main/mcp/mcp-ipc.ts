import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron'

import { MCP_CHANNELS, type TMcpInfo } from '../../preload/bridge-types'

type TMcpIpcOptions = {
  ipcMain: Pick<IpcMain, 'handle'>
  // The app's own window's page, if the window is open.
  appContents: () => WebContents | undefined
  getInfo: () => TMcpInfo
}

/**
 * Answers the Connect AI page. Only the app's own window may ask, as with
 * the browser's calls: the commands hold paths on the person's computer,
 * which a web page in a tab has no business reading.
 */
export const registerMcpIpc = ({
  ipcMain,
  appContents,
  getInfo
}: TMcpIpcOptions) => {
  const isFromApp = (event: IpcMainInvokeEvent) => {
    const contents = appContents()
    return (
      contents !== undefined &&
      event.sender === contents &&
      event.senderFrame === contents.mainFrame
    )
  }

  ipcMain.handle(MCP_CHANNELS.getInfo, (event) =>
    isFromApp(event) ? getInfo() : undefined
  )
}
