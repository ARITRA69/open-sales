/*
 * What the Pipeline page asks of the server, against a real Postgres:
 * people on a new deal, closing as won or lost, and reading the lost
 * reasons. Runs only with TEST_DATABASE_URL set, on a database of its own
 * (the name given, ending `_pipeline`), because it empties it first and the
 * other database tests may be running beside it.
 */
import type { TSessionUser } from '@open-sales/shared'
import { dealPeopleResponseSchema, pipelineSchema } from '@open-sales/shared'
import { eq, sql } from 'drizzle-orm'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createApp } from '../app'
import type { TDatabase } from '../db/client'
import { createDatabase } from '../db/client'
import { runMigrations } from '../db/migrate'
import { changeLog, dealPerson, user, workspace } from '../db/schema'
import type { TSetupService } from '../setup'
import type { TTeamService } from '../team'
import type { TActor } from './common'
import { InvalidChangeError, NotAllowedError } from './common'
import type { TRecordsService } from './routes'
import { createRecordsService } from './routes'

const ownDatabase = (url: string | undefined) => {
  if (!url) return undefined
  const own = new URL(url)
  if (!own.pathname.endsWith('_pipeline')) own.pathname += '_pipeline'
  return own.toString()
}

const DATABASE_URL = ownDatabase(process.env.TEST_DATABASE_URL)

const PEOPLE = {
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

describe.skipIf(!DATABASE_URL)('pipeline (database)', () => {
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

  const newCompany = (me: TActor, name: string) =>
    records.companies.create(me, { name })
  const newPerson = (me: TActor, companyId: string, name: string) =>
    records.people.create(me, { companyId, name })

  const today = () => new Intl.DateTimeFormat('en-CA').format(new Date())

  describe('people on a new deal', () => {
    it('are saved with it, once each, and read back A–Z', async () => {
      const halden = await newCompany(ravi, 'Halden Capital')
      const tom = await newPerson(ravi, halden.id, 'Tom Becker')
      const priya = await newPerson(ravi, halden.id, 'Priya Nair')

      const deal = await records.deals.create(ravi, {
        companyId: halden.id,
        name: 'Platform rollout',
        personIds: [tom.id, priya.id, tom.id]
      })

      const people = await records.deals.people(lena, deal.id)
      expect(people).toEqual([
        {
          id: priya.id,
          name: 'Priya Nair',
          title: null,
          email: null,
          role: null
        },
        { id: tom.id, name: 'Tom Becker', title: null, email: null, role: null }
      ])
    })

    it('must work at the deal’s company and still be in use', async () => {
      const halden = await newCompany(ravi, 'Halden Capital')
      const lumen = await newCompany(ravi, 'Lumen Retail')
      const mei = await newPerson(ravi, lumen.id, 'Mei Lin')
      const tom = await newPerson(ravi, halden.id, 'Tom Becker')
      await records.people.archive(ravi, tom.id, tom.version)

      for (const personIds of [[mei.id], [tom.id], ['not-an-id']]) {
        await expect(
          records.deals.create(ravi, {
            companyId: halden.id,
            name: 'Platform rollout',
            personIds
          })
        ).rejects.toThrow('Choose people who work at this company.')
      }
      // Nothing half-made is left behind.
      const { items } = await records.deals.list(ravi, {
        owner: 'anyone',
        archived: false,
        limit: 50
      })
      expect(items).toHaveLength(0)
      expect(await db.select().from(dealPerson)).toHaveLength(0)
    })

    it('are written to the change log with the deal', async () => {
      const halden = await newCompany(ravi, 'Halden Capital')
      const tom = await newPerson(ravi, halden.id, 'Tom Becker')
      const deal = await records.deals.create(ravi, {
        companyId: halden.id,
        name: 'Platform rollout',
        personIds: [tom.id]
      })
      const [logged] = await db
        .select()
        .from(changeLog)
        .where(eq(changeLog.recordId, deal.id))
      expect(logged).toMatchObject({ action: 'create', actorId: ravi.id })
      expect(logged.changes).toContainEqual({
        field: 'personIds',
        from: null,
        to: [tom.id]
      })
    })

    it('can’t be added by a member to someone else’s company', async () => {
      const halden = await newCompany(ravi, 'Halden Capital')
      const tom = await newPerson(ravi, halden.id, 'Tom Becker')
      await expect(
        records.deals.create(lena, {
          companyId: halden.id,
          name: 'Platform rollout',
          personIds: [tom.id]
        })
      ).rejects.toBeInstanceOf(NotAllowedError)
      expect(await db.select().from(dealPerson)).toHaveLength(0)
    })

    it('leave out anyone archived since', async () => {
      const halden = await newCompany(ravi, 'Halden Capital')
      const tom = await newPerson(ravi, halden.id, 'Tom Becker')
      const deal = await records.deals.create(ravi, {
        companyId: halden.id,
        name: 'Platform rollout',
        personIds: [tom.id]
      })
      await records.people.archive(ravi, tom.id, tom.version)
      expect(await records.deals.people(ravi, deal.id)).toEqual([])
    })
  })

  describe('closing a deal', () => {
    const openDeal = async () => {
      const halden = await newCompany(ravi, 'Halden Capital')
      const deal = await records.deals.create(ravi, {
        companyId: halden.id,
        name: 'Platform rollout',
        valueMinor: 4_800_000,
        closeDate: '2026-12-15'
      })
      const pipeline = await records.pipeline.get()
      return {
        deal,
        won: pipeline.stages.find((s) => s.kind === 'won')!,
        lost: pipeline.stages.find((s) => s.kind === 'lost')!,
        pipeline
      }
    }

    it('as won keeps the final value and the day it closed', async () => {
      const { deal, won } = await openDeal()
      const closed = await records.deals.update(ravi, deal.id, {
        stageId: won.id,
        valueMinor: 4_500_000,
        closeDate: '2026-11-28',
        version: deal.version
      })
      expect(closed).toMatchObject({
        status: 'won',
        valueMinor: 4_500_000,
        closeDate: '2026-11-28',
        version: deal.version + 1
      })
      expect(closed.closedAt).not.toBeNull()

      const board = await records.pipeline.board(ravi)
      expect(board.columns.flatMap((column) => column.deals)).toHaveLength(0)
    })

    it('always leaves a close date: today when none is sent', async () => {
      const { deal, won } = await openDeal()
      const closed = await records.deals.update(ravi, deal.id, {
        stageId: won.id,
        closeDate: null,
        version: deal.version
      })
      expect(closed.closeDate).toBe(today())
      await expect(
        records.deals.update(ravi, deal.id, {
          closeDate: null,
          version: closed.version
        })
      ).rejects.toThrow('A closed deal needs the day it closed.')
    })

    it('as lost needs one of the workspace’s reasons, and keeps the note', async () => {
      const { deal, lost, pipeline } = await openDeal()
      await expect(
        records.deals.update(ravi, deal.id, {
          stageId: lost.id,
          lostReasonId: deal.id,
          version: deal.version
        })
      ).rejects.toBeInstanceOf(InvalidChangeError)

      const reason = pipeline.lostReasons[0]
      const closed = await records.deals.update(ravi, deal.id, {
        stageId: lost.id,
        lostReasonId: reason.id,
        lostNote: '  Went with a cheaper tool  ',
        version: deal.version
      })
      expect(closed).toMatchObject({
        status: 'lost',
        lostReasonId: reason.id,
        lostNote: 'Went with a cheaper tool',
        closeDate: today()
      })
    })

    it('is refused for a member who owns neither the deal nor its company', async () => {
      const { deal, won } = await openDeal()
      await expect(
        records.deals.update(lena, deal.id, {
          stageId: won.id,
          version: deal.version
        })
      ).rejects.toBeInstanceOf(NotAllowedError)
      const asLena = await records.deals.get(lena, deal.id)
      expect(asLena).toMatchObject({ status: 'open', canEdit: false })
      // A manager can.
      const closed = await records.deals.update(manager, deal.id, {
        stageId: won.id,
        version: deal.version
      })
      expect(closed.status).toBe('won')
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

    it('takes people with a new deal and lists them', async () => {
      const halden = await newCompany(ravi, 'Halden Capital')
      const tom = await newPerson(ravi, halden.id, 'Tom Becker')
      const app = appAs(ravi)

      const made = await app.request(
        post('/deals', {
          companyId: halden.id,
          name: 'Platform rollout',
          personIds: [tom.id]
        })
      )
      expect(made.status).toBe(201)
      const deal = (await made.json()) as { id: string }

      const listed = await appAs(lena).request(
        `/api/v1/deals/${deal.id}/people`
      )
      expect(listed.status).toBe(200)
      expect(dealPeopleResponseSchema.parse(await listed.json())).toEqual({
        people: [
          {
            id: tom.id,
            name: 'Tom Becker',
            title: null,
            email: null,
            role: null
          }
        ]
      })

      const stranger = await app.request(
        post('/deals', {
          companyId: halden.id,
          name: 'Another',
          personIds: [halden.id]
        })
      )
      expect(stranger.status).toBe(400)
      expect(await stranger.json()).toMatchObject({
        error: { code: 'invalid_change' }
      })
    })

    it('answers 404 for people on a deal that isn’t there, and 401 signed out', async () => {
      const app = appAs(ravi)
      expect((await app.request('/api/v1/deals/nope/people')).status).toBe(404)
      expect(
        (
          await app.request(
            '/api/v1/deals/0193a7f0-0000-7000-8000-000000000000/people'
          )
        ).status
      ).toBe(404)
      const halden = await newCompany(ravi, 'Halden Capital')
      const deal = await records.deals.create(ravi, {
        companyId: halden.id,
        name: 'Platform rollout'
      })
      expect(
        (await appAs(null).request(`/api/v1/deals/${deal.id}/people`)).status
      ).toBe(401)
    })

    it('reads the lost reasons with the pipeline', async () => {
      const response = await appAs(lena).request('/api/v1/pipeline')
      expect(response.status).toBe(200)
      const pipeline = pipelineSchema.parse(await response.json())
      expect(pipeline.lostReasons.length).toBeGreaterThan(0)
      expect(pipeline.stages.filter((s) => s.kind === 'lost')).toHaveLength(1)
      expect(pipeline.stages.filter((s) => s.kind === 'won')).toHaveLength(1)
    })
  })
})
