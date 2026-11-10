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
  TMember,
  TOwner,
  TPage,
  TPerson,
  TPersonCreate,
  TPersonUpdate,
  TPipeline,
  TSessionUser,
  TSetupRequest,
  TSignInRequest
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
  // The in-app browser: the person's tabs, and what their AI tool may do.
  browser: TBrowserBridge
  // The app's own MCP server, which the person's AI tool connects to.
  mcp: TMcpBridge
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

declare global {
  interface Window {
    // Missing when the renderer runs in a plain browser tab or a test.
    openSales?: TOpenSalesBridge
  }
}

/*
 * The in-app browser. Tabs live in the main process, each in its own view
 * over the page; the renderer draws the tab strip and toolbar and says where
 * the view goes. A tab is the person's or AI's: the person's own AI tool
 * (Claude Code or Codex) can only use tabs it opened or was handed.
 */

/** One browser tab, as the page shows it. */
export type TBrowserTab = {
  id: string
  // Empty for a new tab that hasn't gone anywhere yet.
  url: string
  title: string
  favicon: string | null
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  // `ai` when the person's AI tool opened it or was handed it.
  control: 'person' | 'ai'
  // The tool using it, such as "Claude Code". Null until one does.
  aiName: string | null
  // An AI call is running in this tab right now.
  isAiWorking: boolean
  // Why the page isn't showing (it failed to load, or crashed), for people.
  problem: string | null
  // The last thing that happened that the person should know about, such as
  // a box the page showed that was dismissed for AI.
  note: string | null
}

/** Something AI may not do until the person answers. */
export type TBrowserQuestion = {
  id: string
  // The tool asking, such as "Claude Code".
  aiName: string
  // The site it wants to use, such as `linkedin.com`.
  site: string
  // The tab it's about.
  tabId: string
}

export type TBrowserAnswer = 'once' | 'always' | 'no'

/** A download AI set off, kept until the person says to fetch it. */
export type TBrowserHeldDownload = {
  id: string
  tabId: string
  fileName: string
  site: string
}

export type TBrowserState = {
  tabs: TBrowserTab[]
  activeTabId: string | null
  questions: TBrowserQuestion[]
  heldDownloads: TBrowserHeldDownload[]
  // The person pressed Stop: AI does nothing until they let it carry on.
  isAiPaused: boolean
  // The tool that tried to carry on while paused, if one did.
  pausedAiName: string | null
}

export type TBrowserTabAction =
  | 'select'
  | 'close'
  | 'back'
  | 'forward'
  | 'reload'
  | 'stop-loading'
  | 'open-in-default-browser'
  // Hands the tab to the person's AI tool.
  | 'let-ai-use'
  // Stop: takes the tab back at once and pauses AI.
  | 'stop-ai'

/** Where the live page goes, in the app window's CSS pixels. */
export type TBrowserBounds = {
  x: number
  y: number
  width: number
  height: number
}

/** A site the person has answered for. */
export type TBrowserSite = {
  site: string
  // `always` is remembered on this machine; the others last until the app quits.
  rule: 'always' | 'once' | 'blocked'
}

/** What Browser › AI in the browser shows. Connecting a tool is `TMcpInfo`. */
export type TBrowserConnectInfo = {
  sites: TBrowserSite[]
  // False where there's no keychain: "always" then lasts until the app quits.
  canRememberSites: boolean
}

export type TBrowserBridge = {
  getState: () => Promise<TBrowserState>
  // Returns a function that stops listening.
  onStateChange: (listener: (state: TBrowserState) => void) => () => void
  // A new tab of the person's own. `address` is what they typed, if anything.
  openTab: (address?: string) => Promise<void>
  // An address, or words to search for.
  navigate: (tabId: string, address: string) => Promise<void>
  actOnTab: (tabId: string, action: TBrowserTabAction) => Promise<void>
  answerQuestion: (id: string, answer: TBrowserAnswer) => Promise<void>
  // After Stop: lets AI work again.
  resumeAi: () => Promise<void>
  resolveDownload: (id: string, action: 'download' | 'dismiss') => Promise<void>
  // Null hides the live page, when the Browser page isn't showing it.
  setBounds: (bounds: TBrowserBounds | null) => void
  // A picture of the tab on screen, shown while an app menu covers it.
  captureStill: () => Promise<string | null>
  getConnectInfo: () => Promise<TBrowserConnectInfo>
  forgetSite: (site: string) => Promise<void>
}

export const BROWSER_CHANNELS = {
  getState: 'browser:get-state',
  // Main → renderer, not a request.
  onStateChange: 'browser:state-changed',
  openTab: 'browser:open-tab',
  navigate: 'browser:navigate',
  actOnTab: 'browser:act-on-tab',
  answerQuestion: 'browser:answer-question',
  resumeAi: 'browser:resume-ai',
  resolveDownload: 'browser:resolve-download',
  // Renderer → main, no answer.
  setBounds: 'browser:set-bounds',
  captureStill: 'browser:capture-still',
  getConnectInfo: 'browser:get-connect-info',
  forgetSite: 'browser:forget-site'
} as const satisfies Record<keyof TBrowserBridge, string>

/*
 * The app's MCP server: how the person's own AI tool (Claude Code or Codex)
 * reaches what the app offers it. It runs on this computer only. The page
 * never gets its address or secret: the relay reads those from a file.
 */

/** One thing the server lets an AI tool do. */
export type TMcpTool = {
  // What the AI tool calls it, such as `browser_open`.
  name: string
  title: string
  // One line, as the AI tool is told it.
  description: string
  // It only looks; it changes nothing.
  readOnly: boolean
}

/** The tools of one part of the app, such as the browser. */
export type TMcpToolGroup = {
  title: string
  // One line on what these tools are for.
  about: string
  // Where the app says more about them, such as the browser's own rules.
  more?: { label: string; href: string }
  tools: TMcpTool[]
}

/** What the Connect AI page shows. */
export type TMcpInfo = {
  // The name the AI tool lists this app's tools under.
  serverName: string
  // The command to run once in a terminal, per tool.
  commands: Record<TAiToolId, string>
  // Tools that have connected since the app opened, such as "Claude Code".
  connected: string[]
  toolGroups: TMcpToolGroup[]
}

export type TMcpBridge = {
  getInfo: () => Promise<TMcpInfo>
}

export const MCP_CHANNELS = {
  getInfo: 'mcp:get-info'
} as const satisfies Record<keyof TMcpBridge, string>
