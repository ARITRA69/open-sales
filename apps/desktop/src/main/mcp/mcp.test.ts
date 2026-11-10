import { spawn } from 'node:child_process'
import { mkdtemp, stat, writeFile } from 'node:fs/promises'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { relayCommands, writeConnectionFile } from './connection-file'
import { createMcpHttpServer, newMcpToken } from './http-server'
import { clientLabel, createMcpHandler } from './mcp-handler'
import { createToolRegistry, defineTool } from './tool-registry'

const makeHandler = () => {
  const tools = createToolRegistry()
  const connected: string[] = []
  tools.add(
    defineTool({
      name: 'say_hello',
      title: 'Say hello',
      description: 'Greets someone.',
      input: z.object({ name: z.string().max(20) }),
      readOnly: true,
      run: async ({ name }, { client }) => ({
        text: `Hello ${name}, from ${client}`
      })
    }),
    defineTool({
      name: 'always_fails',
      title: 'Fail',
      description: 'Throws.',
      input: z.object({}),
      run: async () => {
        throw new Error('The person said no.')
      }
    })
  )
  const handler = createMcpHandler({
    serverInfo: { name: 'open-sales', title: 'Open Sales', version: '0.1.0' },
    instructions: 'Be careful.',
    tools,
    onConnect: (client) => connected.push(client)
  })
  return { handler, connected }
}

const rpc = (method: string, params?: unknown, id = 1) => ({
  jsonrpc: '2.0',
  id,
  method,
  ...(params === undefined ? {} : { params })
})

// A notification: a message with no id, which is never answered.
const note = (method: string) => ({ jsonrpc: '2.0', method })

describe('createMcpHandler', () => {
  it.each(['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'])(
    'agrees to speak %s when asked',
    async (protocolVersion) => {
      const { handler } = makeHandler()
      const { response, sessionId } = await handler.handle(
        rpc('initialize', {
          protocolVersion,
          capabilities: {},
          clientInfo: { name: 'claude-code', version: '2' }
        })
      )
      expect(response).toMatchObject({
        id: 1,
        result: {
          protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: 'open-sales' },
          instructions: 'Be careful.'
        }
      })
      expect(sessionId).toEqual(expect.any(String))
    }
  )

  it('offers its newest version to a client asking for one it doesn’t speak', async () => {
    const { handler } = makeHandler()
    const { response } = await handler.handle(
      rpc('initialize', { protocolVersion: '2031-01-01' })
    )
    expect(response).toMatchObject({
      result: { protocolVersion: '2025-11-25' }
    })
  })

  it('sends a newer client back to the handshake', async () => {
    const { handler } = makeHandler()
    // What a 2026-07-28 client tries first.
    const { response } = await handler.handle(
      rpc('server/discover', { _meta: {} })
    )
    expect(response).toMatchObject({ id: 1, error: { code: -32601 } })
  })

  it('lists tools with their input schemas', async () => {
    const { handler } = makeHandler()
    const { response } = await handler.handle(rpc('tools/list'))
    const { tools } = (
      response as { result: { tools: Array<Record<string, unknown>> } }
    ).result

    expect(tools.map((tool) => tool.name)).toEqual([
      'say_hello',
      'always_fails'
    ])
    expect(tools[0]).toMatchObject({
      title: 'Say hello',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name']
      },
      annotations: { readOnlyHint: true, destructiveHint: false }
    })
  })

  it('runs a tool as the client that started the session', async () => {
    const { handler, connected } = makeHandler()
    const { sessionId } = await handler.handle(
      rpc('initialize', { clientInfo: { name: 'codex-mcp-client' } })
    )
    const { response } = await handler.handle(
      rpc('tools/call', { name: 'say_hello', arguments: { name: 'Asha' } }),
      sessionId
    )
    expect(response).toMatchObject({
      result: {
        content: [{ type: 'text', text: 'Hello Asha, from Codex' }],
        isError: false
      }
    })
    expect(connected).toEqual(['Codex'])
  })

  it('gives a tool’s refusal back as something AI can read, not a protocol error', async () => {
    const { handler } = makeHandler()
    const failed = await handler.handle(
      rpc('tools/call', { name: 'always_fails', arguments: {} })
    )
    expect(failed.response).toMatchObject({
      result: {
        content: [{ type: 'text', text: 'The person said no.' }],
        isError: true
      }
    })

    const badInput = await handler.handle(
      rpc('tools/call', { name: 'say_hello', arguments: { name: 5 } })
    )
    expect(badInput.response).toMatchObject({ result: { isError: true } })
  })

  it('answers the rest of the protocol', async () => {
    const { handler } = makeHandler()
    expect((await handler.handle(rpc('ping'))).response).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: {}
    })
    // Notifications get no answer.
    expect(
      (await handler.handle(note('notifications/initialized'))).response
    ).toBeNull()
    expect(
      (await handler.handle(rpc('tools/call', { name: 'nope' }))).response
    ).toMatchObject({
      error: { code: -32602 }
    })
    expect(
      (await handler.handle(rpc('resources/list'))).response
    ).toMatchObject({ error: { code: -32601 } })
    expect(
      (await handler.handle([rpc('ping'), rpc('ping')])).response
    ).toMatchObject({ error: { code: -32600 } })
    expect((await handler.handle('hello')).response).toMatchObject({
      error: { code: -32600 }
    })
  })

  it('says what each part of the app has added by the time a tool connects', async () => {
    const said = ['About the browser.']
    const handler = createMcpHandler({
      serverInfo: { name: 'open-sales', title: 'Open Sales', version: '0.1.0' },
      instructions: () => said.join('\n\n'),
      tools: createToolRegistry()
    })
    // Added after the server was made, as the browser's are.
    said.push('About records.')

    const { response } = await handler.handle(rpc('initialize', {}))
    expect(response).toMatchObject({
      result: { instructions: 'About the browser.\n\nAbout records.' }
    })
  })

  it('names the tools people know', () => {
    expect(clientLabel('claude-code')).toBe('Claude Code')
    expect(clientLabel('codex-mcp-client')).toBe('Codex')
    expect(clientLabel('<b>My Agent</b>')).toBe('bMy Agentb')
    expect(clientLabel(undefined)).toBe('AI')
  })
})

describe('createToolRegistry', () => {
  const tool = (name: string) =>
    defineTool({
      name,
      title: name,
      description: 'Does it.',
      input: z.object({}),
      run: async () => ({ text: name })
    })

  it('keeps each part of the app’s tools together, and offers them all', async () => {
    const tools = createToolRegistry()
    const browser = { title: 'Browser', about: 'Web pages.' }
    const records = { title: 'Records', about: 'Accounts and deals.' }
    tools.addGroup(browser, tool('browser_open'), tool('browser_read'))
    tools.add(tool('ping'))
    tools.addGroup(records, tool('records_find'))

    expect(
      tools.groups().map(({ group, tools: grouped }) => ({
        group,
        names: grouped.map((each) => each.name)
      }))
    ).toEqual([
      { group: browser, names: ['browser_open', 'browser_read'] },
      { group: null, names: ['ping'] },
      { group: records, names: ['records_find'] }
    ])
    // A group is only for the app's own page: AI gets one flat list.
    expect(tools.list().map((each) => each.name)).toEqual([
      'browser_open',
      'browser_read',
      'ping',
      'records_find'
    ])
    expect(
      await tools.call('records_find', {}, { client: 'Codex' })
    ).toMatchObject({ isError: false })
  })

  it('refuses a second tool with a name already taken, in any group', () => {
    const tools = createToolRegistry()
    tools.addGroup({ title: 'Browser', about: '' }, tool('browser_open'))
    expect(() =>
      tools.addGroup({ title: 'Records', about: '' }, tool('browser_open'))
    ).toThrow('Two tools are called browser_open')
  })
})

type TReply = {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: string
}

const send = (
  port: number,
  options: {
    method?: string
    path?: string
    headers?: Record<string, string>
    body?: string
  }
) =>
  new Promise<TReply>((resolve, reject) => {
    const call = request(
      {
        host: '127.0.0.1',
        port,
        method: options.method ?? 'POST',
        path: options.path ?? '/mcp',
        headers: options.headers
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString()
          })
        )
      }
    )
    call.on('error', reject)
    call.end(options.body)
  })

describe('createMcpHttpServer', () => {
  const servers: Array<{ stop: () => Promise<void> }> = []
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.stop()))
  })

  const start = async () => {
    const token = newMcpToken()
    const server = createMcpHttpServer({
      token,
      handler: makeHandler().handler
    })
    servers.push(server)
    const { port, url } = await server.start()
    const good = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
    return { token, port, url, good }
  }

  it('answers a client that has this launch’s secret', async () => {
    const { port, good, url } = await start()
    expect(url).toBe(`http://127.0.0.1:${port}/mcp`)

    const started = await send(port, {
      headers: good,
      body: JSON.stringify(
        rpc('initialize', { clientInfo: { name: 'claude-code' } })
      )
    })
    expect(started.status).toBe(200)
    expect(started.headers['content-type']).toBe('application/json')
    const sessionId = started.headers['mcp-session-id'] as string

    const called = await send(port, {
      headers: {
        ...good,
        'Mcp-Session-Id': sessionId,
        'MCP-Protocol-Version': '2025-11-25'
      },
      body: JSON.stringify(
        rpc('tools/call', { name: 'say_hello', arguments: { name: 'Asha' } })
      )
    })
    expect(JSON.parse(called.body).result.content[0].text).toBe(
      'Hello Asha, from Claude Code'
    )

    const noted = await send(port, {
      headers: good,
      body: JSON.stringify(note('notifications/initialized'))
    })
    expect(noted).toMatchObject({ status: 202, body: '' })
  })

  it('turns away anyone without the secret', async () => {
    const { port, token } = await start()
    const body = JSON.stringify(rpc('tools/list'))
    const json = { 'Content-Type': 'application/json' }

    for (const headers of [
      json,
      { ...json, Authorization: 'Bearer wrong' },
      // The right length, one character out.
      {
        ...json,
        Authorization: `Bearer ${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`
      },
      { ...json, Authorization: token },
      { ...json, Authorization: `Basic ${token}` }
    ]) {
      const reply = await send(port, { headers, body })
      expect(reply.status).toBe(401)
      expect(reply.body).toBe('')
    }
  })

  it('refuses a request from a web page, even with the secret', async () => {
    const { port, good } = await start()
    const reply = await send(port, {
      headers: { ...good, Origin: 'https://evil.example' },
      body: JSON.stringify(rpc('tools/list'))
    })
    expect(reply.status).toBe(403)
  })

  it('refuses a request sent to another name for this machine', async () => {
    const { port, good } = await start()
    const reply = await send(port, {
      headers: { ...good, Host: `evil.example:${port}` },
      body: JSON.stringify(rpc('tools/list'))
    })
    expect(reply.status).toBe(403)
  })

  it('takes only JSON posted to /mcp', async () => {
    const { port, good } = await start()
    const body = JSON.stringify(rpc('ping'))

    expect((await send(port, { method: 'GET', headers: good })).status).toBe(
      405
    )
    expect((await send(port, { method: 'DELETE', headers: good })).status).toBe(
      405
    )
    expect(
      (await send(port, { path: '/other', headers: good, body })).status
    ).toBe(404)
    expect(
      (
        await send(port, {
          headers: { ...good, 'Content-Type': 'text/plain' },
          body
        })
      ).status
    ).toBe(415)

    const broken = await send(port, { headers: good, body: '{not json' })
    expect(broken.status).toBe(400)
    expect(JSON.parse(broken.body).error.code).toBe(-32700)

    const batch = await send(port, {
      headers: good,
      body: JSON.stringify([rpc('ping')])
    })
    expect(batch.status).toBe(400)
    expect(JSON.parse(batch.body).error.code).toBe(-32600)

    const huge = await send(port, {
      headers: good,
      body: JSON.stringify(rpc('ping', { pad: 'x'.repeat(1_100_000) }))
    }).catch(() => ({ status: 413 }))
    expect(huge.status).toBe(413)
  })

  it('tells a client on a newer revision so in a way that sends it to the handshake', async () => {
    const { port, good } = await start()
    const reply = await send(port, {
      headers: { ...good, 'MCP-Protocol-Version': '2026-07-28' },
      body: JSON.stringify(rpc('server/discover', { _meta: {} }))
    })
    expect(reply.status).toBe(400)
    // Not one of that revision's own errors, so the client treats this as an older server.
    expect(JSON.parse(reply.body).error.code).toBe(-32600)
  })

  it('listens on this machine only', async () => {
    const { url } = await start()
    expect(new URL(url).hostname).toBe('127.0.0.1')
  })
})

describe('the connection file and relay', () => {
  const RELAY = join(import.meta.dirname, 'stdio-relay.mjs')
  const cleanups: Array<() => unknown> = []
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup()
  })

  const startApp = async (file: string) => {
    const token = newMcpToken()
    const server = createMcpHttpServer({
      token,
      handler: makeHandler().handler
    })
    const { url } = await server.start()
    await writeConnectionFile(file, { url, token })
    cleanups.push(() => server.stop())
    return server
  }

  const startRelay = (file: string) => {
    const relay = spawn(process.execPath, [RELAY, file, 'Open Sales'], {
      stdio: ['pipe', 'pipe', 'inherit']
    })
    cleanups.push(() => relay.kill())
    const answers: Array<(line: string) => void> = []
    createInterface({ input: relay.stdout }).on('line', (line) =>
      answers.shift()?.(line)
    )
    return {
      ask: (message: unknown) =>
        new Promise<Record<string, never>>((resolve) => {
          answers.push((line) => resolve(JSON.parse(line)))
          relay.stdin.write(`${JSON.stringify(message)}\n`)
        }),
      tell: (message: unknown) =>
        relay.stdin.write(`${JSON.stringify(message)}\n`)
    }
  }

  it('keeps the file to the person’s own account', async () => {
    const file = join(
      await mkdtemp(join(tmpdir(), 'mcp-')),
      'mcp-connection.json'
    )
    await writeFile(file, 'old', { mode: 0o644 })
    await writeConnectionFile(file, {
      url: 'http://127.0.0.1:1/mcp',
      token: 'secret'
    })
    if (process.platform !== 'win32')
      expect((await stat(file)).mode & 0o777).toBe(0o600)
  })

  it('passes an AI tool’s messages on to the app and back', async () => {
    const file = join(
      await mkdtemp(join(tmpdir(), 'mcp-')),
      'mcp-connection.json'
    )
    await startApp(file)
    const relay = startRelay(file)

    const started = await relay.ask(
      rpc('initialize', {
        protocolVersion: '2025-06-18',
        clientInfo: { name: 'claude-code' }
      })
    )
    expect(started).toMatchObject({
      id: 1,
      result: { protocolVersion: '2025-06-18' }
    })
    relay.tell(note('notifications/initialized'))

    const called = await relay.ask(
      rpc('tools/call', { name: 'say_hello', arguments: { name: 'Asha' } }, 2)
    )
    // The session carried over, so the app knows who is calling.
    expect(called).toMatchObject({
      id: 2,
      result: { content: [{ text: 'Hello Asha, from Claude Code' }] }
    })
  })

  it('says the app isn’t open rather than hanging', async () => {
    const file = join(
      await mkdtemp(join(tmpdir(), 'mcp-')),
      'mcp-connection.json'
    )
    const relay = startRelay(file)
    const reply = await relay.ask(rpc('tools/list', undefined, 7))
    expect(reply).toMatchObject({ id: 7, error: { code: -32000 } })
    expect(JSON.stringify(reply)).toContain('Open Sales isn’t open')
  })

  it('picks up the app’s new address and secret after a restart', async () => {
    const file = join(
      await mkdtemp(join(tmpdir(), 'mcp-')),
      'mcp-connection.json'
    )
    const first = await startApp(file)
    const relay = startRelay(file)
    expect(await relay.ask(rpc('ping'))).toMatchObject({ result: {} })

    await first.stop()
    expect(await relay.ask(rpc('ping', undefined, 2))).toMatchObject({
      error: { code: -32000 }
    })

    await startApp(file)
    expect(await relay.ask(rpc('ping', undefined, 3))).toMatchObject({
      id: 3,
      result: {}
    })
  })

  it('builds the command a person runs once, for each tool', () => {
    const commands = relayCommands({
      serverName: 'open-sales',
      appPath: '/Applications/Open Sales.app/Contents/MacOS/Open Sales',
      relayPath:
        '/Applications/Open Sales.app/Contents/Resources/stdio-relay.mjs',
      connectionPath:
        '/Users/asha/Library/Application Support/Open Sales/mcp-connection.json',
      productName: 'Open Sales',
      platform: 'darwin'
    })
    expect(commands['claude-code']).toBe(
      "claude mcp add --scope user open-sales -e ELECTRON_RUN_AS_NODE=1 -- '/Applications/Open Sales.app/Contents/MacOS/Open Sales' '/Applications/Open Sales.app/Contents/Resources/stdio-relay.mjs' '/Users/asha/Library/Application Support/Open Sales/mcp-connection.json' 'Open Sales'"
    )
    expect(commands.codex).toContain(
      'codex mcp add open-sales --env ELECTRON_RUN_AS_NODE=1 -- '
    )
  })
})
