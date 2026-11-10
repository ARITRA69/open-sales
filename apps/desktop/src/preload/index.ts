import { contextBridge, ipcRenderer } from 'electron'

import type { TConnectionState, TOpenSalesBridge } from './bridge-types'
import {
  AI_TOOLS_CHANNELS,
  CONNECTION_CHANNELS,
  RECORDS_CHANNELS,
  REPORTS_CHANNELS,
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
  },
  records: {
    list: (kind, query) =>
      ipcRenderer.invoke(RECORDS_CHANNELS.list, kind, query),
    get: (kind, id) => ipcRenderer.invoke(RECORDS_CHANNELS.get, kind, id),
    create: (kind, input) =>
      ipcRenderer.invoke(RECORDS_CHANNELS.create, kind, input),
    update: (kind, id, input) =>
      ipcRenderer.invoke(RECORDS_CHANNELS.update, kind, id, input),
    setArchived: (kind, id, action, version) =>
      ipcRenderer.invoke(
        RECORDS_CHANNELS.setArchived,
        kind,
        id,
        action,
        version
      ),
    getPipeline: () => ipcRenderer.invoke(RECORDS_CHANNELS.getPipeline),
    getBoard: () => ipcRenderer.invoke(RECORDS_CHANNELS.getBoard),
    listUsers: () => ipcRenderer.invoke(RECORDS_CHANNELS.listUsers)
  },
  reports: {
    getPipeline: (query) =>
      ipcRenderer.invoke(REPORTS_CHANNELS.getPipeline, query),
    getWonLost: (query) =>
      ipcRenderer.invoke(REPORTS_CHANNELS.getWonLost, query),
    getForecast: (query) =>
      ipcRenderer.invoke(REPORTS_CHANNELS.getForecast, query)
  }
}

contextBridge.exposeInMainWorld('openSales', openSalesBridge)
