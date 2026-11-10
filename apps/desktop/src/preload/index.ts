import { contextBridge, ipcRenderer } from 'electron'

import type { TConnectionState, TOpenSalesBridge } from './bridge-types'
import {
  AI_TOOLS_CHANNELS,
  CONNECTION_CHANNELS,
  PROPOSALS_CHANNELS,
  RECORDS_CHANNELS,
  TEAM_CHANNELS,
  TIMELINE_CHANNELS
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
  timeline: {
    read: (record, query) =>
      ipcRenderer.invoke(TIMELINE_CHANNELS.read, record, query),
    createActivity: (input) =>
      ipcRenderer.invoke(TIMELINE_CHANNELS.createActivity, input),
    updateActivity: (id, input) =>
      ipcRenderer.invoke(TIMELINE_CHANNELS.updateActivity, id, input),
    archiveActivity: (id) =>
      ipcRenderer.invoke(TIMELINE_CHANNELS.archiveActivity, id),
    listTasks: (query) =>
      ipcRenderer.invoke(TIMELINE_CHANNELS.listTasks, query),
    createTask: (input) =>
      ipcRenderer.invoke(TIMELINE_CHANNELS.createTask, input),
    updateTask: (id, input) =>
      ipcRenderer.invoke(TIMELINE_CHANNELS.updateTask, id, input),
    setTaskDone: (id, done, version) =>
      ipcRenderer.invoke(TIMELINE_CHANNELS.setTaskDone, id, done, version),
    archiveTask: (id, version) =>
      ipcRenderer.invoke(TIMELINE_CHANNELS.archiveTask, id, version),
    listPeople: (record) =>
      ipcRenderer.invoke(TIMELINE_CHANNELS.listPeople, record)
  },
  proposals: {
    list: (query) => ipcRenderer.invoke(PROPOSALS_CHANNELS.list, query),
    create: (input) => ipcRenderer.invoke(PROPOSALS_CHANNELS.create, input),
    approve: (id, input) =>
      ipcRenderer.invoke(PROPOSALS_CHANNELS.approve, id, input),
    decline: (id, reason) =>
      ipcRenderer.invoke(PROPOSALS_CHANNELS.decline, id, reason),
    undo: (id) => ipcRenderer.invoke(PROPOSALS_CHANNELS.undo, id),
    sendToOwner: (id) => ipcRenderer.invoke(PROPOSALS_CHANNELS.sendToOwner, id)
  }
}

contextBridge.exposeInMainWorld('openSales', openSalesBridge)
