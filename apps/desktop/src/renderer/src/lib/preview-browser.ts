import type {
  TBrowserBridge,
  TBrowserState,
  TBrowserTab
} from '../../../preload/bridge-types'

/*
 * A pretend browser for the browser preview
 * (`?preview=signed-in#/browser`), where there are no real tabs. It starts
 * with three: one of the person's, one their AI tool is working in, and one
 * where AI is waiting to be allowed onto a site. Pages are drawn as simple
 * pictures; clicks on the buttons change the state as the real one would.
 */

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

const START: TBrowserState = {
  tabs: [
    tab({
      id: 't1',
      url: 'https://www.haldencapital.com/about',
      title: 'About us · Halden Capital',
      canGoBack: true
    }),
    tab({
      id: 't2',
      url: 'https://www.northwind.io/pricing',
      title: 'Pricing · Northwind',
      control: 'ai',
      aiName: 'Claude Code',
      isAiWorking: true
    }),
    tab({ id: 't3', control: 'ai', aiName: 'Claude Code' })
  ],
  activeTabId: 't2',
  questions: [
    { id: 'q1', aiName: 'Claude Code', site: 'linkedin.com', tabId: 't3' }
  ],
  heldDownloads: [],
  isAiPaused: false,
  pausedAiName: null
}

const titleOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

const toUrl = (typed: string) => {
  const text = typed.trim()
  if (/^https?:\/\//.test(text)) return text
  return /^[^\s]+\.[a-z]{2,}(\/.*)?$/i.test(text)
    ? `https://${text}`
    : `https://www.google.com/search?q=${encodeURIComponent(text)}`
}

const escapeXml = (text: string) =>
  text.replace(/[<>&"]/g, (character) => `&#${character.charCodeAt(0)};`)

/** A drawing of a page, standing in for the live one. Greys only. */
const pictureOf = (shown: TBrowserTab) => {
  const lines = [0, 1, 2, 3, 4, 5]
    .map(
      (index) =>
        `<rect x="64" y="${196 + index * 30}" width="${[620, 560, 600, 420, 580, 300][index]}" height="12" rx="6" fill="#ededed"/>`
    )
    .join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760">
    <rect width="1200" height="760" fill="#ffffff"/>
    <rect width="1200" height="64" fill="#f6f6f6"/>
    <rect x="64" y="24" width="120" height="16" rx="8" fill="#dedede"/>
    <rect x="900" y="24" width="60" height="16" rx="8" fill="#dedede"/>
    <rect x="980" y="24" width="60" height="16" rx="8" fill="#dedede"/>
    <rect x="1060" y="16" width="76" height="32" rx="16" fill="#1c1c1c"/>
    <text x="64" y="140" font-family="Inter, system-ui, sans-serif" font-size="34" font-weight="700" fill="#1c1c1c">${escapeXml(shown.title || titleOf(shown.url))}</text>
    <text x="64" y="170" font-family="Inter, system-ui, sans-serif" font-size="15" fill="#696969">${escapeXml(shown.url)}</text>
    ${lines}
    <rect x="64" y="410" width="330" height="200" rx="12" fill="#f6f6f6"/>
    <rect x="418" y="410" width="330" height="200" rx="12" fill="#f6f6f6"/>
    <rect x="772" y="410" width="330" height="200" rx="12" fill="#f6f6f6"/>
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

let shared: TBrowserBridge | null = null

/** The pretend browser, or null outside the preview. One per window. */
export const createPreviewBrowser = (search: string): TBrowserBridge | null => {
  if (!new URLSearchParams(search).has('preview')) return null
  if (shared) return shared

  let state = START
  let nextTab = 4
  const listeners = new Set<(next: TBrowserState) => void>()
  const allowed = new Map<string, 'always' | 'once' | 'blocked'>([
    ['northwind.io', 'always']
  ])

  const set = (next: TBrowserState) => {
    state = next
    for (const listener of [...listeners]) listener(state)
  }
  const patchTab = (tabId: string, patch: Partial<TBrowserTab>) =>
    set({
      ...state,
      tabs: state.tabs.map((each) =>
        each.id === tabId ? { ...each, ...patch } : each
      )
    })
  const go = (tabId: string, typed: string) => {
    const url = toUrl(typed)
    patchTab(tabId, {
      url,
      title: titleOf(url),
      isLoading: true,
      problem: null
    })
    setTimeout(
      () => patchTab(tabId, { isLoading: false, canGoBack: true }),
      600
    )
  }

  shared = {
    getState: async () => state,
    onStateChange: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    openTab: async (address) => {
      const id = `t${nextTab++}`
      set({ ...state, tabs: [...state.tabs, tab({ id })], activeTabId: id })
      if (address) go(id, address)
    },
    navigate: async (tabId, address) => go(tabId, address),
    actOnTab: async (tabId, action) => {
      switch (action) {
        case 'select':
          set({ ...state, activeTabId: tabId })
          break
        case 'close': {
          const tabs = state.tabs.filter((each) => each.id !== tabId)
          set({
            ...state,
            tabs,
            questions: state.questions.filter(
              (question) => question.tabId !== tabId
            ),
            activeTabId:
              state.activeTabId === tabId
                ? (tabs.at(-1)?.id ?? null)
                : state.activeTabId
          })
          break
        }
        case 'let-ai-use':
          set({ ...state, isAiPaused: false, pausedAiName: null })
          patchTab(tabId, { control: 'ai' })
          break
        case 'stop-ai':
          set({
            ...state,
            isAiPaused: true,
            questions: state.questions.filter(
              (question) => question.tabId !== tabId
            ),
            tabs: state.tabs.map(
              (each): TBrowserTab =>
                each.id === tabId
                  ? {
                      ...each,
                      control: 'person',
                      aiName: null,
                      isAiWorking: false
                    }
                  : { ...each, isAiWorking: false }
            )
          })
          break
        case 'reload':
          patchTab(tabId, { isLoading: true })
          setTimeout(() => patchTab(tabId, { isLoading: false }), 600)
          break
        case 'stop-loading':
          patchTab(tabId, { isLoading: false })
          break
        default:
          break
      }
    },
    answerQuestion: async (id, answer) => {
      const question = state.questions.find((each) => each.id === id)
      if (!question) return
      allowed.set(question.site, answer === 'no' ? 'blocked' : answer)
      set({
        ...state,
        questions: state.questions.filter((each) => each.id !== id)
      })
      if (answer === 'no') return
      patchTab(question.tabId, {
        url: `https://www.${question.site}/company/halden-capital`,
        title: `Halden Capital · ${question.site}`,
        isAiWorking: true
      })
    },
    resumeAi: async () =>
      set({ ...state, isAiPaused: false, pausedAiName: null }),
    resolveDownload: async (id) =>
      set({
        ...state,
        heldDownloads: state.heldDownloads.filter((held) => held.id !== id)
      }),
    setBounds: () => undefined,
    captureStill: async () => {
      const shown = state.tabs.find((each) => each.id === state.activeTabId)
      return shown?.url ? pictureOf(shown) : null
    },
    getConnectInfo: async () => ({
      serverName: 'open-sales',
      commands: {
        'claude-code':
          "claude mcp add --scope user open-sales -e ELECTRON_RUN_AS_NODE=1 -- '/Applications/Open Sales.app/Contents/MacOS/Open Sales' '/Applications/Open Sales.app/Contents/Resources/stdio-relay.mjs' '/Users/asha/Library/Application Support/Open Sales/mcp-connection.json' 'Open Sales'",
        codex:
          "codex mcp add open-sales --env ELECTRON_RUN_AS_NODE=1 -- '/Applications/Open Sales.app/Contents/MacOS/Open Sales' '/Applications/Open Sales.app/Contents/Resources/stdio-relay.mjs' '/Users/asha/Library/Application Support/Open Sales/mcp-connection.json' 'Open Sales'"
      },
      connected: ['Claude Code'],
      sites: [...allowed].map(([site, rule]) => ({ site, rule })),
      canRememberSites: true
    }),
    forgetSite: async (site) => {
      allowed.delete(site)
    }
  }
  return shared
}
