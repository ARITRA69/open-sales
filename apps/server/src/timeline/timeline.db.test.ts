/*
 * Timelines, notes, calls and tasks against a real Postgres: who may add and
 * change what, the order of the stream, paging, and the tasks-due list. Runs
 * only with TEST_DATABASE_URL set, and only on a database whose name says
 * "test", because it empties it first:
 *
 *   TEST_DATABASE_URL=postgres://open_sales:open-sales@localhost:5433/open_sales_test_timeline \
 *     bunx vitest run src/timeline
 */
import type { TSessionUser, TTimelineItem } from '@open-sales/shared'
import { and, eq, sql } from 'drizzle-orm'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createApp } from '../app'
import type { TDatabase } from '../db/client'
import { createDatabase } from '../db/client'
import { runMigrations } from '../db/migrate'
import { changeLog, task, user, workspace } from '../db/schema'
import type { TActor } from '../records/common'
import {
  ChangedSinceError,
  InvalidChangeError,
  NotAllowedError,
  RecordNotFoundError
} from '../records/common'
import type { TRecordsService } from '../records/routes'
import { createRecordsService } from '../records/routes'
import type { TSetupService } from '../setup'
import type { TTeamService } from '../team'

const DATABASE_URL = process.env.TEST_DATABASE_URL

const PEOPLE = {
  admin: { id: 'u-admin', name: 'Asha Menon', role: 'admin' },
  manager: { id: 'u-manager', name: 'Mo Rahman', role: 'manager' },
  ravi: { id: 'u-ravi', name: 'Ravi Shah', role: 'member' },
  lena: { id: 'u-lena', name: 'Lena Ortiz', role: 'member' }
} as const

const actor = (who: keyof typeof PEOPLE): TActor => ({
  ...PEOPLE[who],
  email: `${PEOPLE[who].id}@halden.com`
})
const manager = actor('manager')
const ravi = actor('ravi')
const lena = actor('lena')

const DAY_MS = 24 * 60 * 60 * 1000
const daysAgo = (days: number) =>
  new Date(Date.now() - days * DAY_MS).toISOString()
/** A calendar day in UTC, the test workspace's time zone. */
const dayFromNow = (days: number) =>
  new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10)

/** Makes the test database if it's missing; the server can't. */
const ensureDatabase = async (url: string) => {
  const name = new URL(url).pathname.slice(1)
  if (!name.includes('test')) {
    throw new Error(`Refusing to empty "${name}": use a database named *test*.`)
  }
  const server = new URL(url)
  server.pathname = '/postgres'
  const admin = postgres(server.toString(), { onnotice: () => {} })
  const [found] = await admin`select 1 from pg_database where datname = ${name}`
  if (!found) await admin.unsafe(`create database "${name}"`)
  await admin.end()
}

/** What a timeline shows, as short words: easy to compare in order. */
const describeItem = (item: TTimelineItem) => {
  if (item.kind === 'activity') {
    return `${item.activity.type}:${item.activity.body ?? ''}`
  }
  if (item.kind === 'task') return `task:${item.task.title}`
  if (item.kind === 'stage') {
    return `stage:${item.from?.name ?? 'new'}>${item.to.name}`
  }
  return `${item.action}:${item.changes.map(({ field }) => field).join(',')}`
}

describe.skipIf(!DATABASE_URL)('timeline service (database)', () => {
  let db: TDatabase
  let close: () => Promise<void>
  let records: TRecordsService

  beforeAll(async () => {
    await ensureDatabase(DATABASE_URL!)
    const connection = createDatabase(DATABASE_URL!)
    db = connection.db
    close = () => connection.sql.end()
    await runMigrations(db)
    records = createRecordsService(db)
  })

  afterAll(async () => {
    await close?.()
  })

  beforeEach(async () => {
    await db.execute(
      sql`truncate activity, activity_person, task, company, person, deal, deal_person, deal_stage_change, change_log, "user" cascade`
    )
    await db.delete(workspace)
    await db
      .insert(workspace)
      .values({ name: 'Halden', currency: 'USD', timeZone: 'UTC' })
    await db.insert(user).values(
      Object.values(PEOPLE).map((p) => ({
        ...p,
        email: `${p.id}@halden.com`,
        status: 'active'
      }))
    )
  })

  /** Ravi's company, with Priya and Tom working there. */
  const seed = async () => {
    const halden = await records.companies.create(ravi, {
      name: 'Halden Capital'
    })
    const priya = await records.people.create(ravi, {
      companyId: halden.id,
      name: 'Priya Nair'
    })
    const tom = await records.people.create(ravi, {
      companyId: halden.id,
      name: 'Tom Becker'
    })
    return { halden, priya, tom }
  }

  const company$ = (id: string) => ({ type: 'company' as const, id })
  const person$ = (id: string) => ({ type: 'person' as const, id })
  const deal$ = (id: string) => ({ type: 'deal' as const, id })

  const read = async (
    me: TActor,
    ref: Parameters<TRecordsService['timeline']['read']>[1],
    limit = 30
  ) => records.timeline.read(me, ref, { limit })

  describe('notes and calls', () => {
    it('lets any member add to a company they don’t own', async () => {
      const { halden, priya } = await seed()
      const note = await records.timeline.activities.create(lena, {
        type: 'note',
        on: company$(halden.id),
        body: '  Budget is signed off.  '
      })
      expect(note).toMatchObject({
        type: 'note',
        body: 'Budget is signed off.',
        author: { id: lena.id, name: 'Lena Ortiz' },
        company: { id: halden.id, name: 'Halden Capital' },
        canEdit: true
      })

      const call = await records.timeline.activities.create(lena, {
        type: 'call',
        on: company$(halden.id),
        occurredAt: daysAgo(1),
        outcome: 'voicemail',
        body: 'Asked her to call back.',
        personIds: [priya.id]
      })
      expect(call).toMatchObject({
        type: 'call',
        outcome: 'voicemail',
        people: [{ id: priya.id, name: 'Priya Nair' }]
      })

      // Lena still can't change the company itself.
      await expect(
        records.companies.update(lena, halden.id, { name: 'X', version: 1 })
      ).rejects.toBeInstanceOf(NotAllowedError)
    })

    it('lets only the author, a manager or an admin change one', async () => {
      const { halden } = await seed()
      const note = await records.timeline.activities.create(lena, {
        type: 'note',
        on: company$(halden.id),
        body: 'First draft'
      })
      // Ravi owns the company, but the note is Lena's.
      await expect(
        records.timeline.activities.update(ravi, note.id, { body: 'Mine now' })
      ).rejects.toBeInstanceOf(NotAllowedError)
      expect(
        (await records.timeline.activities.get(ravi, note.id)).canEdit
      ).toBe(false)

      const edited = await records.timeline.activities.update(lena, note.id, {
        body: 'Second draft'
      })
      expect(edited.body).toBe('Second draft')
      const byManager = await records.timeline.activities.update(
        manager,
        note.id,
        { body: 'Tidied' }
      )
      expect(byManager.body).toBe('Tidied')

      await expect(
        records.timeline.activities.archive(ravi, note.id)
      ).rejects.toBeInstanceOf(NotAllowedError)
      const archived = await records.timeline.activities.archive(lena, note.id)
      expect(archived.archivedAt).not.toBeNull()
      expect((await read(lena, company$(halden.id))).items).not.toContainEqual(
        expect.objectContaining({ kind: 'activity' })
      )
    })

    it('refuses an empty note, strangers on a call, and archived records', async () => {
      const { halden } = await seed()
      const acme = await records.companies.create(lena, { name: 'Acme' })
      const outsider = await records.people.create(lena, {
        companyId: acme.id,
        name: 'Sam Adeyemi'
      })
      await expect(
        records.timeline.activities.create(ravi, {
          type: 'call',
          on: company$(halden.id),
          personIds: [outsider.id]
        })
      ).rejects.toBeInstanceOf(InvalidChangeError)
      const note = await records.timeline.activities.create(ravi, {
        type: 'note',
        on: company$(halden.id),
        body: 'Keep me'
      })
      await expect(
        records.timeline.activities.update(ravi, note.id, { body: '   ' })
      ).rejects.toBeInstanceOf(InvalidChangeError)

      await records.companies.archive(ravi, halden.id, 1)
      await expect(
        records.timeline.activities.create(ravi, {
          type: 'note',
          on: company$(halden.id),
          body: 'Too late'
        })
      ).rejects.toBeInstanceOf(InvalidChangeError)
      await expect(
        records.timeline.activities.create(ravi, {
          type: 'note',
          on: company$('0198c1f0-0000-7000-8000-000000000000'),
          body: 'Nowhere'
        })
      ).rejects.toBeInstanceOf(RecordNotFoundError)
    })

    it('files a deal’s call under its company and people, and keeps last activity', async () => {
      const { halden, priya, tom } = await seed()
      const rollout = await records.deals.create(ravi, {
        companyId: halden.id,
        name: 'Platform rollout'
      })
      const when = daysAgo(2)
      const call = await records.timeline.activities.create(ravi, {
        type: 'call',
        on: deal$(rollout.id),
        occurredAt: when,
        personIds: [priya.id]
      })
      expect(call).toMatchObject({
        company: { id: halden.id },
        deal: { id: rollout.id, name: 'Platform rollout' },
        outcome: 'connected'
      })

      const onCompany = await read(ravi, company$(halden.id))
      const onDeal = await read(ravi, deal$(rollout.id))
      const onPriya = await read(ravi, person$(priya.id))
      const onTom = await read(ravi, person$(tom.id))
      for (const timeline of [onCompany, onDeal, onPriya]) {
        expect(timeline.items.map(describeItem)).toContain('call:')
      }
      expect(onTom.items.map(describeItem)).not.toContain('call:')

      const after = await records.companies.get(ravi, halden.id)
      expect(after.lastActivityAt).toBe(when)
      // Recording what happened isn't an edit: the version stays.
      expect(after.version).toBe(1)
      expect((await records.deals.get(ravi, rollout.id)).lastActivityAt).toBe(
        when
      )
      expect((await records.people.get(ravi, priya.id)).lastActivityAt).toBe(
        when
      )
      expect((await records.people.get(ravi, tom.id)).lastActivityAt).toBeNull()

      // An older call doesn't move "last activity" back.
      await records.timeline.activities.create(ravi, {
        type: 'call',
        on: deal$(rollout.id),
        occurredAt: daysAgo(9)
      })
      expect(
        (await records.companies.get(ravi, halden.id)).lastActivityAt
      ).toBe(when)
    })

    it('writes every change to the change log', async () => {
      const { halden } = await seed()
      const note = await records.timeline.activities.create(ravi, {
        type: 'note',
        on: company$(halden.id),
        body: 'One'
      })
      await records.timeline.activities.update(ravi, note.id, { body: 'Two' })
      await records.timeline.activities.archive(ravi, note.id)
      const logged = await db
        .select({ action: changeLog.action, changes: changeLog.changes })
        .from(changeLog)
        .where(
          and(
            eq(changeLog.recordType, 'activity'),
            eq(changeLog.recordId, note.id)
          )
        )
        .orderBy(changeLog.id)
      expect(logged.map(({ action }) => action)).toEqual([
        'create',
        'update',
        'archive'
      ])
      expect(logged[1].changes).toEqual([
        { field: 'body', from: 'One', to: 'Two' }
      ])
    })
  })

  describe('tasks', () => {
    it('lets any member add one to any record, for anyone active', async () => {
      const { halden, priya } = await seed()
      const mine = await records.timeline.tasks.create(lena, {
        title: 'Send pricing',
        dueOn: dayFromNow(2),
        on: person$(priya.id)
      })
      expect(mine).toMatchObject({
        title: 'Send pricing',
        assignee: { id: lena.id },
        createdBy: { id: lena.id },
        company: { id: halden.id },
        person: { id: priya.id, name: 'Priya Nair' },
        deal: null,
        completedAt: null,
        version: 1
      })
      const forRavi = await records.timeline.tasks.create(lena, {
        title: 'Call Tom back',
        assigneeId: ravi.id,
        on: company$(halden.id)
      })
      expect(forRavi.assignee).toEqual({ id: ravi.id, name: 'Ravi Shah' })

      await db
        .update(user)
        .set({ status: 'deactivated' })
        .where(eq(user.id, lena.id))
      await expect(
        records.timeline.tasks.create(ravi, {
          title: 'For someone who left',
          assigneeId: lena.id
        })
      ).rejects.toBeInstanceOf(InvalidChangeError)
    })

    it('lets the assignee, the creator, a manager or an admin change one', async () => {
      const { halden } = await seed()
      // Lena made it for the manager; Ravi, who owns the company, isn't on it.
      const made = await records.timeline.tasks.create(lena, {
        title: 'Review the contract',
        assigneeId: manager.id,
        on: company$(halden.id)
      })
      await expect(
        records.timeline.tasks.update(ravi, made.id, { title: 'X', version: 1 })
      ).rejects.toBeInstanceOf(NotAllowedError)
      await expect(
        records.timeline.tasks.complete(ravi, made.id, 1)
      ).rejects.toBeInstanceOf(NotAllowedError)
      expect((await records.timeline.tasks.get(ravi, made.id)).canEdit).toBe(
        false
      )

      const renamed = await records.timeline.tasks.update(lena, made.id, {
        title: 'Review the contract with legal',
        version: 1
      })
      expect(renamed.version).toBe(2)
      const done = await records.timeline.tasks.complete(manager, made.id, 2)
      expect(done.completedAt).not.toBeNull()
      expect(done.version).toBe(3)
    })

    it('ticks off, reopens, and refuses a change made against an old version', async () => {
      const made = await records.timeline.tasks.create(ravi, {
        title: 'Send the deck'
      })
      await expect(
        records.timeline.tasks.update(ravi, made.id, { title: 'Y', version: 7 })
      ).rejects.toBeInstanceOf(ChangedSinceError)

      const done = await records.timeline.tasks.complete(ravi, made.id, 1)
      // Ticking it again, even from an old copy, is not a conflict.
      const again = await records.timeline.tasks.complete(ravi, made.id, 1)
      expect(again.version).toBe(done.version)
      await expect(
        records.timeline.tasks.update(ravi, made.id, {
          title: 'Changed while done',
          version: done.version
        })
      ).rejects.toBeInstanceOf(InvalidChangeError)

      const reopened = await records.timeline.tasks.reopen(
        ravi,
        made.id,
        done.version
      )
      expect(reopened.completedAt).toBeNull()

      const logged = await db
        .select({ action: changeLog.action })
        .from(changeLog)
        .where(
          and(eq(changeLog.recordType, 'task'), eq(changeLog.recordId, made.id))
        )
      expect(logged).toHaveLength(3)
    })

    it('lists my tasks due today or overdue, soonest first', async () => {
      const { halden } = await seed()
      const add = (me: TActor, title: string, dueOn: string | null) =>
        records.timeline.tasks.create(me, {
          title,
          dueOn,
          on: company$(halden.id)
        })
      await add(ravi, 'Due today', dayFromNow(0))
      await add(ravi, 'Overdue', dayFromNow(-3))
      await add(ravi, 'Next week', dayFromNow(7))
      await add(ravi, 'Some day', null)
      await add(lena, 'Lena’s overdue', dayFromNow(-1))
      const finished = await add(ravi, 'Already done', dayFromNow(-2))
      await records.timeline.tasks.complete(ravi, finished.id, 1)
      const dropped = await add(ravi, 'Dropped', dayFromNow(-2))
      await records.timeline.tasks.archive(ravi, dropped.id, 1)

      const list = (me: TActor, query: Record<string, unknown> = {}) =>
        records.timeline.tasks.list(me, {
          assignee: 'me',
          due: 'any',
          status: 'open',
          limit: 50,
          ...query
        })
      const titles = async (me: TActor, query?: Record<string, unknown>) =>
        (await list(me, query)).items.map(({ title }) => title)

      expect(await titles(ravi, { due: 'today' })).toEqual([
        'Overdue',
        'Due today'
      ])
      // Everything open: dated first, no date last.
      expect(await titles(ravi)).toEqual([
        'Overdue',
        'Due today',
        'Next week',
        'Some day'
      ])
      expect(await titles(lena, { due: 'today' })).toEqual(['Lena’s overdue'])
      expect(await titles(manager, { due: 'today' })).toEqual([])
      expect(
        await titles(manager, { due: 'today', assignee: 'anyone' })
      ).toEqual(['Overdue', 'Lena’s overdue', 'Due today'])
      expect(await titles(ravi, { status: 'done' })).toEqual(['Already done'])

      // Paging walks the same list, one at a time, dateless ones included.
      const walked: string[] = []
      let cursor: string | undefined
      do {
        const page = await list(ravi, { limit: 1, cursor })
        walked.push(...page.items.map(({ title }) => title))
        cursor = page.nextCursor ?? undefined
      } while (cursor)
      expect(walked).toEqual(['Overdue', 'Due today', 'Next week', 'Some day'])
    })

    it('means "today" where the team is', async () => {
      // Kiritimati is 14 hours ahead of UTC: its today is never behind.
      await db.update(workspace).set({ timeZone: 'Pacific/Kiritimati' })
      const there = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Pacific/Kiritimati'
      }).format(new Date())
      await records.timeline.tasks.create(ravi, {
        title: 'Due today, over there',
        dueOn: there
      })
      const due = await records.timeline.tasks.list(ravi, {
        assignee: 'me',
        due: 'today',
        status: 'open',
        limit: 50
      })
      expect(due.items).toHaveLength(1)
    })
  })

  describe('the stream', () => {
    it('puts what’s upcoming first, then history newest first', async () => {
      const { halden, priya } = await seed()
      const on = company$(halden.id)
      const { activities, tasks } = records.timeline

      await activities.create(ravi, {
        type: 'call',
        on,
        occurredAt: daysAgo(5),
        body: 'intro'
      })
      await activities.create(ravi, {
        type: 'call',
        on,
        occurredAt: daysAgo(3),
        body: 'demo',
        personIds: [priya.id]
      })
      // A call booked ahead is upcoming, like a meeting.
      await activities.create(ravi, {
        type: 'call',
        on,
        occurredAt: new Date(Date.now() + 2 * DAY_MS).toISOString(),
        body: 'follow-up'
      })
      await tasks.create(ravi, { title: 'Later', dueOn: dayFromNow(9), on })
      await tasks.create(ravi, { title: 'Overdue', dueOn: dayFromNow(-1), on })
      await tasks.create(ravi, { title: 'No date', on })
      const finished = await tasks.create(ravi, { title: 'Finished', on })
      await tasks.complete(ravi, finished.id, 1)
      await activities.create(ravi, { type: 'note', on, body: 'latest' })

      const { items } = await read(ravi, on)
      const upcoming = items.filter((item) => item.upcoming)
      const history = items.filter((item) => !item.upcoming)

      // Upcoming comes first in the list, soonest first, no date last.
      expect(items.slice(0, upcoming.length)).toEqual(upcoming)
      expect(upcoming.map(describeItem)).toEqual([
        'task:Overdue',
        'call:follow-up',
        'task:Later',
        'task:No date'
      ])
      expect(history.map(describeItem)).toEqual([
        'note:latest',
        'task:Finished',
        'create:name,ownerId',
        'call:demo',
        'call:intro'
      ])
      // History never runs backwards.
      const times = history.map((item) => item.at ?? '')
      expect([...times].sort().reverse()).toEqual(times)
    })

    it('shows field changes with names, and who made them', async () => {
      const { halden } = await seed()
      await records.companies.update(manager, halden.id, {
        ownerId: lena.id,
        industry: 'Finance',
        version: 1
      })
      const { items } = await read(lena, company$(halden.id))
      const [change] = items
      expect(change).toMatchObject({
        kind: 'change',
        action: 'update',
        via: 'app',
        actor: { id: manager.id, name: 'Mo Rahman' }
      })
      expect(change.kind === 'change' ? change.changes : []).toEqual(
        expect.arrayContaining([
          { field: 'ownerId', from: 'Ravi Shah', to: 'Lena Ortiz' },
          { field: 'industry', from: null, to: 'Finance' }
        ])
      )
    })

    it('tells a deal’s stage moves once, on the deal and on its company', async () => {
      const { halden } = await seed()
      const rollout = await records.deals.create(ravi, {
        companyId: halden.id,
        name: 'Platform rollout'
      })
      const pipeline = await records.pipeline.get()
      const proposal = pipeline.stages.find((s) => s.name === 'Proposal')!
      const moved = await records.deals.update(ravi, rollout.id, {
        stageId: proposal.id,
        version: rollout.version
      })
      await records.deals.update(ravi, rollout.id, {
        nextStep: 'Send pricing',
        version: moved.version
      })

      const onDeal = (await read(ravi, deal$(rollout.id))).items
      expect(onDeal.map(describeItem)).toEqual([
        'update:nextStep',
        'stage:Qualified>Proposal',
        'stage:new>Qualified'
      ])
      expect(onDeal[1]).toMatchObject({
        kind: 'stage',
        actor: { id: ravi.id },
        deal: { id: rollout.id, name: 'Platform rollout' }
      })

      const onCompany = (await read(ravi, company$(halden.id))).items
      expect(onCompany.map(describeItem)).toEqual([
        'stage:Qualified>Proposal',
        'stage:new>Qualified',
        'create:name,ownerId'
      ])
    })

    it('pages history without repeating or skipping, even at the same moment', async () => {
      const { halden, priya } = await seed()
      const on = company$(halden.id)
      // A new deal writes its stage row and nothing else on this timeline;
      // several in a row land within the same millisecond or two.
      for (const name of ['One', 'Two', 'Three']) {
        await records.deals.create(ravi, { companyId: halden.id, name })
      }
      for (const body of ['a', 'b', 'c', 'd']) {
        await records.timeline.activities.create(ravi, {
          type: 'note',
          on,
          body
        })
      }
      // Rows that share one exact moment, across two kinds.
      const same = daysAgo(1)
      await records.timeline.activities.create(ravi, {
        type: 'call',
        on,
        occurredAt: same,
        body: 'same-1'
      })
      await records.timeline.activities.create(ravi, {
        type: 'call',
        on,
        occurredAt: same,
        body: 'same-2',
        personIds: [priya.id]
      })
      const finished = await records.timeline.tasks.create(ravi, {
        title: 'Same moment',
        on
      })
      await records.timeline.tasks.complete(ravi, finished.id, 1)
      await db
        .update(task)
        .set({ completedAt: new Date(same) })
        .where(eq(task.id, finished.id))
      await records.timeline.tasks.create(ravi, { title: 'Still open', on })

      const whole = (await read(ravi, on, 100)).items
      const key = (item: TTimelineItem) => `${item.kind}:${item.id}`
      expect(whole).toHaveLength(12)

      const walked: TTimelineItem[] = []
      let cursor: string | undefined
      let pages = 0
      do {
        const page = await records.timeline.read(ravi, on, { limit: 2, cursor })
        // Only the first page carries what's upcoming.
        expect(page.items.some((item) => item.upcoming)).toBe(pages === 0)
        walked.push(...page.items)
        cursor = page.nextCursor ?? undefined
        pages += 1
      } while (cursor && pages < 20)

      expect(walked.map(key)).toEqual(whole.map(key))
      expect(new Set(walked.map(key)).size).toBe(walked.length)
      expect(pages).toBeGreaterThan(4)
    })

    it('answers not found for a record that isn’t there', async () => {
      await expect(
        read(ravi, company$('0198c1f0-0000-7000-8000-000000000000'))
      ).rejects.toBeInstanceOf(RecordNotFoundError)
      await expect(read(ravi, deal$('nope'))).rejects.toBeInstanceOf(
        RecordNotFoundError
      )
    })
  })

  describe('a record’s people', () => {
    it('lists everyone at a company, and those linked to a deal', async () => {
      const { halden, priya, tom } = await seed()
      await records.people.archive(ravi, tom.id, 1)
      const at = await records.timeline.peopleAt(lena, halden.id)
      expect(at.map(({ name }) => name)).toEqual(['Priya Nair'])
      expect(at[0].canEdit).toBe(false)

      const rollout = await records.deals.create(ravi, {
        companyId: halden.id,
        name: 'Platform rollout'
      })
      expect(await records.timeline.peopleOnDeal(ravi, rollout.id)).toEqual([])
      await db.execute(
        sql`insert into deal_person (deal_id, person_id) values (${rollout.id}, ${priya.id})`
      )
      const linked = await records.timeline.peopleOnDeal(ravi, rollout.id)
      expect(linked.map(({ name }) => name)).toEqual(['Priya Nair'])
    })
  })

  describe('over HTTP', () => {
    const appFor = (me: TSessionUser | null) =>
      createApp({
        version: 'test',
        isDatabaseReachable: async () => true,
        handleAuth: async () => new Response(null, { status: 404 }),
        getSessionUser: async () => me,
        setup: {} as TSetupService,
        team: {} as TTeamService,
        records
      })

    const send = (me: TSessionUser | null, path: string, body?: unknown) =>
      appFor(me).request(`/api/v1${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      })

    it('needs a session', async () => {
      const { halden } = await seed()
      for (const path of [
        '/tasks?due=today',
        `/companies/${halden.id}/timeline`,
        `/companies/${halden.id}/people`
      ]) {
        expect((await send(null, path)).status).toBe(401)
      }
      const posted = await send(null, '/activities', {
        type: 'note',
        on: company$(halden.id),
        body: 'x'
      })
      expect(posted.status).toBe(401)
    })

    it('serves the timeline, the tasks-due list, and the usual refusals', async () => {
      const { halden } = await seed()
      const noted = await send(lena, '/activities', {
        type: 'note',
        on: company$(halden.id),
        body: 'From the API'
      })
      expect(noted.status).toBe(201)
      const { id: noteId } = (await noted.json()) as { id: string }

      const made = await send(lena, '/tasks', {
        title: 'Chase the invoice',
        dueOn: dayFromNow(-1),
        on: company$(halden.id)
      })
      expect(made.status).toBe(201)
      const { id: taskId } = (await made.json()) as { id: string }

      const due = await send(lena, '/tasks?due=today')
      expect(due.status).toBe(200)
      expect(await due.json()).toMatchObject({
        items: [{ id: taskId, title: 'Chase the invoice' }],
        nextCursor: null
      })

      const timeline = await send(lena, `/companies/${halden.id}/timeline`)
      expect(timeline.status).toBe(200)
      const { items } = (await timeline.json()) as { items: TTimelineItem[] }
      expect(items.map(describeItem)).toEqual([
        'task:Chase the invoice',
        'note:From the API',
        'create:name,ownerId'
      ])

      const empty = await send(lena, '/activities', {
        type: 'note',
        on: company$(halden.id),
        body: '  '
      })
      expect(empty.status).toBe(400)

      const forbidden = await appFor(ravi).request(
        `/api/v1/activities/${noteId}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ body: 'Not mine' })
        }
      )
      expect(forbidden.status).toBe(403)

      const stale = await send(lena, `/tasks/${taskId}/complete`, {
        version: 9
      })
      expect(stale.status).toBe(409)
      expect(await stale.json()).toMatchObject({
        error: { code: 'changed_since' }
      })
      expect(
        (await send(lena, `/tasks/${taskId}/complete`, { version: 1 })).status
      ).toBe(200)
      expect((await send(lena, '/people/not-an-id/timeline')).status).toBe(404)
    })
  })
})
