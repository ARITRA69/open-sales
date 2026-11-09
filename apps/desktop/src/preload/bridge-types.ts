import type {
  TJoinForm,
  TJoinLink,
  TJoinLinkSettings,
  TMember,
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
}

/** A team action's answer, or why it failed, in people's words. */
export type TTeamResult<TData> =
  | { ok: true; data: TData }
  | { ok: false; message: string }

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

export const AI_TOOLS_CHANNELS = {
  getStatus: 'ai-tools:get-status'
} as const satisfies Record<keyof TOpenSalesBridge['aiTools'], string>

declare global {
  interface Window {
    // Missing when the renderer runs in a plain browser tab or a test.
    openSales?: TOpenSalesBridge
  }
}
