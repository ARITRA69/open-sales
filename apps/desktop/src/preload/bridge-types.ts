import type {
  TBoard,
  TCompany,
  TCompanyCreate,
  TCompanyUpdate,
  TDeal,
  TDealCreate,
  TDealListQueryInput,
  TDealUpdate,
  TJoinForm,
  TJoinLink,
  TJoinLinkSettings,
  TListQueryInput,
  TLostReasonsSave,
  TMember,
  TMemberUpdate,
  TOwner,
  TPage,
  TPerson,
  TPersonCreate,
  TPersonUpdate,
  TPipeline,
  TPipelineSettings,
  TProfileUpdate,
  TSessionUser,
  TSetupRequest,
  TSignInRequest,
  TStagesSaveInput,
  TWorkspaceSettings,
  TWorkspaceUpdate
} from '@open-sales/shared'

/*
 * What the renderer can ask the main process for. The main process talks to
 * the server and holds the session token; the renderer never sees the token.
 */

/** Where the person is in connecting to their server, from the main process. */
export type TConnectionState =
  | { step: 'choose-server' }
  | { step: 'server-unreachable'; serverUrl: string; message: string }
  | { step: 'create-admin'; serverUrl: string }
  | { step: 'sign-in'; serverUrl: string; workspaceName: string | null }
  // Opened the team's join link: pick a name, email and password.
  | { step: 'join'; serverUrl: string; workspaceName: string | null }
  // Joined from outside the trusted domain: an admin has to let them in.
  | {
      step: 'waiting-approval'
      serverUrl: string
      workspaceName: string | null
      email: string
      declined: boolean
    }
  | {
      step: 'signed-in'
      serverUrl: string
      workspaceName: string | null
      user: TSessionUser
    }

/** An action either moves to a new state or explains, for people, why not. */
export type TConnectionResult =
  | { ok: true; state: TConnectionState }
  | { ok: false; message: string }

export type TAiToolId = 'claude-code' | 'codex'

/**
 * One AI tool on this machine. `needs-sign-in` means it's installed but no
 * sign-in or API key was found.
 */
export type TAiToolStatus =
  | { id: TAiToolId; name: string; state: 'not-installed' }
  | {
      id: TAiToolId
      name: string
      state: 'ready' | 'needs-sign-in'
      version: string | null
    }

export type TAiToolsStatus = { tools: TAiToolStatus[] }

/** The records the app lists and edits, and what each one takes. */
export type TRecordTypes = {
  companies: {
    item: TCompany
    create: TCompanyCreate
    update: TCompanyUpdate
    query: TListQueryInput
  }
  people: {
    item: TPerson
    create: TPersonCreate
    update: TPersonUpdate
    query: TListQueryInput
  }
  deals: {
    item: TDeal
    create: TDealCreate
    update: TDealUpdate
    query: TDealListQueryInput
  }
}

export type TRecordKind = keyof TRecordTypes

export type TOpenSalesBridge = {
  platform: string
  aiTools: {
    // Looks again each time; cheap enough to call when the window gets focus.
    getStatus: () => Promise<TAiToolsStatus>
  }
  connection: {
    getState: () => Promise<TConnectionState>
    // Checks an address and remembers it if it's a server.
    chooseServer: (address: string) => Promise<TConnectionResult>
    forgetServer: () => Promise<TConnectionState>
    createAdmin: (input: TSetupRequest) => Promise<TConnectionResult>
    signIn: (input: TSignInRequest) => Promise<TConnectionResult>
    signOut: () => Promise<TConnectionState>
    join: (input: TJoinForm) => Promise<TConnectionResult>
    // Leaves the Join or Waiting screen, back to choosing a server.
    cancelJoin: () => Promise<TConnectionState>
    // A join link opened the app: the main process moved on by itself.
    // Returns a function that stops listening.
    onStateChange: (listener: (state: TConnectionState) => void) => () => void
  }
  // An admin's tools for the team. Members get "Only admins can do this."
  team: {
    getJoinLink: () => Promise<TTeamResult<TJoinLink | null>>
    // A new link; the old one stops working.
    createJoinLink: (
      settings: TJoinLinkSettings
    ) => Promise<TTeamResult<TJoinLink | null>>
    updateJoinLink: (
      settings: TJoinLinkSettings
    ) => Promise<TTeamResult<TJoinLink | null>>
    disableJoinLink: () => Promise<TTeamResult<null>>
    listMembers: () => Promise<TTeamResult<TMember[]>>
    decideMember: (
      memberId: string,
      decision: 'approve' | 'decline'
    ) => Promise<TTeamResult<null>>
  }
  // Companies, people, deals and the pipeline, as the signed-in person.
  records: {
    list: <TKind extends TRecordKind>(
      kind: TKind,
      query?: TRecordTypes[TKind]['query']
    ) => Promise<TApiResult<TPage<TRecordTypes[TKind]['item']>>>
    get: <TKind extends TRecordKind>(
      kind: TKind,
      id: string
    ) => Promise<TApiResult<TRecordTypes[TKind]['item']>>
    create: <TKind extends TRecordKind>(
      kind: TKind,
      input: TRecordTypes[TKind]['create']
    ) => Promise<TApiResult<TRecordTypes[TKind]['item']>>
    // Send the version you saw: if someone changed it since, the answer has
    // code `changed_since`.
    update: <TKind extends TRecordKind>(
      kind: TKind,
      id: string,
      input: TRecordTypes[TKind]['update']
    ) => Promise<TApiResult<TRecordTypes[TKind]['item']>>
    setArchived: <TKind extends TRecordKind>(
      kind: TKind,
      id: string,
      action: 'archive' | 'restore',
      version: number
    ) => Promise<TApiResult<TRecordTypes[TKind]['item']>>
    getPipeline: () => Promise<TApiResult<TPipeline>>
    getBoard: () => Promise<TApiResult<TBoard>>
    // Everyone active on the team: who can own records.
    listUsers: () => Promise<TApiResult<TOwner[]>>
  }
  // Settings: the workspace, stages, lost reasons, roles and your own name.
  settings: TSettingsBridge
}

/**
 * A server call's answer, or why it failed, in people's words. `code` is the
 * server's, like `changed_since` or `forbidden`.
 */
export type TApiResult<TData> =
  | { ok: true; data: TData }
  | { ok: false; message: string; code?: string }

/** A team action's answer. */
export type TTeamResult<TData> = TApiResult<TData>

/** IPC channel names, shared by the preload script and the main process. */
export const CONNECTION_CHANNELS = {
  getState: 'connection:get-state',
  chooseServer: 'connection:choose-server',
  forgetServer: 'connection:forget-server',
  createAdmin: 'connection:create-admin',
  signIn: 'connection:sign-in',
  signOut: 'connection:sign-out',
  join: 'connection:join',
  cancelJoin: 'connection:cancel-join',
  // Main → renderer, not a request.
  onStateChange: 'connection:state-changed'
} as const satisfies Record<keyof TOpenSalesBridge['connection'], string>

export const TEAM_CHANNELS = {
  getJoinLink: 'team:get-join-link',
  createJoinLink: 'team:create-join-link',
  updateJoinLink: 'team:update-join-link',
  disableJoinLink: 'team:disable-join-link',
  listMembers: 'team:list-members',
  decideMember: 'team:decide-member'
} as const satisfies Record<keyof TOpenSalesBridge['team'], string>

export const RECORDS_CHANNELS = {
  list: 'records:list',
  get: 'records:get',
  create: 'records:create',
  update: 'records:update',
  setArchived: 'records:set-archived',
  getPipeline: 'records:get-pipeline',
  getBoard: 'records:get-board',
  listUsers: 'records:list-users'
} as const satisfies Record<keyof TOpenSalesBridge['records'], string>

export const AI_TOOLS_CHANNELS = {
  getStatus: 'ai-tools:get-status'
} as const satisfies Record<keyof TOpenSalesBridge['aiTools'], string>

/**
 * Settings, as the signed-in person. Changing the workspace, the stages,
 * the lost reasons or someone's role is for admins: anyone else gets the
 * server's "Only admins can change this."
 */
export type TSettingsBridge = {
  getWorkspace: () => Promise<TApiResult<TWorkspaceSettings>>
  // Send what changed.
  updateWorkspace: (
    changes: TWorkspaceUpdate
  ) => Promise<TApiResult<TWorkspaceSettings>>
  // Your own name.
  updateMe: (changes: TProfileUpdate) => Promise<TApiResult<TSessionUser>>
  // The pipeline as an admin edits it. Send its `revision` back with a
  // save: if someone saved in between, the answer has code `changed_since`.
  getPipeline: () => Promise<TApiResult<TPipelineSettings>>
  saveStages: (
    input: TStagesSaveInput
  ) => Promise<TApiResult<TPipelineSettings>>
  saveLostReasons: (
    input: TLostReasonsSave
  ) => Promise<TApiResult<TPipelineSettings>>
  // Someone's role, or whether they can sign in.
  updateMember: (
    memberId: string,
    changes: TMemberUpdate
  ) => Promise<TApiResult<TMember>>
}

export const SETTINGS_CHANNELS = {
  getWorkspace: 'settings:get-workspace',
  updateWorkspace: 'settings:update-workspace',
  updateMe: 'settings:update-me',
  getPipeline: 'settings:get-pipeline',
  saveStages: 'settings:save-stages',
  saveLostReasons: 'settings:save-lost-reasons',
  updateMember: 'settings:update-member'
} as const satisfies Record<keyof TSettingsBridge, string>

declare global {
  interface Window {
    // Missing when the renderer runs in a plain browser tab or a test.
    openSales?: TOpenSalesBridge
  }
}
