import { randomBytes, timingSafeEqual } from 'node:crypto'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse
} from 'node:http'
import type { AddressInfo } from 'node:net'

import {
  PROTOCOL_VERSIONS,
  RPC_ERRORS,
  rpcError,
  type TMcpHandler
} from './mcp-handler'

/*
 * The app's MCP server: how the person's own AI tool reaches the tools this
 * app offers. It listens on this machine only (127.0.0.1, a port picked at
 * each launch) and answers only to the secret made at each launch. Requests
 * from web pages are refused outright: a page in any browser could otherwise
 * try to call it.
 */

const MAX_BODY_BYTES = 1024 * 1024
const PATH = '/mcp'

/** A new secret for this launch. */
export const newMcpToken = () => randomBytes(32).toString('base64url')

const isSameSecret = (given: string, expected: string) => {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  // Compared in constant time, so the answer's timing says nothing.
  return a.length === b.length && timingSafeEqual(a, b)
}

const readBody = (request: IncomingMessage) =>
  new Promise<string | null>((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        resolve(null)
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', () => resolve(null))
  })

const send = (
  response: ServerResponse,
  status: number,
  body?: unknown,
  headers: Record<string, string> = {}
) => {
  if (body === undefined) {
    response.writeHead(status, headers).end()
    return
  }
  response
    .writeHead(status, { 'Content-Type': 'application/json', ...headers })
    .end(JSON.stringify(body))
}

type TServerOptions = {
  token: string
  handler: TMcpHandler
  // 0 picks a free port.
  port?: number
}

export const createMcpHttpServer = ({
  token,
  handler,
  port = 0
}: TServerOptions) => {
  let boundPort = 0

  const answer = async (request: IncomingMessage, response: ServerResponse) => {
    // The address must be this server's own. A page that points another name
    // at 127.0.0.1 (DNS rebinding) sends that name here instead.
    const host = request.headers.host
    if (
      host !== `127.0.0.1:${boundPort}` &&
      host !== `localhost:${boundPort}`
    ) {
      return send(
        response,
        403,
        rpcError(null, RPC_ERRORS.invalidRequest, 'Wrong host.')
      )
    }
    // Browsers put an Origin on requests from pages; AI tools don't send one.
    if (request.headers.origin !== undefined) {
      return send(
        response,
        403,
        rpcError(null, RPC_ERRORS.invalidRequest, 'Not from a web page.')
      )
    }
    if (new URL(request.url ?? '/', 'http://localhost').pathname !== PATH) {
      return send(response, 404)
    }
    const given = /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1]
    if (!given || !isSameSecret(given, token)) {
      return send(response, 401, undefined, { 'WWW-Authenticate': 'Bearer' })
    }
    if (request.method !== 'POST') {
      // No stream to listen on, and no sessions to end.
      return send(response, 405, undefined, { Allow: 'POST' })
    }
    if (!(request.headers['content-type'] ?? '').includes('application/json')) {
      return send(response, 415)
    }

    // A client on a revision this server doesn't speak falls back to the
    // handshake when it sees this.
    const version = request.headers['mcp-protocol-version']
    if (
      typeof version === 'string' &&
      !PROTOCOL_VERSIONS.some((known) => known === version)
    ) {
      return send(
        response,
        400,
        rpcError(
          null,
          RPC_ERRORS.invalidRequest,
          `This server speaks MCP ${PROTOCOL_VERSIONS.join(', ')}.`
        )
      )
    }

    const body = await readBody(request)
    if (body === null) return send(response, 413)

    let message: unknown
    try {
      message = JSON.parse(body)
    } catch {
      return send(
        response,
        400,
        rpcError(null, RPC_ERRORS.parse, 'That isn’t JSON.')
      )
    }

    const sessionHeader = request.headers['mcp-session-id']
    try {
      const handled = await handler.handle(
        message,
        typeof sessionHeader === 'string' ? sessionHeader : undefined
      )
      if (!handled.response) return send(response, 202)
      const isBadRequest =
        'error' in handled.response && handled.response.id === null
      return send(
        response,
        isBadRequest ? 400 : 200,
        handled.response,
        handled.sessionId ? { 'Mcp-Session-Id': handled.sessionId } : {}
      )
    } catch {
      return send(
        response,
        500,
        rpcError(null, RPC_ERRORS.internal, 'Something went wrong in the app.')
      )
    }
  }

  const server = createServer((request, response) => {
    void answer(request, response)
  })

  return {
    /** Starts listening and says where. */
    start: () =>
      new Promise<{ url: string; port: number }>((resolve, reject) => {
        server.once('error', reject)
        // This machine only: never 0.0.0.0.
        server.listen(port, '127.0.0.1', () => {
          boundPort = (server.address() as AddressInfo).port
          resolve({
            url: `http://127.0.0.1:${boundPort}${PATH}`,
            port: boundPort
          })
        })
      }),
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
        server.closeAllConnections()
      })
  }
}
