/*
 * The records service against a real Postgres: role checks, versions,
 * archiving, stage moves and the change log. Runs only with
 * TEST_DATABASE_URL set (`bun run test:db`), and only on a database whose
 * name says "test", because it empties it first.
 */
import type { TSessionUser } from '@open-sales/shared'
import { and, eq, sql } from 'drizzle-orm'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createApp } from '../app'
import type { TDatabase } from '../db/client'
import { createDatabase } from '../db/client'
import { runMigrations } from '../db/migrate'
import { changeLog, dealStageChange, user, workspace } from '../db/schema'
import type { TSetupService } from '../setup'
import type { TTeamService } from '../team'
import type { TActor } from './common'
import {
  ChangedSinceError,
  DuplicateError,
  InvalidChangeError,
  NotAllowedError
} from './common'
import type { TRecordsService } from './routes'
import { createRecordsService } from './routes'

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

describe.skipIf(!DATABASE_URL)('records service (database)', () => {
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
      sql`truncate company, person, deal, deal_person, deal_stage_change, change_log, "user" cascade`
    )
    await db.delete(workspace)
    await db.insert(workspace).values({ name: 'Halden', currency: 'USD' })
    await db.insert(user).values(
      Object.values(PEOPLE).map((p) => ({
        ...p,
        email: `${p.id}@halden.com`,
        status: 'active'
      }))
    )
  })

  const newCompany = (me: TActor, name: string, domain?: string) =>
    records.companies.create(me, { name, domain })

  describe('companies', () => {
    it('belong to whoever makes them, and only managers give them away', async () => {
      const halden = await newCompany(
        ravi,
        'Halden Capital',
        'https://www.Halden.com/'
      )
      expect(halden).toMatchObject({
        owner: { id: ravi.id, name: 'Ravi Shah' },
        domain: 'halden.com',
        version: 1,
        canEdit: true
      })
      await expect(
        records.companies.create(ravi, { name: 'Acme', ownerId: lena.id })
      ).rejects.toBeInstanceOf(NotAllowedError)
      const forLena = await records.companies.create(manager, {
        name: 'Acme',
        ownerId: lena.id
      })
      expect(forLena.owner.id).toBe(lena.id)
    })

    it('keeps one company per domain', async () => {
      await newCompany(ravi, 'Halden Capital', 'halden.com')
      await expect(newCompany(lena, 'Halden', 'HALDEN.com')).rejects.toThrow(
        DuplicateError
      )
    })

    it('lets members change only their own', async () => {
      const halden = await newCompany(ravi, 'Halden Capital')
      await expect(
        records.companies.update(lena, halden.id, { name: 'X', version: 1 })
      ).rejects.toBeInstanceOf(NotAllowedError)
      const asLena = await records.companies.get(lena, halden.id)
      expect(asLena.canEdit).toBe(false)
      const renamed = await records.companies.update(manager, halden.id, {
        name: 'Halden Capital Ltd',
        version: 1
      })
      expect(renamed).toMatchObject({ name: 'Halden Capital Ltd', version: 2 })
    })

    it('refuses a change made against an old version', async () => {
      const halden = await newCompany(ravi, 'Halden Capital')
      await records.companies.update(ravi, halden.id, {
        industry: 'Finance',
        version: 1
      })
      await expect(
        records.companies.update(ravi, halden.id, { name: 'X', version: 1 })
      ).rejects.toBeInstanceOf(ChangedSinceError)
    })

    it('hands the old owner’s open deals to the new owner', async () => {
      const halden = await newCompany(ravi, 'Halden Capital')
      const deal = await records.deals.create(ravi, {
        companyId: halden.id,
        name: 'Platform'
      })
      await records.companies.update(manager, halden.id, {
        ownerId: lena.id,
        version: 1
      })
      const moved = await records.deals.get(lena, deal.id)
      expect(moved).toMatchObject({ owner: { id: lena.id }, version: 2 })
    })

    it('archives with its people and open deals, and restores exactly those', async () => {
      const halden = await newCompany(ravi, 'Halden Capital')
      const priya = await records.people.create(ravi, {
        companyId: halden.id,
        name: 'Priya Nair'
      })
      const open = await records.deals.create(ravi, {
        companyId: halden.id,
        name: 'Platform'
      })

      const archived = await records.companies.archive(ravi, halden.id, 1)
      expect(archived.archivedAt).not.toBeNull()
      expect((await records.people.get(ravi, priya.id)).archivedAt).toBe(
        archived.archivedAt
      )
      expect((await records.deals.get(ravi, open.id)).archivedAt).toBe(
        archived.archivedAt
      )
      const listed = await records.companies.list(ravi, {
        owner: 'anyone',
        archived: false,
        limit: 50
      })
      expect(listed.items).toHaveLength(0)

      await records.companies.restore(ravi, halden.id, archived.version)
      expect((await records.people.get(ravi, priya.id)).archivedAt).toBeNull()
      expect((await records.deals.get(ravi, open.id)).archivedAt).toBeNull()
    })

    it('pages A–Z with a cursor', async () => {
      for (const name of ['Delta', 'Alpha', 'Charlie', 'Bravo', 'Echo']) {
        await newCompany(ravi, name)
      }
      const query = { owner: 'anyone' as const, archived: false, limit: 2 }
      const first = await records.companies.list(ravi, query)
      const second = await records.companies.list(ravi, {
        ...query,
        cursor: first.nextCursor ?? undefined
      })
      const third = await records.companies.list(ravi, {
        ...query,
        cursor: second.nextCursor ?? undefined
      })
      expect(
        [...first.items, ...second.items, ...third.items].map((c) => c.name)
      ).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'])
      expect(third.nextCursor).toBeNull()
    })
  })

  describe('people', () => {
    it('can only be added to a company you may change', async () => {
      const halden = await newCompany(ravi, 'Halden Capital')
      await expect(
        records.people.create(lena, { companyId: halden.id, name: 'Priya' })
      ).rejects.toBeInstanceOf(NotAllowedError)
      await expect(
        records.people.create(ravi, {
          companyId: '00000000-0000-7000-8000-000000000000',
          name: 'Priya'
        })
      ).rejects.toBeInstanceOf(InvalidChangeError)
    })

    it('keep one person per email', async () => {
      const halden = await newCompany(ravi, 'Halden Capital')
      await records.people.create(ravi, {
        companyId: halden.id,
        name: 'Priya Nair',
        email: 'priya@halden.com'
      })
      await expect(
        records.people.create(ravi, {
          companyId: halden.id,
          name: 'P. Nair',
          email: 'PRIYA@halden.com'
        })
      ).rejects.toThrow('Priya Nair at Halden Capital already has')
    })

    it('are found by name or email', async () => {
      const halden = await newCompany(ravi, 'Halden Capital')
      await records.people.create(ravi, {
        companyId: halden.id,
        name: 'Priya Nair',
        email: 'priya@halden.com'
      })
      const query = { owner: 'anyone' as const, archived: false, limit: 50 }
      expect(
        (await records.people.list(lena, { ...query, q: 'NAIR' })).items
      ).toHaveLength(1)
      expect(
        (await records.people.list(lena, { ...query, q: 'priya@' })).items
      ).toHaveLength(1)
      expect(
        (await records.people.list(lena, { ...query, q: '%' })).items
      ).toHaveLength(0)
    })
  })

  describe('deals', () => {
    it('start in the first stage, owned like their company, in the workspace currency', async () => {
      const halden = await newCompany(ravi, 'Halden Capital')
      const pipeline = await records.pipeline.get()
      const deal = await records.deals.create(ravi, {
        companyId: halden.id,
        name: 'Platform',
        valueMinor: 1_250_000
      })
      expect(deal).toMatchObject({
        stageId: pipeline.stages[0].id,
        status: 'open',
        owner: { id: ravi.id },
        currency: 'USD',
        closedAt: null
      })
      const moves = await db
        .select()
        .from(dealStageChange)
        .where(eq(dealStageChange.dealId, deal.id))
      expect(moves).toHaveLength(1)
    })

    it('need a reason to be lost, and reopen cleanly', async () => {
      const halden = await newCompany(ravi, 'Halden Capital')
      const { stages, lostReasons } = await records.pipeline.get()
      const lost = stages.find((s) => s.kind === 'lost')!
      const deal = await records.deals.create(ravi, {
        companyId: halden.id,
        name: 'Platform'
      })

      await expect(
        records.deals.update(ravi, deal.id, { stageId: lost.id, version: 1 })
      ).rejects.toThrow('Choose why the deal was lost.')

      const closed = await records.deals.update(ravi, deal.id, {
        stageId: lost.id,
        lostReasonId: lostReasons[0].id,
        version: 1
      })
      expect(closed).toMatchObject({
        status: 'lost',
        lostReasonId: lostReasons[0].id
      })
      expect(closed.closedAt).not.toBeNull()
      expect(closed.closeDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)

      const reopened = await records.deals.update(ravi, deal.id, {
        stageId: stages[1].id,
        version: closed.version
      })
      expect(reopened).toMatchObject({
        status: 'open',
        lostReasonId: null,
        closedAt: null
      })
    })

    it('can be changed by the deal’s owner even on someone else’s company', async () => {
      const halden = await newCompany(ravi, 'Halden Capital')
      const deal = await records.deals.create(manager, {
        companyId: halden.id,
        name: 'Platform',
        ownerId: lena.id
      })
      const changed = await records.deals.update(lena, deal.id, {
        nextStep: 'Send pricing',
        version: 1
      })
      expect(changed.nextStep).toBe('Send pricing')
      await expect(
        records.deals.update(lena, deal.id, {
          ownerId: ravi.id,
          version: changed.version
        })
      ).rejects.toBeInstanceOf(NotAllowedError)
    })

    it('fill the board, with each column’s count and value', async () => {
      const halden = await newCompany(ravi, 'Halden Capital')
      const { stages } = await records.pipeline.get()
      await records.deals.create(ravi, {
        companyId: halden.id,
        name: 'A',
        valueMinor: 100_00
      })
      await records.deals.create(ravi, {
        companyId: halden.id,
        name: 'B',
        valueMinor: 250_00
      })
      // Other currencies are counted but not added to the value.
      await records.deals.create(ravi, {
        companyId: halden.id,
        name: 'C',
        valueMinor: 999_00,
        currency: 'EUR'
      })
      await records.deals.create(ravi, {
        companyId: halden.id,
        name: 'D',
        stageId: stages[2].id
      })

      const board = await records.pipeline.board(ravi)
      expect(board.columns.map((c) => c.count)).toEqual([3, 0, 1, 0])
      expect(board.columns[0].valueMinor).toBe(350_00)
      expect(board.columns[0].deals).toHaveLength(3)
    })
  })

  it('writes every change to the change log', async () => {
    const halden = await newCompany(ravi, 'Halden Capital', 'halden.com')
    await records.companies.update(ravi, halden.id, {
      industry: 'Finance',
      version: 1
    })
    const log = await db
      .select()
      .from(changeLog)
      .where(
        and(
          eq(changeLog.recordType, 'company'),
          eq(changeLog.recordId, halden.id)
        )
      )
      .orderBy(changeLog.id)
    expect(log.map((entry) => entry.action)).toEqual(['create', 'update'])
    expect(log[1]).toMatchObject({
      actorId: ravi.id,
      via: 'app',
      changes: [{ field: 'industry', from: null, to: 'Finance' }]
    })
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
        records
      })

    const post = (path: string, body: unknown) =>
      new Request(`http://test/api/v1${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })

    it('needs a sign-in', async () => {
      const response = await appAs(null).request('/api/v1/companies')
      expect(response.status).toBe(401)
    })

    it('answers each problem with its own status and code', async () => {
      const app = appAs(ravi)
      const made = await app.request(
        post('/companies', { name: 'Halden', domain: 'halden.com' })
      )
      expect(made.status).toBe(201)
      const halden = (await made.json()) as { id: string }

      const duplicate = await app.request(
        post('/companies', { name: 'H', domain: 'halden.com' })
      )
      expect(duplicate.status).toBe(409)
      expect(await duplicate.json()).toMatchObject({
        error: { code: 'domain_taken' }
      })

      const empty = await app.request(post('/companies', { name: '' }))
      expect(empty.status).toBe(400)

      const forbidden = await appAs(lena).request(
        post(`/companies/${halden.id}/archive`, { version: 1 })
      )
      expect(forbidden.status).toBe(403)

      const stale = await app.request(
        new Request(`http://test/api/v1/companies/${halden.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'X', version: 9 })
        })
      )
      expect(stale.status).toBe(409)
      expect(await stale.json()).toMatchObject({
        error: { code: 'changed_since' }
      })

      expect((await app.request('/api/v1/companies/not-an-id')).status).toBe(
        404
      )
      expect((await app.request('/api/v1/pipeline/board')).status).toBe(200)
    })
  })
})
