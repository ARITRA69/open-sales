import { contextBridge, ipcRenderer } from 'electron'

import type { TConnectionState, TOpenSalesBridge } from './bridge-types'
import {
  AI_TOOLS_CHANNELS,
  CONNECTION_CHANNELS,
  LEADS_CHANNELS,
  PIPELINE_CHANNELS,
  PLAYBOOKS_CHANNELS,
  PROPOSALS_CHANNELS,
  RECORDS_CHANNELS,
  RENEWALS_CHANNELS,
  REPORTS_CHANNELS,
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
  },
  pipeline: {
    createDeal: (input) =>
      ipcRenderer.invoke(PIPELINE_CHANNELS.createDeal, input)
  },
  leads: {
    list: (query) => ipcRenderer.invoke(LEADS_CHANNELS.list, query),
    get: (id) => ipcRenderer.invoke(LEADS_CHANNELS.get, id),
    create: (input) => ipcRenderer.invoke(LEADS_CHANNELS.create, input),
    assign: (id, input) => ipcRenderer.invoke(LEADS_CHANNELS.assign, id, input),
    qualify: (id, version) =>
      ipcRenderer.invoke(LEADS_CHANNELS.qualify, id, version),
    disqualify: (id, input) =>
      ipcRenderer.invoke(LEADS_CHANNELS.disqualify, id, input),
    reopen: (id, version) =>
      ipcRenderer.invoke(LEADS_CHANNELS.reopen, id, version),
    match: (id, companyName) =>
      ipcRenderer.invoke(LEADS_CHANNELS.match, id, companyName),
    convert: (id, input) =>
      ipcRenderer.invoke(LEADS_CHANNELS.convert, id, input)
  },
  renewals: {
    list: (query) => ipcRenderer.invoke(RENEWALS_CHANNELS.list, query),
    listCandidates: (query) =>
      ipcRenderer.invoke(RENEWALS_CHANNELS.listCandidates, query),
    createContract: (input) =>
      ipcRenderer.invoke(RENEWALS_CHANNELS.createContract, input),
    startRenewal: (contractId, input) =>
      ipcRenderer.invoke(RENEWALS_CHANNELS.startRenewal, contractId, input),
    endContract: (contractId, input) =>
      ipcRenderer.invoke(RENEWALS_CHANNELS.endContract, contractId, input),
    reopenContract: (contractId, version) =>
      ipcRenderer.invoke(RENEWALS_CHANNELS.reopenContract, contractId, version)
  },
  reports: {
    getPipeline: (query) =>
      ipcRenderer.invoke(REPORTS_CHANNELS.getPipeline, query),
    getWonLost: (query) =>
      ipcRenderer.invoke(REPORTS_CHANNELS.getWonLost, query),
    getForecast: (query) =>
      ipcRenderer.invoke(REPORTS_CHANNELS.getForecast, query)
  },
  playbooks: {
    list: (query) => ipcRenderer.invoke(PLAYBOOKS_CHANNELS.list, query),
    get: (id) => ipcRenderer.invoke(PLAYBOOKS_CHANNELS.get, id),
    create: (input) => ipcRenderer.invoke(PLAYBOOKS_CHANNELS.create, input),
    update: (id, input) =>
      ipcRenderer.invoke(PLAYBOOKS_CHANNELS.update, id, input),
    setState: (id, action, version) =>
      ipcRenderer.invoke(PLAYBOOKS_CHANNELS.setState, id, action, version)
  }
}

contextBridge.exposeInMainWorld('openSales', openSalesBridge)
