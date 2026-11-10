import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createApprovalStore } from './approval-store'
import { createApprovals } from './approvals'
import { fakeStore } from './fakes'

afterEach(() => vi.useRealTimers())

const flush = () => new Promise((done) => setImmediate(done))

describe('createApprovals', () => {
  it('asks the first time AI uses a site, and waits for the answer', async () => {
    const approvals = createApprovals({ store: fakeStore() })
    const asked = approvals.ask('t1', 'linkedin.com', 'Claude Code')
    await flush()

    expect(approvals.questions()).toEqual([
      { id: 'q1', aiName: 'Claude Code', site: 'linkedin.com', tabId: 't1' }
    ])
    approvals.answer('q1', 'once')
    expect(await asked).toBe('allowed')
    expect(approvals.questions()).toEqual([])
  })

  it('keeps "once" to that tab and that site', async () => {
    const approvals = createApprovals({ store: fakeStore() })
    const asked = approvals.ask('t1', 'a.com', 'AI')
    await flush()
    approvals.answer('q1', 'once')
    await asked

    expect(approvals.isAllowed('t1', 'a.com')).toBe(true)
    // Another tab, or another site in the same tab, asks again.
    expect(approvals.isAllowed('t2', 'a.com')).toBe(false)
    expect(approvals.isAllowed('t1', 'b.com')).toBe(false)

    approvals.forgetTab('t1')
    expect(approvals.isAllowed('t1', 'a.com')).toBe(false)
  })

  it('remembers "always" for every tab, and saves it', async () => {
    const store = fakeStore()
    const approvals = createApprovals({ store })
    const asked = approvals.ask('t1', 'a.com', 'AI')
    await flush()
    approvals.answer('q1', 'always')
    await asked
    await flush()

    expect(approvals.isAllowed('t9', 'a.com')).toBe(true)
    expect(store.saved()).toEqual(['a.com'])
    expect(await approvals.ask('t9', 'a.com', 'AI')).toBe('allowed')
  })

  it('starts with the sites saved earlier', async () => {
    const approvals = createApprovals({ store: fakeStore(['a.com']) })
    expect(await approvals.ask('t1', 'a.com', 'AI')).toBe('allowed')
    expect(approvals.questions()).toEqual([])
  })

  it('refuses after "no" without asking again this launch', async () => {
    const approvals = createApprovals({ store: fakeStore() })
    const asked = approvals.ask('t1', 'a.com', 'AI')
    await flush()
    approvals.answer('q1', 'no')

    expect(await asked).toBe('refused')
    expect(await approvals.ask('t2', 'a.com', 'AI')).toBe('refused')
    expect(approvals.questions()).toEqual([])
    expect(approvals.sites()).toEqual([{ site: 'a.com', rule: 'blocked' }])
  })

  it('asks once for one tab and site, however many calls are waiting', async () => {
    const approvals = createApprovals({ store: fakeStore() })
    const first = approvals.ask('t1', 'a.com', 'AI')
    const second = approvals.ask('t1', 'a.com', 'AI')
    await flush()

    expect(approvals.questions()).toHaveLength(1)
    approvals.answer('q1', 'once')
    expect(await Promise.all([first, second])).toEqual(['allowed', 'allowed'])
  })

  it('stops waiting before the AI tool gives up, leaving the question up', async () => {
    vi.useFakeTimers()
    const approvals = createApprovals({ store: fakeStore(), waitMs: 45_000 })
    const asked = approvals.ask('t1', 'a.com', 'AI')
    await vi.advanceTimersByTimeAsync(45_000)

    expect(await asked).toBe('waiting')
    expect(approvals.questions()).toHaveLength(1)
    // The person answers later: the next call goes through.
    approvals.answer('q1', 'once')
    expect(await approvals.ask('t1', 'a.com', 'AI')).toBe('allowed')
  })

  it('runs what was held back only on a yes', async () => {
    const approvals = createApprovals({ store: fakeStore() })
    const ran: string[] = []
    approvals.hold('t1', 'a.com', 'AI', (answer) => ran.push(`a ${answer}`))
    approvals.hold('t1', 'b.com', 'AI', (answer) => ran.push(`b ${answer}`))
    const [a, b] = approvals.questions()

    approvals.answer(a.id, 'always')
    approvals.answer(b.id, 'no')
    expect(ran).toEqual(['a always'])
  })

  it('drops a closed tab’s question and ends the calls waiting on it', async () => {
    const approvals = createApprovals({ store: fakeStore() })
    const asked = approvals.ask('t1', 'a.com', 'AI')
    await flush()
    approvals.forgetTab('t1')

    expect(await asked).toBe('refused')
    expect(approvals.questions()).toEqual([])
    // Closing the tab wasn't a "no" to the site.
    expect(approvals.sites()).toEqual([])
  })

  it('asks again once the person removes a site', async () => {
    const store = fakeStore(['a.com'])
    const approvals = createApprovals({ store })
    await flush()
    approvals.forgetSite('a.com')
    await flush()

    expect(approvals.isAllowed('t1', 'a.com')).toBe(false)
    expect(store.saved()).toEqual([])
  })

  it('pauses on Stop until the person lets AI carry on', () => {
    const approvals = createApprovals({ store: fakeStore() })
    approvals.pause()
    approvals.notePausedAttempt('Codex')
    expect(approvals.isPaused()).toBe(true)
    expect(approvals.pausedAiName()).toBe('Codex')

    approvals.resume()
    expect(approvals.isPaused()).toBe(false)
    expect(approvals.pausedAiName()).toBeNull()
  })
})

describe('createApprovalStore', () => {
  // Stands in for the OS keychain: reversible, and not readable as it is.
  const keychain = {
    isEncryptionAvailable: () => true,
    encryptString: (plain: string) => Buffer.from(`locked:${plain}`),
    decryptString: (locked: Buffer) => locked.toString().replace(/^locked:/, '')
  }
  const newDir = () => mkdtemp(join(tmpdir(), 'browser-sites-'))

  it('keeps the list between launches', async () => {
    const dir = await newDir()
    await createApprovalStore(dir, keychain).save(['a.com', 'b.com'])
    expect(await createApprovalStore(dir, keychain).load()).toEqual([
      'a.com',
      'b.com'
    ])
  })

  it('treats a list someone edited by hand as empty', async () => {
    const dir = await newDir()
    await createApprovalStore(dir, keychain).save(['a.com'])
    const file = join(dir, 'browser-sites.json')
    const saved = JSON.parse(await readFile(file, 'utf8'))
    // What an AI tool with a shell might try: add a site and keep the old signature.
    await writeFile(
      file,
      JSON.stringify({ ...saved, sites: ['a.com', 'bank.com'] })
    )

    expect(await createApprovalStore(dir, keychain).load()).toEqual([])
  })

  it('is empty when there’s nothing saved, or the file is nonsense', async () => {
    const dir = await newDir()
    expect(await createApprovalStore(dir, keychain).load()).toEqual([])
    await createApprovalStore(dir, keychain).save(['a.com'])
    await writeFile(join(dir, 'browser-sites.json'), 'not json')
    expect(await createApprovalStore(dir, keychain).load()).toEqual([])
  })

  it('writes nothing where there’s no keychain', async () => {
    const dir = await newDir()
    const store = createApprovalStore(dir, {
      ...keychain,
      isEncryptionAvailable: () => false
    })
    await store.save(['a.com'])

    expect(store.canRemember()).toBe(false)
    expect(await store.load()).toEqual([])
    await expect(readFile(join(dir, 'browser-sites.json'))).rejects.toThrow()
  })
})
