import type {
  TBrowserAnswer,
  TBrowserHeldDownload,
  TBrowserState,
  TBrowserTab,
  TBrowserTabAction
} from '../../preload/bridge-types'
import type { TApprovals } from './approvals'
import type { TCdp } from './cdp'
import { StoppedError, ToolError } from './fence'
import { isWebUrl, siteOf, toAddress } from './site'

/*
 * The browser's rules, with no Electron in it. It knows whose each tab is
 * (the person's, or their AI tool's), lets AI work only in its own tabs and
 * only on sites the person has allowed, and makes Stop take effect at once.
 * The pages themselves come from a host: real views in the app, fakes in
 * tests.
 */

/** One tab's page, as the controller drives it. */
export type TTabPage = {
  url: () => string
  title: () => string
  isLoading: () => boolean
  canGoBack: () => boolean
  canGoForward: () => boolean
  load: (url: string) => void
  back: () => void
  forward: () => void
  reload: () => void
  stopLoading: () => void
  // Settles when the page has stopped loading, or after `ms`.
  whenLoaded: (ms: number) => Promise<'loaded' | 'still-loading'>
  cdp: TCdp
  // Connects AI's controls to the page, or lets go of them. False when
  // something else holds the page (DevTools, say).
  setAiMode: (on: boolean) => Promise<boolean>
  // A picture of the page as it is now, with `masks` painted over.
  screenshot: (
    masks?: TMask[]
  ) => Promise<{ data: string; mimeType: string } | null>
  download: (url: string) => void
  close: () => void
}

/** A part of the page to paint over, as fractions of its width and height. */
export type TMask = { x: number; y: number; width: number; height: number }

/** What makes and shows pages. */
export type TTabHost = {
  create: (tabId: string) => TTabPage
  // Which tab is in front. Null when there are none.
  show: (tabId: string | null) => void
  openInDefaultBrowser: (url: string) => void
  // Draws the person's eye when the app isn't in front.
  askForAttention: () => void
}

/** What a page did, as its host reports it. */
export type TPageEvent =
  // Its address, title or loading state changed.
  | { type: 'changed' }
  // It went to another document: old element references are dead.
  | { type: 'navigated' }
  | { type: 'favicon'; url: string | null }
  | { type: 'failed'; message: string }
  | { type: 'crashed' }
  // AI's controls dropped off without being asked to.
  | { type: 'ai-disconnected' }
  | { type: 'closed' }

/** The names AI knows a page's elements by: `e12` and the like. */
export type TRefs = {
  byNode: Map<number, string>
  byRef: Map<string, number>
  next: number
}

const newRefs = (): TRefs => ({ byNode: new Map(), byRef: new Map(), next: 1 })

type TTab = {
  id: string
  page: TTabPage
  control: 'person' | 'ai'
  aiName: string | null
  // Goes up when AI loses the tab, so a call already running can tell.
  epoch: number
  isClosed: boolean
  // AI's calls on one tab run one after another.
  queue: Promise<unknown>
  working: number
  lastAiActionAt: number
  isArmed: boolean
  favicon: string | null
  problem: string | null
  note: string | null
  // Things that happened that AI should hear about on its next answer.
  aiNotes: string[]
  refs: TRefs
}

/** What a tool gets to work with once the checks have passed. */
export type TAiTab = {
  id: string
  page: TTabPage
  cdp: TCdp
  refs: TRefs
  // Throws if the person has stopped AI since the call began. Call it before
  // each thing that changes the page, and before handing anything back.
  check: () => void
  // Asks the person, if needed, before AI goes to this address. If they
  // haven't answered when the call gives up waiting, `whenAllowedLater` runs
  // once they say yes.
  requireSite: (url: string, whenAllowedLater?: () => void) => Promise<void>
  // Connects AI's controls to the page, once it has one. Calls that start
  // from an empty tab and go somewhere use this after the page arrives.
  ready: () => Promise<void>
  // Why the page isn't showing, if it failed to load or crashed.
  problem: () => string | null
  // Whether the person has allowed AI on the site this address belongs to.
  isSiteAllowed: (url: string) => boolean
  // Things the page did that AI should be told, such as a box it showed.
  takeNotes: () => string[]
  addNote: (forAi: string, forPerson?: string) => void
}

type TControllerOptions = {
  host: TTabHost
  approvals: TApprovals
  onChange?: () => void
  now?: () => number
  // Sets up a page AI has just been connected to. Passed in by the app.
  armPage?: (tab: TAiTab) => Promise<void>
}

// A page load or download this soon after AI acted counts as AI's doing.
const AI_ACTION_WINDOW_MS = 3000
const MAX_AI_TABS = 8
const LOAD_WAIT_MS = 15_000

const PAUSED_MESSAGE =
  'The person pressed Stop. Do nothing more in the browser until they tell you to carry on; they also have to press "Let AI carry on" in the app.'

export const createBrowserController = ({
  host,
  approvals,
  onChange = () => undefined,
  now = () => Date.now(),
  armPage = async () => undefined
}: TControllerOptions) => {
  const tabs = new Map<string, TTab>()
  let order: string[] = []
  let activeTabId: string | null = null
  let nextTabId = 1
  let heldDownloads: Array<TBrowserHeldDownload & { url: string }> = []
  let nextDownloadId = 1
  // Downloads the person said yes to, which must not be held a second time.
  const approvedDownloads = new Set<string>()

  const emit = () => onChange()

  const isAiActing = (tab: TTab) =>
    tab.working > 0 || now() - tab.lastAiActionAt < AI_ACTION_WINDOW_MS

  const select = (tabId: string | null) => {
    activeTabId = tabId
    host.show(tabId)
  }

  const createTab = (control: 'person' | 'ai', aiName: string | null) => {
    const id = `t${nextTabId++}`
    const tab: TTab = {
      id,
      page: host.create(id),
      control,
      aiName,
      epoch: 0,
      isClosed: false,
      queue: Promise.resolve(),
      working: 0,
      lastAiActionAt: 0,
      isArmed: false,
      favicon: null,
      problem: null,
      note: null,
      aiNotes: [],
      refs: newRefs()
    }
    tabs.set(id, tab)
    order.push(id)
    return tab
  }

  const releaseAi = async (tab: TTab) => {
    tab.epoch += 1
    tab.isArmed = false
    await tab.page.setAiMode(false)
  }

  const closeTab = (tabId: string) => {
    const tab = tabs.get(tabId)
    if (!tab) return
    tab.isClosed = true
    tab.epoch += 1
    tabs.delete(tabId)
    const index = order.indexOf(tabId)
    order = order.filter((id) => id !== tabId)
    heldDownloads = heldDownloads.filter((held) => held.tabId !== tabId)
    approvals.forgetTab(tabId)
    tab.page.close()
    if (activeTabId === tabId) {
      select(order[Math.min(index, order.length - 1)] ?? null)
    }
    emit()
  }

  /** Stop: the tab is the person's again and AI is paused, at once. */
  const stopAi = (tabId: string) => {
    const stopped = tabs.get(tabId)
    if (!stopped) return
    approvals.pause()
    // Every call AI has running ends here, in whichever tab it is.
    for (const tab of tabs.values()) {
      if (tab.control !== 'ai') continue
      void releaseAi(tab)
      tab.page.stopLoading()
    }
    stopped.control = 'person'
    stopped.aiName = null
    stopped.note = null
    heldDownloads = heldDownloads.filter((held) => held.tabId !== tabId)
    approvals.forgetTab(tabId)
    emit()
  }

  const load = (tab: TTab, url: string) => {
    tab.problem = null
    tab.note = null
    tab.page.load(url)
    emit()
  }

  // ───────────────────────── The person ─────────────────────────

  const openTab = (typed?: string) => {
    const tab = createTab('person', null)
    select(tab.id)
    const url = typed ? toAddress(typed) : null
    if (url) load(tab, url)
    emit()
  }

  const navigate = (tabId: string, typed: string) => {
    const tab = tabs.get(tabId)
    const url = toAddress(typed)
    if (tab && url) load(tab, url)
  }

  const actOnTab = (tabId: string, action: TBrowserTabAction) => {
    const tab = tabs.get(tabId)
    if (!tab) return
    switch (action) {
      case 'select':
        select(tabId)
        break
      case 'close':
        closeTab(tabId)
        return
      case 'back':
        tab.page.back()
        break
      case 'forward':
        tab.page.forward()
        break
      case 'reload':
        tab.problem = null
        tab.page.reload()
        break
      case 'stop-loading':
        tab.page.stopLoading()
        break
      case 'open-in-default-browser':
        if (isWebUrl(tab.page.url())) host.openInDefaultBrowser(tab.page.url())
        break
      case 'let-ai-use': {
        tab.control = 'ai'
        tab.aiName = null
        // Handing a tab over is a yes to AI working again, and to the page
        // it's on: asking about that site straight after would be noise.
        approvals.resume()
        const site = siteOf(tab.page.url())
        if (site) approvals.allowOnce(tabId, site)
        break
      }
      case 'stop-ai':
        stopAi(tabId)
        return
    }
    emit()
  }

  const resolveDownload = (id: string, action: 'download' | 'dismiss') => {
    const held = heldDownloads.find((download) => download.id === id)
    if (!held) return
    heldDownloads = heldDownloads.filter((download) => download.id !== id)
    if (action === 'download') {
      approvedDownloads.add(held.url)
      tabs.get(held.tabId)?.page.download(held.url)
    }
    emit()
  }

  const toTab = (tab: TTab): TBrowserTab => ({
    id: tab.id,
    url: isWebUrl(tab.page.url()) ? tab.page.url() : '',
    title: tab.page.title(),
    favicon: tab.favicon,
    isLoading: tab.page.isLoading(),
    canGoBack: tab.page.canGoBack(),
    canGoForward: tab.page.canGoForward(),
    control: tab.control,
    aiName: tab.aiName,
    isAiWorking: tab.working > 0,
    problem: tab.problem,
    note: tab.note
  })

  const getState = (): TBrowserState => ({
    tabs: order.map((id) => toTab(tabs.get(id)!)),
    activeTabId,
    questions: approvals.questions(),
    heldDownloads: heldDownloads.map(({ id, tabId, fileName, site }) => ({
      id,
      tabId,
      fileName,
      site
    })),
    isAiPaused: approvals.isPaused(),
    pausedAiName: approvals.pausedAiName()
  })

  // ───────────────────── What pages report ─────────────────────

  const handlePageEvent = (tabId: string, event: TPageEvent) => {
    const tab = tabs.get(tabId)
    if (!tab) return
    switch (event.type) {
      case 'navigated':
        tab.refs = newRefs()
        tab.problem = null
        break
      case 'favicon':
        tab.favicon = event.url
        break
      case 'failed':
        tab.problem = event.message
        break
      case 'crashed':
        tab.problem = 'This page stopped working. Reload it to try again.'
        tab.refs = newRefs()
        tab.isArmed = false
        tab.epoch += 1
        break
      case 'ai-disconnected':
        // Something else took the page (DevTools). Calls running now end.
        tab.isArmed = false
        tab.epoch += 1
        break
      case 'closed':
        closeTab(tabId)
        return
      case 'changed':
        break
    }
    emit()
  }

  /**
   * Whether to hold back a page load. AI's tab may not move to a site the
   * person hasn't allowed because of something AI just did; they're asked,
   * and it goes there if they say yes.
   */
  const shouldHoldNavigation = (tabId: string, url: string): boolean => {
    const tab = tabs.get(tabId)
    if (!tab) return false
    if (!isWebUrl(url)) return true
    if (tab.control !== 'ai' || !isAiActing(tab)) return false
    const site = siteOf(url)
    if (!site || approvals.isAllowed(tabId, site)) return false

    const aiName = tab.aiName ?? 'AI'
    tab.aiNotes.push(
      `The page tried to go to ${site}, which the person hasn’t allowed yet. It was held and they have been asked. If they say yes the page goes there by itself: wait a little, then read the tab again.`
    )
    approvals.hold(tabId, site, aiName, () => {
      if (!tab.isClosed) load(tab, url)
    })
    host.askForAttention()
    return true
  }

  /** A page asked for a new window: it becomes a tab, under the same rules. */
  const handlePopup = (openerId: string, url: string) => {
    const opener = tabs.get(openerId)
    if (!opener || !isWebUrl(url)) return

    if (opener.control !== 'ai') {
      const tab = createTab('person', null)
      select(tab.id)
      load(tab, url)
      return
    }

    const site = siteOf(url)
    if (!site) return
    const aiTabCount = [...tabs.values()].filter(
      (tab) => tab.control === 'ai'
    ).length
    if (aiTabCount >= MAX_AI_TABS) {
      opener.aiNotes.push(
        'The page tried to open another tab, but AI already has as many as it may.'
      )
      return
    }
    const openForAi = (answer: 'once' | 'always') => {
      if (opener.isClosed || opener.control !== 'ai') return
      const tab = createTab('ai', opener.aiName)
      if (answer === 'once') approvals.allowOnce(tab.id, site)
      opener.aiNotes.push(`The page opened a new tab: ${tab.id}.`)
      load(tab, url)
    }

    if (approvals.isAllowed(openerId, site)) {
      // The new tab keeps whichever answer its opener had.
      openForAi('once')
      return
    }
    opener.aiNotes.push(
      `The page tried to open ${site} in a new tab, which the person hasn’t allowed yet. They have been asked.`
    )
    approvals.hold(openerId, site, opener.aiName ?? 'AI', openForAi)
    host.askForAttention()
    emit()
  }

  /**
   * Whether to hold back a download. One that AI set off waits for the
   * person; their own go to the system's Save box as usual.
   */
  const shouldHoldDownload = (
    tabId: string,
    download: { url: string; fileName: string }
  ): boolean => {
    const tab = tabs.get(tabId)
    if (!tab) return false
    if (approvedDownloads.delete(download.url)) return false
    if (tab.control !== 'ai' || !isAiActing(tab)) return false

    heldDownloads.push({
      id: `d${nextDownloadId++}`,
      tabId,
      url: download.url,
      fileName: download.fileName,
      site: siteOf(download.url) ?? siteOf(tab.page.url()) ?? 'this page'
    })
    tab.aiNotes.push(
      'A download started and was held. Only the person can let a download through; tell them it’s waiting in the app.'
    )
    host.askForAttention()
    emit()
    return true
  }

  // ───────────────────────────── AI ─────────────────────────────

  const refusePaused = (aiName: string) => {
    if (!approvals.isPaused()) return
    approvals.notePausedAttempt(aiName)
    host.askForAttention()
    throw new ToolError(PAUSED_MESSAGE)
  }

  const aiTabOrThrow = (tabId: string) => {
    const tab = tabs.get(tabId)
    // One answer for "no such tab" and "not yours", so AI learns nothing
    // about the person's own tabs.
    if (!tab || tab.control !== 'ai') {
      throw new ToolError(
        `There’s no tab ${tabId} that AI can use. Use browser_tabs to see yours, or browser_open for a new one. The person’s own tabs are theirs unless they hand one over.`
      )
    }
    return tab
  }

  const requireSite = async (
    tab: TTab,
    url: string,
    aiName: string,
    whenAllowedLater?: () => void
  ) => {
    const site = siteOf(url)
    // An empty new tab has no site to ask about.
    if (!site) return
    if (!approvals.isAllowed(tab.id, site)) host.askForAttention()
    const result = await approvals.ask(tab.id, site, aiName)
    if (result === 'allowed') return
    if (result === 'refused') {
      throw new ToolError(
        `The person hasn’t allowed AI to use ${site}. Don’t look for another way to it; tell them.`
      )
    }
    if (whenAllowedLater) {
      approvals.hold(tab.id, site, aiName, () => {
        if (!tab.isClosed && tab.control === 'ai') whenAllowedLater()
      })
    }
    throw new ToolError(
      `The app is asking the person whether AI may use ${site}, and they haven’t answered yet. Ask them to answer in the app’s Browser page, then try again.`
    )
  }

  /**
   * Runs one of AI's calls on a tab, after every check: AI isn't paused, the
   * tab is AI's, the site is allowed. Calls on one tab run in turn.
   */
  const withAiTab = <TResult>(
    aiName: string,
    tabId: string,
    run: (tab: TAiTab) => Promise<TResult>,
    // False for a call that takes the tab somewhere itself: it asks about
    // the site it's going to, and the tab may still be empty.
    { needsPage = true }: { needsPage?: boolean } = {}
  ): Promise<TResult> => {
    refusePaused(aiName)
    const tab = aiTabOrThrow(tabId)

    const call = async () => {
      // Things may have changed while this call waited its turn.
      refusePaused(aiName)
      if (tab.isClosed) throw new ToolError(`Tab ${tabId} was closed.`)
      if (tab.control !== 'ai') throw new StoppedError()

      const epoch = tab.epoch
      const check = () => {
        if (tab.isClosed) throw new ToolError(`Tab ${tabId} was closed.`)
        if (tab.epoch !== epoch) throw new StoppedError()
      }
      // A page that has never gone anywhere can't be driven: commands sent
      // to it wait for ever. So AI's controls connect once there is a page.
      const ready = async () => {
        if (tab.isArmed) return
        if (!isWebUrl(tab.page.url())) {
          throw new ToolError(
            `Tab ${tabId} is empty. Take it somewhere first with browser_navigate.`
          )
        }
        if (!(await tab.page.setAiMode(true))) {
          throw new ToolError(
            'AI can’t use this tab while its developer tools are open.'
          )
        }
        check()
        await armPage(aiTab)
        tab.isArmed = true
      }
      const aiTab: TAiTab = {
        id: tab.id,
        page: tab.page,
        cdp: tab.page.cdp,
        ready,
        problem: () => tab.problem,
        get refs() {
          return tab.refs
        },
        check,
        requireSite: async (url, whenAllowedLater) => {
          await requireSite(tab, url, aiName, whenAllowedLater)
          check()
        },
        isSiteAllowed: (url) => {
          const site = siteOf(url)
          return !site || approvals.isAllowed(tab.id, site)
        },
        takeNotes: () => tab.aiNotes.splice(0),
        addNote: (forAi, forPerson) => {
          tab.aiNotes.push(forAi)
          if (forPerson) tab.note = forPerson
          emit()
        }
      }

      tab.aiName = aiName
      tab.working += 1
      emit()
      try {
        if (needsPage) {
          await aiTab.requireSite(tab.page.url())
          await ready()
        }
        check()
        const result = await run(aiTab)
        check()
        return result
      } catch (error) {
        // A stop cuts the page's connection, which surfaces as some other
        // failure. Whatever it was, the truth is that the person stopped it.
        if (tab.isClosed) throw new ToolError(`Tab ${tabId} was closed.`)
        if (tab.epoch !== epoch) throw new StoppedError()
        throw error
      } finally {
        tab.working -= 1
        tab.lastAiActionAt = now()
        emit()
      }
    }

    const result = tab.queue.then(call, call)
    tab.queue = result.catch(() => undefined)
    return result
  }

  /** A new tab for AI. It goes nowhere until the person has allowed the site. */
  const openForAi = async (aiName: string, url: string) => {
    refusePaused(aiName)
    const aiTabCount = [...tabs.values()].filter(
      (tab) => tab.control === 'ai'
    ).length
    if (aiTabCount >= MAX_AI_TABS) {
      throw new ToolError(
        `AI already has ${MAX_AI_TABS} tabs open. Close one with browser_close first.`
      )
    }
    const tab = createTab('ai', aiName)
    // It comes to the front only if the person isn't looking at a page.
    const active = activeTabId ? tabs.get(activeTabId) : null
    if (!active || !isWebUrl(active.page.url())) select(tab.id)
    emit()

    try {
      const loadState = await withAiTab(
        aiName,
        tab.id,
        async (aiTab) => {
          await aiTab.requireSite(url, () => load(tab, url))
          load(tab, url)
          const loadState = await tab.page.whenLoaded(LOAD_WAIT_MS)
          if (isWebUrl(tab.page.url())) await aiTab.ready()
          return loadState
        },
        { needsPage: false }
      )
      return { tabId: tab.id, loadState }
    } catch (error) {
      // Still waiting for an answer: the tab stays, so the question has
      // somewhere to live and AI can try again in it.
      const isWaiting = approvals
        .questions()
        .some((question) => question.tabId === tab.id)
      if (!isWaiting && !tab.isClosed) closeTab(tab.id)
      if (isWaiting && error instanceof ToolError) {
        throw new ToolError(
          `${error.message} The new tab is ${tab.id}: the page loads there once they say yes.`
        )
      }
      throw error
    }
  }

  const closeForAi = (aiName: string, tabId: string) => {
    refusePaused(aiName)
    aiTabOrThrow(tabId)
    closeTab(tabId)
  }

  /** AI's own tabs, and only a count of the rest. */
  const listForAi = (aiName: string) => {
    refusePaused(aiName)
    const all = order.map((id) => tabs.get(id)!)
    const mine = all.filter((tab) => tab.control === 'ai')
    return {
      tabs: mine.map((tab) => ({
        id: tab.id,
        url: tab.page.url(),
        title: tab.page.title(),
        isLoading: tab.page.isLoading(),
        isAllowed: (() => {
          const site = siteOf(tab.page.url())
          return !site || approvals.isAllowed(tab.id, site)
        })()
      })),
      otherTabCount: all.length - mine.length
    }
  }

  return {
    // The person
    getState,
    openTab,
    navigate,
    actOnTab,
    answerQuestion: (id: string, answer: TBrowserAnswer) =>
      approvals.answer(id, answer),
    resumeAi: () => approvals.resume(),
    resolveDownload,
    activeTab: () => (activeTabId ? tabs.get(activeTabId)?.page : null) ?? null,
    closeAll: () => {
      for (const id of [...order]) closeTab(id)
    },
    // Pages
    handlePageEvent,
    shouldHoldNavigation,
    handlePopup,
    shouldHoldDownload,
    // AI
    withAiTab,
    openForAi,
    closeForAi,
    listForAi
  }
}

export type TBrowserController = ReturnType<typeof createBrowserController>
