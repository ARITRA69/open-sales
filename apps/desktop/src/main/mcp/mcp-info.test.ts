import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { buildMcpInfo, firstSentence } from './mcp-info'
import { createToolRegistry, defineTool } from './tool-registry'

const tool = (name: string, description: string, readOnly?: boolean) =>
  defineTool({
    name,
    title: `Title of ${name}`,
    description,
    input: z.object({}),
    readOnly,
    run: async () => ({ text: '' })
  })

const COMMANDS = {
  'claude-code': 'claude mcp add open-sales',
  codex: 'codex mcp add open-sales'
}

const BROWSER = { title: 'Browser', about: 'Works in web pages.' }
const RECORDS = {
  title: 'Records',
  about: 'Reads accounts, people and deals.',
  more: { label: 'How proposals work', href: '#/today' }
}

describe('buildMcpInfo', () => {
  it('lists every tool under the part of the app that added it, in order', () => {
    const tools = createToolRegistry()
    tools.addGroup(
      BROWSER,
      tool('browser_read', 'Returns the text. Use `offset` for more.', true),
      tool('browser_click', 'Clicks an element by its ref.')
    )
    tools.addGroup(RECORDS, tool('records_find', 'Finds a record.', true))

    const info = buildMcpInfo({
      serverName: 'open-sales',
      commands: COMMANDS,
      connected: new Set(['Claude Code']),
      tools
    })

    expect(info).toEqual({
      serverName: 'open-sales',
      commands: COMMANDS,
      connected: ['Claude Code'],
      toolGroups: [
        {
          ...BROWSER,
          tools: [
            {
              name: 'browser_read',
              title: 'Title of browser_read',
              description: 'Returns the text.',
              readOnly: true
            },
            {
              name: 'browser_click',
              title: 'Title of browser_click',
              description: 'Clicks an element by its ref.',
              readOnly: false
            }
          ]
        },
        {
          ...RECORDS,
          tools: [
            {
              name: 'records_find',
              title: 'Title of records_find',
              description: 'Finds a record.',
              readOnly: true
            }
          ]
        }
      ]
    })
  })

  it('keeps a tool added by itself, under a group of its own', () => {
    const tools = createToolRegistry()
    tools.add(tool('ping', 'Answers.', true))

    const { toolGroups } = buildMcpInfo({
      serverName: 'open-sales',
      commands: COMMANDS,
      connected: [],
      tools
    })

    expect(toolGroups).toHaveLength(1)
    expect(toolGroups[0].title).toBe('Other tools')
    expect(toolGroups[0].tools.map((each) => each.name)).toEqual(['ping'])
  })

  it('says nothing yet when no part of the app has added tools', () => {
    expect(
      buildMcpInfo({
        serverName: 'open-sales',
        commands: COMMANDS,
        connected: [],
        tools: createToolRegistry()
      }).toolGroups
    ).toEqual([])
  })

  it('holds only what the page shows: no address, port or secret', () => {
    const tools = createToolRegistry()
    tools.addGroup(BROWSER, tool('browser_read', 'Returns the text.', true))
    const info = buildMcpInfo({
      serverName: 'open-sales',
      commands: COMMANDS,
      connected: [],
      tools
    })

    expect(Object.keys(info).sort()).toEqual([
      'commands',
      'connected',
      'serverName',
      'toolGroups'
    ])
    expect(JSON.stringify(info)).not.toMatch(/127\.0\.0\.1|token|Bearer/)
  })
})

describe('firstSentence', () => {
  it('keeps one line of a longer description', () => {
    expect(
      firstSentence(
        'Opens a web address in a new tab of yours and waits for it to load. If the person hasn’t allowed that site yet, they are asked first.'
      )
    ).toBe(
      'Opens a web address in a new tab of yours and waits for it to load.'
    )
    expect(firstSentence('Lists them, each as `ref role`. Then more.')).toBe(
      'Lists them, each as ref role.'
    )
  })

  it('doesn’t stop at a full stop inside a word or a number', () => {
    expect(firstSentence('Opens example.com, up to 2.5 MB. Then stops.')).toBe(
      'Opens example.com, up to 2.5 MB.'
    )
  })

  it('leaves a description with no full stop as it is', () => {
    expect(firstSentence('  Greets\n someone ')).toBe('Greets someone')
  })
})
