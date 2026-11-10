// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { TMcpBridge, TMcpInfo } from '../../../../../preload/bridge-types'
import { McpPage } from './mcp-page'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const CLAUDE_COMMAND =
  "claude mcp add --scope user open-sales -e ELECTRON_RUN_AS_NODE=1 -- '/Applications/Open Sales.app/Contents/MacOS/Open Sales'"
const CODEX_COMMAND =
  "codex mcp add open-sales --env ELECTRON_RUN_AS_NODE=1 -- '/Applications/Open Sales.app/Contents/MacOS/Open Sales'"

const INFO: TMcpInfo = {
  serverName: 'open-sales',
  commands: { 'claude-code': CLAUDE_COMMAND, codex: CODEX_COMMAND },
  connected: [],
  toolGroups: [
    {
      title: 'Browser',
      about: 'Works in web pages in the app’s browser.',
      more: {
        label: 'What AI may do in the browser',
        href: '#/browser/connect'
      },
      tools: [
        {
          name: 'browser_read',
          title: 'Read a page’s text',
          description: 'Returns the text a person would read on the page.',
          readOnly: true
        },
        {
          name: 'browser_click',
          title: 'Click something on a page',
          description: 'Clicks an element by its ref.',
          readOnly: false
        }
      ]
    },
    {
      title: 'Records',
      about: 'Reads accounts, people and deals.',
      tools: [
        {
          name: 'records_find',
          title: 'Find a record',
          description: 'Finds an account, person or deal by name.',
          readOnly: true
        }
      ]
    }
  ]
}

const show = async (info: Partial<TMcpInfo> = {}) => {
  const bridge: TMcpBridge = {
    getInfo: vi.fn(async () => ({ ...INFO, ...info }))
  }
  render(<McpPage bridge={bridge} />)
  // The commands arrive a moment after the page.
  await screen.findByText(CLAUDE_COMMAND)
  return bridge
}

const sectionOf = (title: string) =>
  screen.getByRole('heading', { name: new RegExp(`^${title}`) }).parentElement!
    .parentElement!

describe('the Connect AI page', () => {
  it('says the server is the app’s own, on this computer only', async () => {
    await show()

    expect(
      screen.getByRole('heading', { name: 'Connect your AI tool' })
    ).toBeTruthy()
    expect(screen.getByText(/on this computer only/)).toBeTruthy()
    // The name the AI tool lists it under, and nothing of where it listens.
    expect(screen.getByText('open-sales')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(
      /127\.0\.0\.1|localhost|:\d{4,5}/
    )
  })

  it('gives one command for each tool, with Copy', async () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    await show()

    expect(screen.getByText('Claude Code')).toBeTruthy()
    expect(screen.getByText('Codex')).toBeTruthy()
    expect(screen.getByText(CODEX_COMMAND)).toBeTruthy()

    const [copyClaude, copyCodex] = screen.getAllByRole('button', {
      name: 'Copy command'
    })
    fireEvent.click(copyCodex)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(CODEX_COMMAND))
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy()

    fireEvent.click(copyClaude)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(CLAUDE_COMMAND))
  })

  it('says to select the command where it can’t reach the clipboard', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('Write permission denied.')
    })
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    await show()

    fireEvent.click(screen.getAllByRole('button', { name: 'Copy command' })[0])

    expect(
      await screen.findByRole('button', { name: 'Select it to copy' })
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Copied' })).toBeNull()
  })

  it('says when no tool has connected, and what to do next', async () => {
    await show()
    expect(screen.getByRole('status').textContent).toMatch(
      /No AI tool has connected since you opened .+\. Start a new session/
    )
  })

  it('names the tools that have connected since the app opened', async () => {
    await show({ connected: ['Claude Code'] })
    expect(screen.getByRole('status').textContent).toMatch(
      /^Claude Code has connected since you opened/
    )
    cleanup()

    await show({ connected: ['Claude Code', 'Codex'] })
    expect(screen.getByRole('status').textContent).toMatch(
      /^Claude Code and Codex have connected since you opened/
    )
  })

  it('looks again when the person comes back from the terminal', async () => {
    const bridge = await show()
    vi.mocked(bridge.getInfo).mockResolvedValue({
      ...INFO,
      connected: ['Codex']
    })

    fireEvent.focus(window)

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toMatch(
        /^Codex has connected/
      )
    )
  })

  it('gives an example of what to ask', async () => {
    await show()
    expect(screen.getByText(/haldencapital\.com/)).toBeTruthy()
  })

  it('lists every tool under the part of the app it belongs to', async () => {
    await show()

    const browser = within(sectionOf('Browser'))
    expect(
      browser.getByText('Works in web pages in the app’s browser.')
    ).toBeTruthy()
    expect(browser.getByText('Read a page’s text')).toBeTruthy()
    expect(browser.getByText('browser_read')).toBeTruthy()
    expect(
      browser.getByText('Returns the text a person would read on the page.')
    ).toBeTruthy()
    expect(browser.getByText('browser_click')).toBeTruthy()
    expect(browser.queryByText('records_find')).toBeNull()
    // How many tools the group has, beside its name.
    expect(browser.getByText('2')).toBeTruthy()
    expect(
      browser
        .getByRole('link', { name: 'What AI may do in the browser' })
        .getAttribute('href')
    ).toBe('#/browser/connect')

    const records = within(sectionOf('Records'))
    expect(records.getByText('Find a record')).toBeTruthy()
    expect(records.getByText('1')).toBeTruthy()
    expect(records.queryByRole('link')).toBeNull()
  })

  it('says which tools only read and which can act', async () => {
    await show()
    const rowOf = (name: string) =>
      screen.getByText(name).closest<HTMLElement>('[data-slot="info-row"]')!

    expect(within(rowOf('browser_read')).getByText('Only reads')).toBeTruthy()
    expect(within(rowOf('browser_click')).getByText('Can act')).toBeTruthy()
    expect(within(rowOf('browser_click')).queryByText('Only reads')).toBeNull()
  })

  it('says so when the server offers nothing yet', async () => {
    await show({ toolGroups: [] })
    expect(screen.getByText('None yet.')).toBeTruthy()
  })

  it('asks for the desktop app where there’s no server to connect to', () => {
    render(<McpPage bridge={null} />)
    expect(screen.getByText('Open the desktop app to connect AI')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Copy command' })).toBeNull()
  })
})
