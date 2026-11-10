import { randomUUID } from 'node:crypto'

import type { TToolRegistry } from './tool-registry'

/*
 * The Model Context Protocol, as far as a tools-only server needs it. This
 * speaks the revisions with an `initialize` handshake (2025-11-25 and
 * earlier), which is what Claude Code and Codex use with servers like this
 * one. A client on the 2026-07-28 revision probes with `server/discover`
 * first; the "no such method" it gets here tells it to fall back to the
 * handshake.
 */

export const PROTOCOL_VERSIONS = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05'
] as const

const LATEST_VERSION = PROTOCOL_VERSIONS[0]

export const RPC_ERRORS = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603
} as const

type TRpcId = string | number

export type TRpcResponse =
  | { jsonrpc: '2.0'; id: TRpcId; result: unknown }
  | {
      jsonrpc: '2.0'
      id: TRpcId | null
      error: { code: number; message: string }
    }

export const rpcError = (
  id: TRpcId | null,
  code: number,
  message: string
): TRpcResponse => ({ jsonrpc: '2.0', id, error: { code, message } })

const rpcResult = (id: TRpcId, result: unknown): TRpcResponse => ({
  jsonrpc: '2.0',
  id,
  result
})

/** What the AI tool calls itself, in the words the app shows people. */
export const clientLabel = (name: unknown): string => {
  if (typeof name !== 'string' || !name.trim()) return 'AI'
  const lower = name.toLowerCase()
  if (lower.includes('claude')) return 'Claude Code'
  if (lower.includes('codex')) return 'Codex'
  // Shown in the app, so keep it short and plain.
  return (
    name
      .replace(/[^\w .-]/g, '')
      .trim()
      .slice(0, 40) || 'AI'
  )
}

type THandlerOptions = {
  serverInfo: { name: string; title: string; version: string }
  // Said to the AI tool once, when it connects.
  instructions: string
  tools: TToolRegistry
  // A tool has connected, so the app can say so.
  onConnect?: (client: string) => void
}

type THandled = {
  // Null for a notification, which gets no answer.
  response: TRpcResponse | null
  // Set when a session has just begun.
  sessionId?: string
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const createMcpHandler = ({
  serverInfo,
  instructions,
  tools,
  onConnect = () => undefined
}: THandlerOptions) => {
  // Session id → who connected. Only used to say whose tab it is.
  const sessions = new Map<string, string>()
  const MAX_SESSIONS = 200

  const initialize = (id: TRpcId, params: unknown): THandled => {
    const asked = isObject(params) ? params.protocolVersion : undefined
    const protocolVersion = PROTOCOL_VERSIONS.find(
      (version) => version === asked
    )
    const client = clientLabel(
      isObject(params) && isObject(params.clientInfo)
        ? params.clientInfo.name
        : undefined
    )
    const sessionId = randomUUID()
    if (sessions.size >= MAX_SESSIONS) {
      sessions.delete(sessions.keys().next().value!)
    }
    sessions.set(sessionId, client)
    onConnect(client)
    return {
      sessionId,
      response: rpcResult(id, {
        // The same version if it's one this server speaks, else its newest.
        protocolVersion: protocolVersion ?? LATEST_VERSION,
        capabilities: { tools: {} },
        serverInfo,
        instructions
      })
    }
  }

  /** Answers one message. `sessionId` is the one the client sent, if any. */
  const handle = async (
    message: unknown,
    sessionId?: string
  ): Promise<THandled> => {
    if (Array.isArray(message)) {
      return {
        response: rpcError(
          null,
          RPC_ERRORS.invalidRequest,
          'Send one message at a time.'
        )
      }
    }
    if (
      !isObject(message) ||
      message.jsonrpc !== '2.0' ||
      typeof message.method !== 'string'
    ) {
      // A reply to something this server never asked is ignored.
      if (isObject(message) && ('result' in message || 'error' in message)) {
        return { response: null }
      }
      return {
        response: rpcError(
          null,
          RPC_ERRORS.invalidRequest,
          'That isn’t a JSON-RPC 2.0 message.'
        )
      }
    }

    const { method, params } = message
    const id = message.id
    // No id: a notification, which is never answered.
    if (typeof id !== 'string' && typeof id !== 'number') {
      return { response: null }
    }

    switch (method) {
      case 'initialize':
        return initialize(id, params)
      case 'ping':
        return { response: rpcResult(id, {}) }
      case 'tools/list':
        return { response: rpcResult(id, { tools: tools.list() }) }
      case 'tools/call': {
        if (!isObject(params) || typeof params.name !== 'string') {
          return {
            response: rpcError(
              id,
              RPC_ERRORS.invalidParams,
              'tools/call needs the tool’s name.'
            )
          }
        }
        const client = (sessionId && sessions.get(sessionId)) || 'AI'
        const result = await tools.call(params.name, params.arguments, {
          client
        })
        return {
          response: result
            ? rpcResult(id, result)
            : rpcError(
                id,
                RPC_ERRORS.invalidParams,
                `Unknown tool: ${params.name}`
              )
        }
      }
      default:
        return {
          response: rpcError(
            id,
            RPC_ERRORS.methodNotFound,
            `This server doesn’t have ${method}.`
          )
        }
    }
  }

  return { handle }
}

export type TMcpHandler = ReturnType<typeof createMcpHandler>
