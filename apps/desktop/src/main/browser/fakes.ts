import type { TApprovalStore } from './approvals'
import type { TTabHost, TTabPage } from './browser-controller'
import type { TCdp } from './cdp'

/* Pretend pages, hosts and stores for the tests. No Electron needed. */

type TCdpAnswers = Record<string, (params: never) => unknown>

/** A protocol connection that answers from a table and remembers what was sent. */
export const fakeCdp = (answers: TCdpAnswers = {}) => {
  const sent: Array<{ method: string; params: unknown }> = []
  const listeners = new Set<(method: string, params: unknown) => void>()
  let isCut = false
  const cdp: TCdp = {
    send: async (method, params) => {
      if (isCut) throw new Error('Debugger is not attached')
      sent.push({ method, params })
      const answer = answers[method]
      return (answer ? await answer(params as never) : {}) as never
    },
    onEvent: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
  return {
    cdp,
    sent,
    methods: () => sent.map((call) => call.method),
    emit: (method: string, params: unknown) => {
      for (const listener of [...listeners]) listener(method, params)
    },
    cut: () => {
      isCut = true
    },
    rejoin: () => {
      isCut = false
    }
  }
}

export type TFakeCdp = ReturnType<typeof fakeCdp>

/** A page that goes wherever it's told at once. */
export const fakePage = (answers: TCdpAnswers = {}) => {
  let url = ''
  const loaded: string[] = []
  const done: string[] = []
  const protocol = fakeCdp(answers)
  let isAiMode = false
  const page: TTabPage = {
    url: () => url,
    title: () => (url ? `Title of ${url}` : ''),
    isLoading: () => false,
    canGoBack: () => loaded.length > 1,
    canGoForward: () => false,
    load: (next) => {
      url = next
      loaded.push(next)
    },
    back: () => done.push('back'),
    forward: () => done.push('forward'),
    reload: () => done.push('reload'),
    stopLoading: () => done.push('stop-loading'),
    whenLoaded: async () => 'loaded',
    cdp: protocol.cdp,
    setAiMode: async (on) => {
      isAiMode = on
      if (on) protocol.rejoin()
      else protocol.cut()
      return true
    },
    screenshot: async () => ({ data: 'aGk=', mimeType: 'image/jpeg' }),
    download: (downloadUrl) => done.push(`download ${downloadUrl}`),
    close: () => done.push('close')
  }
  return {
    page,
    protocol,
    loaded,
    done,
    isAiMode: () => isAiMode,
    // The page moved by itself, as after a click.
    moveTo: (next: string) => {
      url = next
    }
  }
}

export type TFakePage = ReturnType<typeof fakePage>

export const fakeHost = (answers: TCdpAnswers = {}) => {
  const pages = new Map<string, TFakePage>()
  const shown: Array<string | null> = []
  const opened: string[] = []
  let attention = 0
  const host: TTabHost = {
    create: (tabId) => {
      const made = fakePage(answers)
      pages.set(tabId, made)
      return made.page
    },
    show: (tabId) => shown.push(tabId),
    openInDefaultBrowser: (url) => opened.push(url),
    askForAttention: () => {
      attention += 1
    }
  }
  return {
    host,
    pages,
    page: (tabId: string) => pages.get(tabId)!,
    shown,
    opened,
    attention: () => attention
  }
}

/** A store that keeps "always" answers in memory. */
export const fakeStore = (
  saved: string[] = [],
  canRemember = true
): TApprovalStore & { saved: () => string[] } => {
  let sites = saved
  return {
    load: async () => sites,
    save: async (next) => {
      sites = next
    },
    canRemember: () => canRemember,
    saved: () => sites
  }
}
