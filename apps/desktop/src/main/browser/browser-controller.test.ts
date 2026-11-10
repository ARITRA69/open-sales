import { describe, expect, it } from 'vitest'

import { createApprovals } from './approvals'
import { createBrowserController } from './browser-controller'
import { fakeHost, fakeStore } from './fakes'
import { StoppedError } from './fence'

const flush = () => new Promise((done) => setImmediate(done))

const setUp = (allowed: string[] = []) => {
  const made = fakeHost()
  let time = 100_000
  const approvals = createApprovals({ store: fakeStore(allowed) })
  const controller = createBrowserController({
    host: made.host,
    approvals,
    now: () => time
  })
  return {
    ...made,
    approvals,
    controller,
    // Moves the clock on, past the moment an action counts as AI's.
    wait: (ms: number) => {
      time += ms
    },
    answer: async (reply: 'once' | 'always' | 'no') => {
      await flush()
      const [question] = approvals.questions()
      controller.answerQuestion(question.id, reply)
    }
  }
}

const messageOf = async (call: Promise<unknown> | (() => unknown)) => {
  try {
    await (typeof call === 'function' ? call() : call)
  } catch (error) {
    return (error as Error).message
  }
  return 'no error'
}

describe('the person’s own browsing', () => {
  it('opens tabs, goes to what was typed and switches between them', () => {
    const { controller, page, shown } = setUp()
    controller.openTab('example.com')
    controller.openTab()

    expect(page('t1').loaded).toEqual(['https://example.com'])
    expect(controller.getState().activeTabId).toBe('t2')

    controller.navigate('t2', 'halden pricing')
    expect(page('t2').loaded[0]).toContain(
      'google.com/search?q=halden%20pricing'
    )

    controller.actOnTab('t1', 'select')
    expect(shown.at(-1)).toBe('t1')
    expect(controller.getState().tabs.map((tab) => tab.control)).toEqual([
      'person',
      'person'
    ])
  })

  it('closes a tab and shows its neighbour', () => {
    const { controller, page } = setUp()
    controller.openTab('a.com')
    controller.openTab('b.com')
    controller.actOnTab('t2', 'close')

    expect(page('t2').done).toContain('close')
    expect(controller.getState().activeTabId).toBe('t1')
    controller.actOnTab('t1', 'close')
    expect(controller.getState()).toMatchObject({ tabs: [], activeTabId: null })
  })

  it('opens the page in the default browser', () => {
    const { controller, opened } = setUp()
    controller.openTab('https://example.com/pricing')
    controller.actOnTab('t1', 'open-in-default-browser')
    expect(opened).toEqual(['https://example.com/pricing'])
  })

  it('opens a page’s pop-up as a tab of the person’s', () => {
    const { controller, page } = setUp()
    controller.openTab('a.com')
    controller.handlePopup('t1', 'https://a.com/help')

    expect(page('t2').loaded).toEqual(['https://a.com/help'])
    expect(controller.getState().tabs[1].control).toBe('person')
  })

  it('never loads anything but web pages', () => {
    const { controller } = setUp()
    controller.openTab('a.com')
    expect(controller.shouldHoldNavigation('t1', 'file:///etc/passwd')).toBe(
      true
    )
    expect(controller.shouldHoldNavigation('t1', 'https://b.com')).toBe(false)
  })
})

describe('whose tab it is', () => {
  it('keeps the person’s tabs from AI: not listed, not readable, not closable', async () => {
    const { controller } = setUp(['a.com'])
    controller.openTab('https://bank.com/accounts')
    await controller.openForAi('Claude Code', 'https://a.com')

    const listed = controller.listForAi('Claude Code')
    expect(listed.tabs.map((tab) => tab.id)).toEqual(['t2'])
    expect(listed.otherTabCount).toBe(1)
    expect(JSON.stringify(listed)).not.toContain('bank.com')

    const refusal = await messageOf(() =>
      controller.withAiTab('Claude Code', 't1', async () => 'read')
    )
    expect(refusal).toContain('no tab t1 that AI can use')
    expect(
      await messageOf(() => controller.closeForAi('Claude Code', 't1'))
    ).toContain('no tab t1')
    // The same words as for a tab that doesn't exist, so nothing leaks.
    expect(
      await messageOf(() =>
        controller.withAiTab('Claude Code', 't99', async () => 'read')
      )
    ).toBe(refusal.replace('t1', 't99'))
  })

  it('lets AI use a tab once the person hands it over', async () => {
    const { controller } = setUp(['a.com'])
    controller.openTab('https://a.com')
    controller.actOnTab('t1', 'let-ai-use')

    expect(
      await controller.withAiTab('Codex', 't1', async (tab) => tab.page.url())
    ).toBe('https://a.com')
    expect(controller.getState().tabs[0]).toMatchObject({
      control: 'ai',
      aiName: 'Codex'
    })
  })

  it('marks a tab AI opened, and leaves the person’s page in front', async () => {
    const { controller } = setUp(['a.com'])
    controller.openTab('https://mine.com')
    const opened = await controller.openForAi('Claude Code', 'https://a.com/x')

    expect(opened).toEqual({ tabId: 't2', loadState: 'loaded' })
    const state = controller.getState()
    expect(state.tabs[1]).toMatchObject({
      control: 'ai',
      aiName: 'Claude Code',
      url: 'https://a.com/x'
    })
    expect(state.activeTabId).toBe('t1')
  })

  it('limits how many tabs AI can hold', async () => {
    const { controller } = setUp(['a.com'])
    for (let count = 0; count < 8; count += 1) {
      await controller.openForAi('AI', 'https://a.com')
    }
    expect(
      await messageOf(controller.openForAi('AI', 'https://a.com'))
    ).toContain('already has 8 tabs')
  })
})

describe('asking before AI uses a site', () => {
  it('goes nowhere until the person says yes', async () => {
    const { controller, page, answer, attention } = setUp()
    const opening = controller.openForAi(
      'Claude Code',
      'https://linkedin.com/in/asha'
    )
    await flush()

    expect(page('t1').loaded).toEqual([])
    expect(controller.getState().questions).toEqual([
      { id: 'q1', aiName: 'Claude Code', site: 'linkedin.com', tabId: 't1' }
    ])
    expect(attention()).toBe(1)

    await answer('once')
    expect(await opening).toEqual({ tabId: 't1', loadState: 'loaded' })
    expect(page('t1').loaded).toEqual(['https://linkedin.com/in/asha'])
  })

  it('closes the new tab and tells AI when the person says no', async () => {
    const { controller, answer } = setUp()
    const opening = controller.openForAi('Claude Code', 'https://a.com')
    await answer('no')

    expect(await messageOf(opening)).toContain('hasn’t allowed AI to use a.com')
    expect(controller.getState().tabs).toEqual([])
  })

  it('asks again when the tab has moved to another site', async () => {
    const { controller, page, answer } = setUp(['a.com'])
    await controller.openForAi('AI', 'https://a.com')
    // The person clicked through to another site in AI's tab.
    page('t1').moveTo('https://b.com/secret')

    const reading = controller.withAiTab('AI', 't1', async () => 'page text')
    await flush()
    expect(controller.getState().questions[0]).toMatchObject({
      site: 'b.com',
      tabId: 't1'
    })
    await answer('no')
    expect(await messageOf(reading)).toContain('hasn’t allowed AI to use b.com')
  })

  it('doesn’t carry a "once" for one tab over to another', async () => {
    const { controller, answer } = setUp()
    const first = controller.openForAi('AI', 'https://a.com')
    await answer('once')
    await first

    void controller.openForAi('AI', 'https://a.com')
    await flush()
    expect(controller.getState().questions).toHaveLength(1)
  })

  it('holds a page load AI set off to a site that isn’t allowed, and goes on a yes', async () => {
    const { controller, page, answer } = setUp(['a.com'])
    await controller.openForAi('AI', 'https://a.com')

    // Straight after AI's click, the page heads for another site.
    expect(controller.shouldHoldNavigation('t1', 'https://b.com/next')).toBe(
      true
    )
    expect(controller.getState().questions[0]).toMatchObject({ site: 'b.com' })
    expect(page('t1').loaded).toEqual(['https://a.com'])

    await answer('once')
    expect(page('t1').loaded).toEqual(['https://a.com', 'https://b.com/next'])
  })

  it('lets the person’s own click through in AI’s tab, then asks before AI reads it', async () => {
    const { controller, wait } = setUp(['a.com'])
    await controller.openForAi('AI', 'https://a.com')
    wait(10_000)

    expect(controller.shouldHoldNavigation('t1', 'https://b.com')).toBe(false)
    expect(controller.shouldHoldNavigation('t1', 'https://a.com/other')).toBe(
      false
    )
  })

  it('never holds a load in the person’s own tab', () => {
    const { controller } = setUp()
    controller.openTab('a.com')
    expect(controller.shouldHoldNavigation('t1', 'https://anywhere.com')).toBe(
      false
    )
  })

  it('asks before a pop-up from AI’s tab opens another site', async () => {
    const { controller, page, answer } = setUp(['a.com'])
    await controller.openForAi('AI', 'https://a.com')
    controller.handlePopup('t1', 'https://b.com/login')

    expect(controller.getState().tabs).toHaveLength(1)
    await answer('once')
    expect(page('t2').loaded).toEqual(['https://b.com/login'])
    expect(controller.getState().tabs[1].control).toBe('ai')
  })
})

describe('Stop', () => {
  it('takes the tab back at once and pauses AI', async () => {
    const { controller, page } = setUp(['a.com'])
    await controller.openForAi('Claude Code', 'https://a.com')
    await controller.withAiTab('Claude Code', 't1', async () => 'armed')
    controller.actOnTab('t1', 'stop-ai')

    const state = controller.getState()
    expect(state.tabs[0]).toMatchObject({ control: 'person', aiName: null })
    expect(state.isAiPaused).toBe(true)
    expect(page('t1').isAiMode()).toBe(false)
    expect(page('t1').done).toContain('stop-loading')
  })

  it('ends a call that is running, even one that would have succeeded', async () => {
    const { controller } = setUp(['a.com'])
    await controller.openForAi('AI', 'https://a.com')
    let sideEffects = 0

    const call = controller.withAiTab('AI', 't1', async (tab) => {
      await flush()
      // The handler checks before it changes anything…
      tab.check()
      sideEffects += 1
      return 'the page text'
    })
    await Promise.resolve()
    controller.actOnTab('t1', 'stop-ai')

    await expect(call).rejects.toBeInstanceOf(StoppedError)
    expect(sideEffects).toBe(0)
  })

  it('gives nothing back from a call that finished its work as Stop landed', async () => {
    const { controller } = setUp(['a.com'])
    await controller.openForAi('AI', 'https://a.com')
    const call = controller.withAiTab('AI', 't1', async () => {
      await flush()
      return 'the page text'
    })
    await Promise.resolve()
    controller.actOnTab('t1', 'stop-ai')
    await expect(call).rejects.toBeInstanceOf(StoppedError)
  })

  it('refuses everything afterwards, a new tab included, until the person says carry on', async () => {
    const { controller, attention } = setUp(['a.com'])
    await controller.openForAi('Claude Code', 'https://a.com')
    await controller.openForAi('Claude Code', 'https://a.com')
    controller.actOnTab('t1', 'stop-ai')

    const before = attention()
    for (const call of [
      () => controller.openForAi('Claude Code', 'https://a.com'),
      () => controller.withAiTab('Claude Code', 't2', async () => 'read'),
      () => controller.listForAi('Claude Code'),
      () => controller.closeForAi('Claude Code', 't2')
    ]) {
      expect(await messageOf(call)).toContain('pressed Stop')
    }
    expect(controller.getState().pausedAiName).toBe('Claude Code')
    expect(attention()).toBeGreaterThan(before)
    expect(controller.getState().tabs).toHaveLength(2)

    controller.resumeAi()
    expect(
      await controller.withAiTab('Claude Code', 't2', async () => 'read')
    ).toBe('read')
    // The tab it was stopped in stays the person's.
    expect(
      await messageOf(() =>
        controller.withAiTab('Claude Code', 't1', async () => 'read')
      )
    ).toContain('no tab t1')
  })

  it('drops the stopped tab’s "once" and its question', async () => {
    const { controller, approvals, answer } = setUp()
    const opening = controller.openForAi('AI', 'https://a.com')
    await answer('once')
    await opening
    controller.actOnTab('t1', 'stop-ai')

    expect(approvals.isAllowed('t1', 'a.com')).toBe(false)
  })

  it('resumes when the person hands a tab over', async () => {
    const { controller } = setUp(['a.com'])
    await controller.openForAi('AI', 'https://a.com')
    controller.actOnTab('t1', 'stop-ai')
    controller.actOnTab('t1', 'let-ai-use')

    expect(controller.getState().isAiPaused).toBe(false)
    expect(await controller.withAiTab('AI', 't1', async () => 'read')).toBe(
      'read'
    )
  })
})

describe('calls on one tab', () => {
  it('run one after another', async () => {
    const { controller } = setUp(['a.com'])
    await controller.openForAi('AI', 'https://a.com')
    const order: string[] = []
    const slow = controller.withAiTab('AI', 't1', async () => {
      order.push('first starts')
      await flush()
      await flush()
      order.push('first ends')
    })
    const quick = controller.withAiTab('AI', 't1', async () => {
      order.push('second starts')
    })
    await Promise.all([slow, quick])

    expect(order).toEqual(['first starts', 'first ends', 'second starts'])
  })

  it('end with a plain message when the tab closes under them', async () => {
    const { controller } = setUp(['a.com'])
    await controller.openForAi('AI', 'https://a.com')
    const call = controller.withAiTab('AI', 't1', async (tab) => {
      await flush()
      tab.check()
    })
    await Promise.resolve()
    controller.actOnTab('t1', 'close')

    expect(await messageOf(call)).toBe('Tab t1 was closed.')
  })

  it('show the tab as working only while they run', async () => {
    const { controller } = setUp(['a.com'])
    await controller.openForAi('AI', 'https://a.com')
    let duringCall = false
    await controller.withAiTab('AI', 't1', async () => {
      duringCall = controller.getState().tabs[0].isAiWorking
    })
    expect(duringCall).toBe(true)
    expect(controller.getState().tabs[0].isAiWorking).toBe(false)
  })

  it('end when the page crashes or its controls are taken away', async () => {
    const { controller } = setUp(['a.com'])
    await controller.openForAi('AI', 'https://a.com')
    const call = controller.withAiTab('AI', 't1', async (tab) => {
      await flush()
      tab.check()
    })
    await Promise.resolve()
    controller.handlePageEvent('t1', { type: 'crashed' })

    await expect(call).rejects.toBeInstanceOf(StoppedError)
    expect(controller.getState().tabs[0].problem).toContain('stopped working')
  })
})

describe('downloads', () => {
  it('holds one AI set off until the person says to fetch it', async () => {
    const { controller, page } = setUp(['a.com'])
    await controller.openForAi('AI', 'https://a.com')
    const download = { url: 'https://a.com/report.pdf', fileName: 'report.pdf' }

    expect(controller.shouldHoldDownload('t1', download)).toBe(true)
    const [held] = controller.getState().heldDownloads
    expect(held).toMatchObject({
      tabId: 't1',
      fileName: 'report.pdf',
      site: 'a.com'
    })

    controller.resolveDownload(held.id, 'download')
    expect(page('t1').done).toContain('download https://a.com/report.pdf')
    // The one the person asked for goes through.
    expect(controller.shouldHoldDownload('t1', download)).toBe(false)
    expect(controller.getState().heldDownloads).toEqual([])
  })

  it('lets the person’s own downloads through', async () => {
    const { controller, wait } = setUp(['a.com'])
    controller.openTab('a.com')
    expect(
      controller.shouldHoldDownload('t1', {
        url: 'https://a.com/x.pdf',
        fileName: 'x.pdf'
      })
    ).toBe(false)

    await controller.openForAi('AI', 'https://a.com')
    wait(10_000)
    expect(
      controller.shouldHoldDownload('t2', {
        url: 'https://a.com/y.pdf',
        fileName: 'y.pdf'
      })
    ).toBe(false)
  })
})
