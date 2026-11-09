import { contextBridge, ipcRenderer } from 'electron'

import type { TOpenSalesBridge } from './bridge-types'
import { CONNECTION_CHANNELS } from './bridge-types'

const openSalesBridge: TOpenSalesBridge = {
  platform: process.platform,
  connection: {
    getState: () => ipcRenderer.invoke(CONNECTION_CHANNELS.getState),
    chooseServer: (address) =>
      ipcRenderer.invoke(CONNECTION_CHANNELS.chooseServer, address),
    forgetServer: () => ipcRenderer.invoke(CONNECTION_CHANNELS.forgetServer),
    createAdmin: (input) =>
      ipcRenderer.invoke(CONNECTION_CHANNELS.createAdmin, input),
    signIn: (input) => ipcRenderer.invoke(CONNECTION_CHANNELS.signIn, input),
    signOut: () => ipcRenderer.invoke(CONNECTION_CHANNELS.signOut)
  }
}

contextBridge.exposeInMainWorld('openSales', openSalesBridge)
