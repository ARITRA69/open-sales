/* global process, fetch */
/*
 * The relay an AI tool (Claude Code or Codex) starts to reach the app. The
 * tool speaks MCP to it over stdin and stdout, one JSON message per line; it
 * passes each on to the app's MCP server on this machine.
 *
 *   <app program> stdio-relay.mjs <connection file> [<product name>]
 *
 * The app writes its address and this launch's secret to the connection
 * file. The relay reads it again whenever the app doesn't answer or turns
 * the secret down, so a restarted app is picked up without reconnecting.
 * It is plain JavaScript with no dependencies, because it runs on the app's
 * own program (ELECTRON_RUN_AS_NODE=1), outside the app's bundle.
 */
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

const [connectionPath, productName = 'The app'] = process.argv.slice(2)

let connection = null
let sessionId = null

const readConnection = () => {
  try {
    const saved = JSON.parse(readFileSync(connectionPath, 'utf8'))
    connection =
      typeof saved.url === 'string' && typeof saved.token === 'string'
        ? saved
        : null
  } catch {
    connection = null
  }
  return connection
}

const post = async (line) => {
  const response = await fetch(connection.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${connection.token}`,
      ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {})
    },
    body: line
  })
  if (response.status === 401) throw new Error('secret turned down')
  sessionId = response.headers.get('mcp-session-id') ?? sessionId
  const body = await response.text()
  // Each answer goes back as one line, whatever spacing the app used.
  return body.trim() ? JSON.stringify(JSON.parse(body)) : null
}

const forward = async (line) => {
  let message
  try {
    message = JSON.parse(line)
  } catch {
    return JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'That isn’t JSON.' }
    })
  }

  // Try what's known, then read the file afresh: the app may have restarted.
  for (const refresh of [false, true]) {
    if (refresh || !connection) {
      const previous = connection
      if (!readConnection()) break
      if (previous && previous.token !== connection.token) sessionId = null
    }
    try {
      return await post(line)
    } catch {
      // Not running, or a secret from an earlier launch: look again.
    }
  }

  // Notifications get no answer, so there's nobody to tell.
  if (message === null || typeof message !== 'object' || message.id == null) {
    return null
  }
  return JSON.stringify({
    jsonrpc: '2.0',
    id: message.id,
    error: {
      code: -32000,
      message: `${productName} isn’t open. Ask the person to open it, then try again.`
    }
  })
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
let waiting = 0
let isInputDone = false

lines.on('line', (line) => {
  if (!line.trim()) return
  waiting += 1
  void forward(line).then((answer) => {
    if (answer) process.stdout.write(`${answer}\n`)
    waiting -= 1
    if (isInputDone && waiting === 0) process.exit(0)
  })
})
lines.on('close', () => {
  isInputDone = true
  if (waiting === 0) process.exit(0)
})
