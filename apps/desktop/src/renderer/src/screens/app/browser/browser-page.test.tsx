// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  TBrowserBridge,
  TBrowserState,
  TBrowserTab
} from '../../../../../preload/bridge-types'
import { BrowserConnectPage } from './browser-connect-page'
import { BrowserTabs } from './browser-page'

afterEach(cleanup)

const tab = (
  overrides: Partial<TBrowserTab> & { id: string }
): TBrowserTab => ({
  url: '',
  title: '',
  favicon: null,
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
  control: 'person',
  aiName: null,
  isAiWorking: false,
  problem: null,
  note: null,
  ...overrides
})

const makeBridge = (): TBrowserBridge => ({
  getState: vi.fn(),
  onStateChange: vi.fn(() => () => undefined),
  openTab: vi.fn(async () => undefined),
  navigate: vi.fn(async () => undefined),
  actOnTab: vi.fn(async () => undefined),
  answerQuestion: vi.fn(async () => undefined),
  resumeAi: vi.fn(async () => undefined),
  resolveDownload: vi.fn(async () => undefined),
  setBounds: vi.fn(),
  captureStill: vi.fn(async () => null),
  getConnectInfo: vi.fn(),
  forgetSite: vi.fn(async () => undefined)
})

const show = (state: Partial<TBrowserState>) => {
  const bridge = makeBridge()
  render(
    <BrowserTabs
      bridge={bridge}
      hasLiveTabs={false}
      state={{
        tabs: [],
        activeTabId: null,
        questions: [],
        heldDownloads: [],
        isAiPaused: false,
        pausedAiName: null,
        ...state
      }}
    />
  )
  return bridge
}

const MINE = tab({
  id: 't1',
  url: 'https://halden.com/about',
  title: 'About · Halden'
})
const AIS = tab({
  id: 't2',
  url: 'https://northwind.io/pricing',
  title: 'Pricing',
  control: 'ai',
  aiName: 'Claude Code'
})

describe('the Browser page', () => {
  it('goes to what is typed in the address box', () => {
    const bridge = show({ tabs: [MINE], activeTabId: 't1' })
    const address = screen.getByLabelText('Address')

    fireEvent.focus(address)
    fireEvent.change(address, { target: { value: 'northwind pricing' } })
    fireEvent.submit(address)

    expect(bridge.navigate).toHaveBeenCalledWith('t1', 'northwind pricing')
  })

  it('offers to hand the person’s own tab to AI, and to open it elsewhere', () => {
    const bridge = show({ tabs: [MINE], activeTabId: 't1' })

    fireEvent.click(screen.getByRole('button', { name: 'Let AI use this tab' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open in my browser' }))

    expect(bridge.actOnTab).toHaveBeenCalledWith('t1', 'let-ai-use')
    expect(bridge.actOnTab).toHaveBeenCalledWith(
      't1',
      'open-in-default-browser'
    )
    // Nothing says AI is here.
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
  })

  it('says which tool is using a tab, with Stop', () => {
    const bridge = show({ tabs: [MINE, AIS], activeTabId: 't2' })

    expect(screen.getByText('Claude Code')).toBeTruthy()
    expect(screen.getByText('is using this tab.')).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'Let AI use this tab' })
    ).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(bridge.actOnTab).toHaveBeenCalledWith('t2', 'stop-ai')
  })

  it('asks before AI uses a site: once, always or no', () => {
    const bridge = show({
      tabs: [AIS],
      activeTabId: 't2',
      questions: [
        { id: 'q1', aiName: 'Claude Code', site: 'linkedin.com', tabId: 't2' }
      ]
    })
    expect(screen.getByText('linkedin.com')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Allow once' }))
    fireEvent.click(screen.getByRole('button', { name: 'Always allow' }))
    fireEvent.click(screen.getByRole('button', { name: 'Don’t allow' }))

    expect(bridge.answerQuestion).toHaveBeenNthCalledWith(1, 'q1', 'once')
    expect(bridge.answerQuestion).toHaveBeenNthCalledWith(2, 'q1', 'always')
    expect(bridge.answerQuestion).toHaveBeenNthCalledWith(3, 'q1', 'no')
  })

  it('shows a question about another tab, with a way to it', () => {
    const bridge = show({
      tabs: [MINE, AIS],
      activeTabId: 't1',
      questions: [
        { id: 'q1', aiName: 'Codex', site: 'linkedin.com', tabId: 't2' }
      ]
    })

    fireEvent.click(screen.getByRole('button', { name: 'another tab' }))
    expect(bridge.actOnTab).toHaveBeenCalledWith('t2', 'select')
  })

  it('says AI is stopped until the person lets it carry on', () => {
    const bridge = show({
      tabs: [MINE],
      activeTabId: 't1',
      isAiPaused: true,
      pausedAiName: 'Codex'
    })
    expect(screen.getByText(/wants to carry on/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Let AI carry on' }))
    expect(bridge.resumeAi).toHaveBeenCalled()
  })

  it('holds a download AI started until the person fetches it', () => {
    const bridge = show({
      tabs: [AIS],
      activeTabId: 't2',
      heldDownloads: [
        { id: 'd1', tabId: 't2', fileName: 'report.pdf', site: 'northwind.io' }
      ]
    })
    expect(screen.getByText('report.pdf')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    expect(bridge.resolveDownload).toHaveBeenCalledWith('d1', 'download')
  })

  it('shows why a page didn’t load, and tries again', () => {
    const bridge = show({
      tabs: [
        { ...MINE, problem: 'This page didn’t load (ERR_NAME_NOT_RESOLVED).' }
      ],
      activeTabId: 't1'
    })
    expect(screen.getByText(/ERR_NAME_NOT_RESOLVED/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(bridge.actOnTab).toHaveBeenCalledWith('t1', 'reload')
  })

  it('starts empty, with a way to open a tab and to connect AI', () => {
    const bridge = show({})
    expect(screen.getByText('No tabs open')).toBeTruthy()
    // Connecting is the app's own page; the browser keeps only its rules.
    for (const link of screen.getAllByRole('link', { name: 'Connect AI' })) {
      expect(link.getAttribute('href')).toBe('#/mcp')
    }
    expect(
      screen
        .getByRole('link', { name: 'What AI may do here' })
        .getAttribute('href')
    ).toBe('#/browser/connect')

    fireEvent.click(screen.getAllByRole('button', { name: 'New tab' })[0])
    expect(bridge.openTab).toHaveBeenCalled()
  })

  it('never places a live page while it has none to show', () => {
    const bridge = show({ tabs: [tab({ id: 't1' })], activeTabId: 't1' })
    expect(bridge.setBounds).not.toHaveBeenCalled()
  })
})

describe('Browser › AI in the browser', () => {
  const showRules = (
    info: Awaited<ReturnType<TBrowserBridge['getConnectInfo']>>
  ) => {
    const bridge = makeBridge()
    vi.mocked(bridge.getConnectInfo).mockResolvedValue(info)
    render(<BrowserConnectPage bridge={bridge} />)
    return bridge
  }

  it('holds the browser’s own rules and sites, and sends connecting to its page', async () => {
    showRules({
      sites: [{ site: 'northwind.io', rule: 'always' }],
      canRememberSites: true
    })

    expect(
      screen.getByRole('heading', { name: 'AI in the browser' })
    ).toBeTruthy()
    expect(screen.getByText('What happens when AI browses')).toBeTruthy()
    expect(await screen.findByText('northwind.io')).toBeTruthy()
    expect(screen.getByText('Always allowed')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'Connect AI' }).getAttribute('href')
    ).toBe('#/mcp')

    // Nothing about connecting a tool is left here.
    expect(screen.queryByText(/mcp add/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy command' })).toBeNull()
    expect(screen.queryByText(/connected since/)).toBeNull()
  })

  it('forgets a site, so the person is asked again', async () => {
    const bridge = showRules({
      sites: [{ site: 'linkedin.com', rule: 'blocked' }],
      canRememberSites: true
    })
    await screen.findByText('linkedin.com')
    vi.mocked(bridge.getConnectInfo).mockResolvedValue({
      sites: [],
      canRememberSites: true
    })

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() =>
      expect(bridge.forgetSite).toHaveBeenCalledWith('linkedin.com')
    )
    expect(await screen.findByText(/None yet/)).toBeTruthy()
  })

  it('says “always” won’t last where there’s no keychain', async () => {
    showRules({ sites: [], canRememberSites: false })
    expect(await screen.findByText(/no keychain/)).toBeTruthy()
  })
})
