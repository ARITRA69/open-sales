import type {
  TActivity,
  TActivityCreate,
  TActivityUpdate,
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
  TMember,
  TOwner,
  TPage,
  TPerson,
  TPersonCreate,
  TPersonUpdate,
  TPipeline,
  TSessionUser,
  TSetupRequest,
  TSignInRequest,
  TTask,
  TTaskCreate,
  TTaskListQueryInput,
  TTaskUpdate,
  TTimeline,
  TTimelineQueryInput
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
  // Each record's timeline, and the notes, calls and tasks on it.
  timeline: TTimelineBridge
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

/** A record with a timeline, by the name its page uses. */
export type TTimelineRecord = {
  type: 'company' | 'person' | 'deal'
  id: string
}

/**
 * Timelines, notes, calls and tasks, as the signed-in person. Anyone may add
 * to any record; the server says who may change what (`canEdit` on each).
 */
export type TTimelineBridge = {
  // What's upcoming, then history, newest first. `cursor` gets more history.
  read: (
    record: TTimelineRecord,
    query?: TTimelineQueryInput
  ) => Promise<TApiResult<TTimeline>>
  createActivity: (input: TActivityCreate) => Promise<TApiResult<TActivity>>
  updateActivity: (
    id: string,
    input: TActivityUpdate
  ) => Promise<TApiResult<TActivity>>
  // Takes a note or call off the timeline.
  archiveActivity: (id: string) => Promise<TApiResult<TActivity>>
  // My open tasks by default; `{ due: 'today' }` is Today's "Follow-ups due".
  listTasks: (query?: TTaskListQueryInput) => Promise<TApiResult<TPage<TTask>>>
  createTask: (input: TTaskCreate) => Promise<TApiResult<TTask>>
  updateTask: (id: string, input: TTaskUpdate) => Promise<TApiResult<TTask>>
  // Ticks a task off (`done: true`) or reopens it.
  setTaskDone: (
    id: string,
    done: boolean,
    version: number
  ) => Promise<TApiResult<TTask>>
  archiveTask: (id: string, version: number) => Promise<TApiResult<TTask>>
  // Everyone at a company, or the people linked to a deal.
  listPeople: (record: {
    type: 'company' | 'deal'
    id: string
  }) => Promise<TApiResult<TPerson[]>>
}

export const TIMELINE_CHANNELS = {
  read: 'timeline:read',
  createActivity: 'timeline:create-activity',
  updateActivity: 'timeline:update-activity',
  archiveActivity: 'timeline:archive-activity',
  listTasks: 'timeline:list-tasks',
  createTask: 'timeline:create-task',
  updateTask: 'timeline:update-task',
  setTaskDone: 'timeline:set-task-done',
  archiveTask: 'timeline:archive-task',
  listPeople: 'timeline:list-people'
} as const satisfies Record<keyof TTimelineBridge, string>

declare global {
  interface Window {
    // Missing when the renderer runs in a plain browser tab or a test.
    openSales?: TOpenSalesBridge
  }
}
