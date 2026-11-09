import { contextBridge, ipcRenderer } from 'electron'

import type { TConnectionState, TOpenSalesBridge } from './bridge-types'
import {
  AI_TOOLS_CHANNELS,
  CONNECTION_CHANNELS,
  TEAM_CHANNELS
} from './bridge-types'

const openSalesBridge: TOpenSalesBridge = {
  platform: process.platform,
  aiTools: {
    getStatus: () => ipcRenderer.invoke(AI_TOOLS_CHANNELS.getStatus)
  },
  connection: {
    getState: () => ipcRenderer.invoke(CONNECTION_CHANNELS.getState),
    chooseServer: (address) =>
      ipcRenderer.invoke(CONNECTION_CHANNELS.chooseServer, address),
    forgetServer: () => ipcRenderer.invoke(CONNECTION_CHANNELS.forgetServer),
    createAdmin: (input) =>
      ipcRenderer.invoke(CONNECTION_CHANNELS.createAdmin, input),
    signIn: (input) => ipcRenderer.invoke(CONNECTION_CHANNELS.signIn, input),
    signOut: () => ipcRenderer.invoke(CONNECTION_CHANNELS.signOut),
    join: (input) => ipcRenderer.invoke(CONNECTION_CHANNELS.join, input),
    cancelJoin: () => ipcRenderer.invoke(CONNECTION_CHANNELS.cancelJoin),
    onStateChange: (listener) => {
      const handle = (_event: unknown, state: TConnectionState) =>
        listener(state)
      ipcRenderer.on(CONNECTION_CHANNELS.onStateChange, handle)
      return () =>
        ipcRenderer.removeListener(CONNECTION_CHANNELS.onStateChange, handle)
    }
  },
  team: {
    getJoinLink: () => ipcRenderer.invoke(TEAM_CHANNELS.getJoinLink),
    createJoinLink: (settings) =>
      ipcRenderer.invoke(TEAM_CHANNELS.createJoinLink, settings),
    updateJoinLink: (settings) =>
      ipcRenderer.invoke(TEAM_CHANNELS.updateJoinLink, settings),
    disableJoinLink: () => ipcRenderer.invoke(TEAM_CHANNELS.disableJoinLink),
    listMembers: () => ipcRenderer.invoke(TEAM_CHANNELS.listMembers),
    decideMember: (memberId, decision) =>
      ipcRenderer.invoke(TEAM_CHANNELS.decideMember, memberId, decision)
  }
}

contextBridge.exposeInMainWorld('openSales', openSalesBridge)
