/*
 * The playbooks service against a real Postgres: the starters a new server
 * comes with, who may read and write, versions, publishing and the fixed
 * set of things a playbook may change. Runs only with TEST_DATABASE_URL set,
 * and only on a database whose name says "test", because it rebuilds it.
 *
 *   TEST_DATABASE_URL=postgres://open_sales:open-sales@localhost:5433/open_sales_test_playbooks \
 *     bunx vitest run src/playbooks
 */
import type { TPlaybook, TSessionUser } from '@open-sales/shared'
import { STARTER_PLAYBOOKS } from '@open-sales/shared'
import { asc, eq, sql } from 'drizzle-orm'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createApp } from '../app'
import type { TDatabase } from '../db/client'
import { createDatabase } from '../db/client'
import { runMigrations } from '../db/migrate'
import { changeLog, playbookVersion, user } from '../db/schema'
import type { TActor } from '../records/common'
import {
  ChangedSinceError,
  InvalidChangeError,
  NotAllowedError,
  RecordNotFoundError
} from '../records/common'
import type { TSetupService } from '../setup'
import type { TTeamService } from '../team'
import type { TPlaybookService } from './service'
import { createPlaybookService } from './service'

const DATABASE_URL = process.env.TEST_DATABASE_URL

const PEOPLE = {
  admin: { id: 'u-admin', name: 'Asha Menon', role: 'admin' },
  manager: { id: 'u-manager', name: 'Mo Rahman', role: 'manager' },
  otherManager: { id: 'u-manager-2', name: 'Dan Okafor', role: 'manager' },
  ravi: { id: 'u-ravi', name: 'Ravi Shah', role: 'member' }
} as const

const actor = (who: keyof typeof PEOPLE): TActor => ({
  ...PEOPLE[who],
  email: `${PEOPLE[who].id}@halden.com`
})
const admin = actor('admin')
const manager = actor('manager')
const otherManager = actor('otherManager')
const ravi = actor('ravi')

const ALL = { status: 'any', archived: false, limit: 100 } as const

const DEMO = {
  name: 'Follow-up after a demo',
  description: 'Recap the demo and set the next step.',
  steps:
    'Read the demo notes. Draft a recap email for the {Plan} plan. Propose the next step.',
  blanks: [
    {
      name: 'Plan',
      question: 'Which plan did they pick?',
      options: ['Starter', 'Team']
    }
  ],
  allowedChanges: ['fields', 'email_drafts']
} satisfies Parameters<TPlaybookService['create']>[1]

/** Makes the test database if it's missing; the server can't. */
const ensureDatabase = async (url: string) => {
  const name = new URL(url).pathname.slice(1)
  if (!name.includes('test')) {
    throw new Error(`Refusing to empty "${name}": use a database named *test*.`)
  }
  const server = new URL(url)
  server.pathname = '/postgres'
  const root = postgres(server.toString(), { onnotice: () => {} })
  const [found] = await root`select 1 from pg_database where datname = ${name}`
  if (!found) await root.unsafe(`create database "${name}"`)
  await root.end()
}

describe.skipIf(!DATABASE_URL)('playbooks service (database)', () => {
  let db: TDatabase
  let close: () => Promise<void>
  let playbooks: TPlaybookService

  beforeAll(async () => {
    await ensureDatabase(DATABASE_URL!)
    const connection = createDatabase(DATABASE_URL!)
    db = connection.db
    close = () => connection.sql.end()
    // Start from nothing each run, so the migrations seed the starters afresh.
    await db.execute(
      sql`drop schema if exists public cascade; create schema public; drop schema if exists drizzle cascade`
    )
    await runMigrations(db)
    await db.insert(user).values(
      Object.values(PEOPLE).map((p) => ({
        ...p,
        email: `${p.id}@halden.com`,
        status: 'active'
      }))
    )
    playbooks = createPlaybookService(db)
  })

  afterAll(async () => {
    await close?.()
  })

  // Clears what the tests wrote and leaves the starters (which have no author).
  beforeEach(async () => {
    await db.execute(sql`
      update playbook set current_version_id = null where author_id is not null;
      delete from playbook_version
        where playbook_id in (select id from playbook where author_id is not null);
      delete from playbook where author_id is not null;
      truncate change_log
    `)
  })

  const listNames = async (
    me: TActor,
    query: Partial<Parameters<TPlaybookService['list']>[1]> = {}
  ) =>
    (await playbooks.list(me, { ...ALL, ...query })).items.map(
      (item) => item.name
    )

  const versionsOf = (id: string) =>
    db
      .select()
      .from(playbookVersion)
      .where(eq(playbookVersion.playbookId, id))
      .orderBy(asc(playbookVersion.version))

  describe('starters', () => {
    it('come with a new server, published for everyone to run', async () => {
      const page = await playbooks.list(ravi, ALL)
      expect(page.items.map((item) => item.name)).toEqual([
        'Follow-up after a call',
        'Meeting prep',
        'Renewal prep',
        'Stalled deal check'
      ])
      for (const item of page.items) {
        const starter = STARTER_PLAYBOOKS.find(
          (known) => known.name === item.name
        )!
        expect(item).toMatchObject({
          description: starter.description,
          author: null,
          status: 'published',
          version: 1,
          archivedAt: null,
          canEdit: false,
          current: {
            number: 1,
            steps: starter.steps,
            blanks: starter.blanks,
            allowedChanges: starter.allowedChanges,
            createdBy: null
          }
        })
        expect(item.publishedAt).not.toBeNull()
      }
    })

    it('can be changed by a manager like any other playbook', async () => {
      const [first] = (await playbooks.list(manager, ALL)).items
      expect(first.canEdit).toBe(true)
    })
  })

  describe('roles', () => {
    it('lets managers and admins write, and nobody else', async () => {
      await expect(playbooks.create(ravi, DEMO)).rejects.toBeInstanceOf(
        NotAllowedError
      )
      const byManager = await playbooks.create(manager, DEMO)
      expect(byManager).toMatchObject({
        name: DEMO.name,
        description: DEMO.description,
        author: { id: manager.id, name: 'Mo Rahman' },
        status: 'draft',
        publishedAt: null,
        version: 1,
        canEdit: true,
        current: {
          number: 1,
          steps: DEMO.steps,
          blanks: DEMO.blanks,
          allowedChanges: ['fields', 'email_drafts'],
          createdBy: { id: manager.id, name: 'Mo Rahman' }
        }
      })
      const byAdmin = await playbooks.create(admin, { name: 'Admin’s own' })
      expect(byAdmin.author?.id).toBe(admin.id)

      await playbooks.setState(manager, byManager.id, 'publish', 1)
      await expect(
        playbooks.update(ravi, byManager.id, { name: 'Mine now', version: 2 })
      ).rejects.toBeInstanceOf(NotAllowedError)
      for (const action of ['unpublish', 'archive', 'restore'] as const) {
        await expect(
          playbooks.setState(ravi, byManager.id, action, 2)
        ).rejects.toBeInstanceOf(NotAllowedError)
      }
      // A manager changes one another manager wrote.
      const renamed = await playbooks.update(otherManager, byManager.id, {
        name: 'Demo follow-up',
        version: 2
      })
      expect(renamed).toMatchObject({
        name: 'Demo follow-up',
        author: { id: manager.id }
      })
    })

    it('shows drafts to their author, managers and admins only', async () => {
      const draft = await playbooks.create(manager, DEMO)

      expect(await listNames(ravi)).not.toContain(DEMO.name)
      await expect(playbooks.get(ravi, draft.id)).rejects.toBeInstanceOf(
        RecordNotFoundError
      )
      expect(await listNames(otherManager)).toContain(DEMO.name)
      expect(await listNames(admin)).toContain(DEMO.name)
      expect((await playbooks.get(admin, draft.id)).status).toBe('draft')

      // Its author still sees it after losing the manager role, read-only.
      const demoted: TActor = { ...manager, role: 'member' }
      expect(await listNames(demoted)).toContain(DEMO.name)
      expect((await playbooks.get(demoted, draft.id)).canEdit).toBe(false)

      await playbooks.setState(manager, draft.id, 'publish', 1)
      expect(await listNames(ravi)).toContain(DEMO.name)
      expect(await playbooks.get(ravi, draft.id)).toMatchObject({
        status: 'published',
        canEdit: false
      })

      await playbooks.setState(manager, draft.id, 'unpublish', 2)
      expect(await listNames(ravi)).not.toContain(DEMO.name)
    })
  })

  describe('versions', () => {
    it('saves each edit to the steps, blanks or allowed changes as a new one', async () => {
      const made = await playbooks.create(manager, DEMO)

      const edited = await playbooks.update(admin, made.id, {
        steps: 'Read the demo notes. Propose the next step.',
        version: 1
      })
      expect(edited).toMatchObject({
        version: 2,
        current: {
          number: 2,
          steps: 'Read the demo notes. Propose the next step.',
          // What wasn't sent carries over.
          blanks: DEMO.blanks,
          allowedChanges: ['fields', 'email_drafts'],
          createdBy: { id: admin.id }
        }
      })

      const loosened = await playbooks.update(manager, made.id, {
        blanks: [],
        allowedChanges: ['tasks'],
        version: 2
      })
      expect(loosened.current).toMatchObject({
        number: 3,
        blanks: [],
        allowedChanges: ['tasks']
      })

      // The old versions stay exactly as they were saved.
      const kept = await versionsOf(made.id)
      expect(kept.map((row) => row.version)).toEqual([1, 2, 3])
      expect(kept[0]).toMatchObject({
        steps: DEMO.steps,
        blanks: DEMO.blanks,
        allowedChanges: ['fields', 'email_drafts'],
        createdById: manager.id
      })
      expect(kept[1].createdById).toBe(admin.id)
    })

    it('keeps the number for a new name, and for a save that changes nothing', async () => {
      const made = await playbooks.create(manager, DEMO)

      const renamed = await playbooks.update(manager, made.id, {
        name: 'Demo follow-up',
        description: '',
        version: 1
      })
      expect(renamed).toMatchObject({
        name: 'Demo follow-up',
        description: null,
        version: 2,
        current: { id: made.current.id, number: 1 }
      })

      const same = await playbooks.update(manager, made.id, {
        name: 'Demo follow-up',
        steps: DEMO.steps,
        blanks: DEMO.blanks,
        allowedChanges: ['email_drafts', 'fields'],
        version: 2
      })
      expect(same).toMatchObject({ version: 2, current: { number: 1 } })
      expect(await versionsOf(made.id)).toHaveLength(1)
    })

    it('refuses a change made against an old version', async () => {
      const made = await playbooks.create(manager, DEMO)
      await playbooks.update(manager, made.id, { name: 'Newer', version: 1 })

      await expect(
        playbooks.update(otherManager, made.id, { steps: 'Mine', version: 1 })
      ).rejects.toBeInstanceOf(ChangedSinceError)
      await expect(
        playbooks.setState(otherManager, made.id, 'publish', 1)
      ).rejects.toBeInstanceOf(ChangedSinceError)
      await expect(
        playbooks.setState(otherManager, made.id, 'archive', 1)
      ).rejects.toBeInstanceOf(ChangedSinceError)

      const current = await playbooks.get(manager, made.id)
      expect(current).toMatchObject({
        name: 'Newer',
        status: 'draft',
        archivedAt: null,
        current: { steps: DEMO.steps }
      })
    })
  })

  describe('publishing and archiving', () => {
    it('needs steps to publish, and keeps them while published', async () => {
      const empty = await playbooks.create(manager, { name: 'Not written yet' })
      expect(empty.current.steps).toBe('')
      await expect(
        playbooks.setState(manager, empty.id, 'publish', 1)
      ).rejects.toBeInstanceOf(InvalidChangeError)

      const written = await playbooks.update(manager, empty.id, {
        steps: 'Read the notes.',
        version: 1
      })
      const published = await playbooks.setState(
        manager,
        empty.id,
        'publish',
        written.version
      )
      expect(published).toMatchObject({ status: 'published', version: 3 })
      expect(published.publishedAt).not.toBeNull()

      await expect(
        playbooks.update(manager, empty.id, { steps: '  ', version: 3 })
      ).rejects.toBeInstanceOf(InvalidChangeError)

      // Asking for how it already is changes nothing, whatever the version.
      const again = await playbooks.setState(manager, empty.id, 'publish', 1)
      expect(again).toMatchObject({
        version: 3,
        publishedAt: published.publishedAt
      })

      // Editing a published playbook keeps it published.
      const edited = await playbooks.update(manager, empty.id, {
        steps: 'Read the notes. Propose a task.',
        version: 3
      })
      expect(edited).toMatchObject({
        status: 'published',
        current: { number: 3 }
      })
    })

    it('archives out of the library, and restores as it was', async () => {
      const made = await playbooks.create(manager, DEMO)
      await playbooks.setState(manager, made.id, 'publish', 1)
      const archived = await playbooks.setState(manager, made.id, 'archive', 2)
      expect(archived.archivedAt).not.toBeNull()

      expect(await listNames(manager)).not.toContain(DEMO.name)
      expect(await listNames(ravi)).not.toContain(DEMO.name)
      expect(await listNames(manager, { archived: true })).toEqual([DEMO.name])

      await expect(
        playbooks.update(manager, made.id, { name: 'X', version: 3 })
      ).rejects.toBeInstanceOf(InvalidChangeError)
      await expect(
        playbooks.setState(manager, made.id, 'unpublish', 3)
      ).rejects.toBeInstanceOf(InvalidChangeError)

      const restored = await playbooks.setState(manager, made.id, 'restore', 3)
      expect(restored).toMatchObject({
        archivedAt: null,
        status: 'published',
        version: 4
      })
      expect(await listNames(ravi)).toContain(DEMO.name)
    })

    it('finds playbooks by name or description, and by status', async () => {
      const draft = await playbooks.create(manager, DEMO)
      expect(await listNames(manager, { q: 'DEMO' })).toEqual([DEMO.name])
      expect(await listNames(manager, { q: 'gone quiet' })).toEqual([
        'Stalled deal check'
      ])
      expect(await listNames(manager, { status: 'draft' })).toEqual([DEMO.name])
      expect(await listNames(manager, { status: 'published' })).toHaveLength(4)
      // Asking for drafts doesn't show a member anyone else's.
      expect(await listNames(ravi, { status: 'draft' })).toEqual([])

      const firstTwo = await playbooks.list(manager, { ...ALL, limit: 2 })
      expect(firstTwo.items).toHaveLength(2)
      const rest = await playbooks.list(manager, {
        ...ALL,
        cursor: firstTwo.nextCursor ?? undefined
      })
      expect(
        [...firstTwo.items, ...rest.items].map((item) => item.id)
      ).toContain(draft.id)
      expect(firstTwo.items.length + rest.items.length).toBe(5)
    })
  })

  describe('what it may change', () => {
    it('takes only fields, tasks and email drafts', async () => {
      for (const allowedChanges of [
        ['send_email'],
        ['fields', 'owners'],
        ['change_owner'],
        ['archive'],
        'fields'
      ]) {
        await expect(
          playbooks.create(manager, { ...DEMO, allowedChanges } as never)
        ).rejects.toThrow(/nothing else/)
      }
      const made = await playbooks.create(manager, DEMO)
      await expect(
        playbooks.update(manager, made.id, {
          allowedChanges: ['tasks', 'send_email'],
          version: 1
        } as never)
      ).rejects.toThrow(/nothing else/)

      const kept = await versionsOf(made.id)
      expect(kept).toHaveLength(1)
      expect(kept[0].allowedChanges).toEqual(['fields', 'email_drafts'])
      // Nothing else was made on the way.
      expect(await listNames(manager, { status: 'draft' })).toEqual([DEMO.name])
    })

    it('never hands out more, even if a row was edited by hand', async () => {
      const made = await playbooks.create(manager, DEMO)
      await db
        .update(playbookVersion)
        .set({ allowedChanges: ['tasks', 'send_email', 'owners'] })
        .where(eq(playbookVersion.playbookId, made.id))

      expect(
        (await playbooks.get(manager, made.id)).current.allowedChanges
      ).toEqual(['tasks'])
      const [listed] = (await playbooks.list(manager, { ...ALL, q: 'demo' }))
        .items
      expect(listed.current.allowedChanges).toEqual(['tasks'])
      // The next edit saves only what's allowed.
      await playbooks.update(manager, made.id, { steps: 'New.', version: 1 })
      expect((await versionsOf(made.id))[1].allowedChanges).toEqual(['tasks'])
    })
  })

  it('writes every change to the change log', async () => {
    const made = await playbooks.create(manager, DEMO)
    await playbooks.update(manager, made.id, {
      name: 'Demo follow-up',
      steps: 'New steps.',
      version: 1
    })
    await playbooks.setState(admin, made.id, 'publish', 2)
    await playbooks.setState(admin, made.id, 'archive', 3)
    await playbooks.setState(admin, made.id, 'restore', 4)

    const log = await db
      .select()
      .from(changeLog)
      .where(eq(changeLog.recordId, made.id))
      .orderBy(asc(changeLog.id))
    expect(
      log.map((entry) => [entry.recordType, entry.action, entry.actorId])
    ).toEqual([
      ['playbook', 'create', manager.id],
      ['playbook', 'update', manager.id],
      ['playbook', 'update', admin.id],
      ['playbook', 'archive', admin.id],
      ['playbook', 'restore', admin.id]
    ])
    expect(log[0].changes.map((change) => change.field).sort()).toEqual([
      'allowedChanges',
      'blanks',
      'description',
      'name',
      'steps'
    ])
    expect(log[1].changes).toEqual([
      { field: 'name', from: DEMO.name, to: 'Demo follow-up' },
      { field: 'steps', from: DEMO.steps, to: 'New steps.' }
    ])
    expect(log[2].changes).toMatchObject([{ field: 'publishedAt', from: null }])
  })

  describe('over HTTP', () => {
    const appAs = (me: TSessionUser | null) =>
      createApp({
        version: 'test',
        isDatabaseReachable: async () => true,
        handleAuth: async () => new Response(null, { status: 404 }),
        getSessionUser: async () => me,
        setup: {} as TSetupService,
        team: {} as TTeamService,
        playbooks
      })

    const send = (method: string, path: string, body: unknown) =>
      new Request(`http://test/api/v1${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })

    const codeOf = async (response: Response) =>
      ((await response.json()) as { error: { code: string } }).error.code

    it('needs a sign-in', async () => {
      const response = await appAs(null).request('/api/v1/playbooks')
      expect(response.status).toBe(401)
    })

    it('answers each problem with its own status and code', async () => {
      const asManager = appAs(manager)
      const asRavi = appAs(ravi)

      const made = await asManager.request(send('POST', '/playbooks', DEMO))
      expect(made.status).toBe(201)
      const demo = (await made.json()) as TPlaybook
      expect(demo.status).toBe('draft')

      // A member: no writing, and a draft isn't there for them.
      const refused = await asRavi.request(send('POST', '/playbooks', DEMO))
      expect(refused.status).toBe(403)
      expect(await codeOf(refused)).toBe('forbidden')
      const hidden = await asRavi.request(`/api/v1/playbooks/${demo.id}`)
      expect(hidden.status).toBe(404)

      // Anything outside the fixed set is refused before it's stored.
      for (const allowedChanges of [['send_email'], ['fields', 'owners']]) {
        const bad = await asManager.request(
          send('PATCH', `/playbooks/${demo.id}`, { allowedChanges, version: 1 })
        )
        expect(bad.status).toBe(400)
        expect(await codeOf(bad)).toBe('invalid_request')
        const badNew = await asManager.request(
          send('POST', '/playbooks', { name: 'Sender', allowedChanges })
        )
        expect(badNew.status).toBe(400)
      }

      const published = await asManager.request(
        send('POST', `/playbooks/${demo.id}/publish`, { version: 1 })
      )
      expect(published.status).toBe(200)
      expect(((await published.json()) as TPlaybook).status).toBe('published')

      const stale = await asManager.request(
        send('PATCH', `/playbooks/${demo.id}`, { name: 'Old', version: 1 })
      )
      expect(stale.status).toBe(409)
      expect(await codeOf(stale)).toBe('changed_since')

      const listed = await asRavi.request('/api/v1/playbooks?q=demo')
      expect(listed.status).toBe(200)
      const page = (await listed.json()) as { items: TPlaybook[] }
      expect(page.items.map((item) => item.name)).toEqual([DEMO.name])
      expect(page.items[0].canEdit).toBe(false)

      const noId = await asManager.request('/api/v1/playbooks/not-an-id')
      expect(noId.status).toBe(404)
      const noAction = await asManager.request(
        send('POST', `/playbooks/${demo.id}/send`, { version: 2 })
      )
      expect(noAction.status).toBe(404)
    })
  })
})
