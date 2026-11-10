import type {
  TBrowserAnswer,
  TBrowserQuestion,
  TBrowserSite
} from '../../preload/bridge-types'

/*
 * Which sites the person's AI tool may use, and the questions waiting for an
 * answer. AI changes nothing without a yes: the first time it goes to, reads
 * or acts on a site, the person is asked once (this tab only, always for this
 * site, or no). Pressing Stop pauses AI altogether until they let it carry on.
 */

/** Where "always" answers are kept between launches. */
export type TApprovalStore = {
  load: () => Promise<string[]>
  save: (sites: string[]) => Promise<void>
  // False where nothing can be kept safely: "always" then lasts this launch.
  canRemember: () => boolean
}

export type TAskResult = 'allowed' | 'refused' | 'waiting'

type TPending = {
  question: TBrowserQuestion
  waiters: Set<(result: TAskResult) => void>
  // Runs on a yes, with what was answered: a held page load, for instance.
  onAllow: Array<(answer: 'once' | 'always') => void>
}

type TApprovalsOptions = {
  store: TApprovalStore
  // How long a call waits for the person before telling AI to try again.
  // AI tools give up on a call after about a minute, so this stays under it.
  waitMs?: number
  onChange?: () => void
}

const keyOf = (tabId: string, site: string) => `${tabId}\n${site}`

export const createApprovals = ({
  store,
  waitMs = 45_000,
  onChange = () => undefined
}: TApprovalsOptions) => {
  const always = new Set<string>()
  // "Allow once": this tab and this site, until the tab closes or the app quits.
  const once = new Set<string>()
  // "Don't allow": refused without asking again until the app quits.
  const blocked = new Set<string>()
  const pending = new Map<string, TPending>()
  let nextId = 1
  let isPaused = false
  let pausedAiName: string | null = null

  const loaded = store.load().then((sites) => {
    for (const site of sites) always.add(site)
    onChange()
  })

  const isAllowed = (tabId: string, site: string) =>
    always.has(site) || once.has(keyOf(tabId, site))

  const raise = (tabId: string, site: string, aiName: string) => {
    const key = keyOf(tabId, site)
    const existing = pending.get(key)
    if (existing) return existing
    const entry: TPending = {
      question: { id: `q${nextId++}`, aiName, site, tabId },
      waiters: new Set(),
      onAllow: []
    }
    pending.set(key, entry)
    onChange()
    return entry
  }

  /**
   * Whether AI may use this site in this tab, asking the person if they
   * haven't said. `waiting` means they haven't answered yet: the question
   * stays on screen and AI should try again.
   */
  const ask = async (
    tabId: string,
    site: string,
    aiName: string
  ): Promise<TAskResult> => {
    await loaded
    if (isAllowed(tabId, site)) return 'allowed'
    if (blocked.has(site)) return 'refused'

    const entry = raise(tabId, site, aiName)
    return new Promise<TAskResult>((resolve) => {
      const settle = (result: TAskResult) => {
        clearTimeout(timer)
        entry.waiters.delete(settle)
        resolve(result)
      }
      const timer = setTimeout(() => settle('waiting'), waitMs)
      entry.waiters.add(settle)
    })
  }

  /**
   * Asks without waiting, for something already held back (a page load or a
   * pop-up AI set off). `onAllow` runs if the person says yes.
   */
  const hold = (
    tabId: string,
    site: string,
    aiName: string,
    onAllow: (answer: 'once' | 'always') => void
  ) => {
    if (blocked.has(site)) return
    raise(tabId, site, aiName).onAllow.push(onAllow)
  }

  const persist = () => void store.save([...always].sort())

  const answer = (questionId: string, reply: TBrowserAnswer) => {
    const found = [...pending].find(
      ([, entry]) => entry.question.id === questionId
    )
    if (!found) return
    const [key, entry] = found
    const { site, tabId } = entry.question
    pending.delete(key)

    if (reply === 'always') {
      always.add(site)
      blocked.delete(site)
      persist()
    } else if (reply === 'once') {
      once.add(keyOf(tabId, site))
    } else {
      blocked.add(site)
    }

    const result: TAskResult = reply === 'no' ? 'refused' : 'allowed'
    for (const settle of [...entry.waiters]) settle(result)
    if (reply !== 'no') for (const run of entry.onAllow) run(reply)
    onChange()
  }

  /** Lets a new tab use a site its opener was allowed once. */
  const allowOnce = (tabId: string, site: string) => {
    once.add(keyOf(tabId, site))
  }

  /** A tab closed or went back to the person: its answers and questions go. */
  const forgetTab = (tabId: string) => {
    for (const key of [...once]) {
      if (key.startsWith(`${tabId}\n`)) once.delete(key)
    }
    let hadQuestion = false
    for (const [key, entry] of [...pending]) {
      if (entry.question.tabId !== tabId) continue
      pending.delete(key)
      hadQuestion = true
      for (const settle of [...entry.waiters]) settle('refused')
    }
    if (hadQuestion) onChange()
  }

  /** The person removed a site from the list: AI has to ask again. */
  const forgetSite = (site: string) => {
    const wasAlways = always.delete(site)
    blocked.delete(site)
    for (const key of [...once]) {
      if (key.endsWith(`\n${site}`)) once.delete(key)
    }
    if (wasAlways) persist()
    onChange()
  }

  const sites = (): TBrowserSite[] => [
    ...[...always].sort().map((site) => ({ site, rule: 'always' as const })),
    ...[...new Set([...once].map((key) => key.split('\n')[1]))]
      .filter((site) => !always.has(site))
      .sort()
      .map((site) => ({ site, rule: 'once' as const })),
    ...[...blocked].sort().map((site) => ({ site, rule: 'blocked' as const }))
  ]

  return {
    ask,
    hold,
    answer,
    allowOnce,
    isAllowed,
    forgetTab,
    forgetSite,
    sites,
    questions: () => [...pending.values()].map((entry) => entry.question),
    canRemember: () => store.canRemember(),

    /** Stop: AI does nothing more until the person lets it carry on. */
    pause: () => {
      isPaused = true
      pausedAiName = null
      onChange()
    },
    resume: () => {
      isPaused = false
      pausedAiName = null
      onChange()
    },
    isPaused: () => isPaused,
    /** A tool tried to carry on while paused, so the page can say who. */
    notePausedAttempt: (aiName: string) => {
      if (pausedAiName === aiName) return
      pausedAiName = aiName
      onChange()
    },
    pausedAiName: () => pausedAiName
  }
}

export type TApprovals = ReturnType<typeof createApprovals>
