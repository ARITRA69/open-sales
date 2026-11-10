/*
 * The reports against a real Postgres: each report's numbers, checked
 * against deals seeded here, and the forecast's manager-only rule. Runs only
 * with TEST_DATABASE_URL set, and only on a database whose name says "test",
 * because it empties it first:
 *
 *   TEST_DATABASE_URL=postgres://open_sales:open-sales@localhost:5433/open_sales_test_reports \
 *     bunx vitest run src/reports
 */
import type { TSessionUser } from '@open-sales/shared'
import { asc, eq, sql } from 'drizzle-orm'
import postgres from 'postgres'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest'

import { createApp } from '../app'
import type { TDatabase } from '../db/client'
import { createDatabase } from '../db/client'
import { runMigrations } from '../db/migrate'
import {
  company,
  deal,
  dealStageChange,
  lostReason,
  stage,
  user,
  workspace
} from '../db/schema'
import type { TActor } from '../records/common'
import { NotAllowedError } from '../records/common'
import type { TSetupService } from '../setup'
import type { TTeamService } from '../team'
import type { TReportsService } from './routes'
import { createReportsService } from './routes'

const DATABASE_URL = process.env.TEST_DATABASE_URL

// "Today" for every test: a Tuesday in the fourth quarter.
const NOW = '2026-11-10T12:00:00Z'

const PEOPLE = {
  admin: { id: 'u-admin', name: 'Asha Menon', role: 'admin' },
  manager: { id: 'u-manager', name: 'Mo Rahman', role: 'manager' },
  ravi: { id: 'u-ravi', name: 'Ravi Shah', role: 'member' },
  lena: { id: 'u-lena', name: 'Lena Ortiz', role: 'member' }
} as const

type TWho = keyof typeof PEOPLE

const actor = (who: TWho): TActor => ({
  ...PEOPLE[who],
  email: `${PEOPLE[who].id}@halden.com`
})
const admin = actor('admin')
const manager = actor('manager')
const ravi = actor('ravi')

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

type TStageName =
  | 'Qualified'
  | 'Discovery'
  | 'Proposal'
  | 'Negotiation'
  | 'Won'
  | 'Lost'

type TSeedDeal = {
  name: string
  owner: TWho
  // Where the deal is now.
  stage: TStageName
  value?: number | null
  currency?: string
  closeDate?: string | null
  closedAt?: string
  lostReason?: string
  archived?: boolean
  // Every move, oldest first: the stage it went to, and when.
  moves?: [TStageName, string][]
}

describe.skipIf(!DATABASE_URL)('reports service (database)', () => {
  let db: TDatabase
  let close: () => Promise<void>
  let reports: TReportsService
  let stageIds: Record<string, string>
  let reasonIds: Record<string, string>
  let pipelineId: string
  let companyId: string

  beforeAll(async () => {
    await ensureDatabase(DATABASE_URL!)
    const connection = createDatabase(DATABASE_URL!)
    db = connection.db
    close = () => connection.sql.end()
    await runMigrations(db)
    reports = createReportsService(db)

    const stages = await db.select().from(stage).orderBy(asc(stage.position))
    stageIds = Object.fromEntries(stages.map((row) => [row.name, row.id]))
    pipelineId = stages[0].pipelineId
    const reasons = await db.select().from(lostReason)
    reasonIds = Object.fromEntries(reasons.map((row) => [row.label, row.id]))
  })

  afterAll(async () => {
    await close?.()
  })

  beforeEach(async () => {
    // Only the clock the service reads; the database driver keeps its timers.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(NOW))
    await db.execute(
      sql`truncate company, person, deal, deal_person, deal_stage_change, change_log, "user" cascade`
    )
    await db.delete(workspace)
    await db.insert(workspace).values({ name: 'Halden', currency: 'USD' })
    await db.insert(user).values(
      Object.values(PEOPLE).map((person) => ({
        ...person,
        email: `${person.id}@halden.com`,
        status: 'active'
      }))
    )
    const [halden] = await db
      .insert(company)
      .values({ name: 'Halden Capital', ownerId: PEOPLE.ravi.id })
      .returning()
    companyId = halden.id
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /** Puts deals straight into the tables, with the dates the tests need. */
  const seed = async (deals: TSeedDeal[]) => {
    for (const seeded of deals) {
      const kind =
        seeded.stage === 'Won'
          ? 'won'
          : seeded.stage === 'Lost'
            ? 'lost'
            : 'open'
      const [created] = await db
        .insert(deal)
        .values({
          name: seeded.name,
          companyId,
          ownerId: PEOPLE[seeded.owner].id,
          pipelineId,
          stageId: stageIds[seeded.stage],
          status: kind,
          valueMinor: seeded.value === undefined ? 100_000 : seeded.value,
          currency: seeded.currency ?? 'USD',
          closeDate: seeded.closeDate ?? null,
          closedAt: seeded.closedAt ? new Date(seeded.closedAt) : null,
          lostReasonId: seeded.lostReason ? reasonIds[seeded.lostReason] : null,
          archivedAt: seeded.archived ? new Date(NOW) : null
        })
        .returning()
      const moves = seeded.moves ?? []
      if (moves.length > 0) {
        await db.insert(dealStageChange).values(
          moves.map(([to, at], index) => ({
            dealId: created.id,
            fromStageId: index === 0 ? null : stageIds[moves[index - 1][0]],
            toStageId: stageIds[to],
            changedAt: new Date(at),
            changedById: PEOPLE[seeded.owner].id
          }))
        )
      }
    }
  }

  const usd = (valueMinor: number) => ({ currency: 'USD', valueMinor })
  const eur = (valueMinor: number) => ({ currency: 'EUR', valueMinor })

  describe('pipeline by stage', () => {
    const DEALS: TSeedDeal[] = [
      {
        name: 'A',
        owner: 'ravi',
        stage: 'Qualified',
        value: 100_000,
        moves: [['Qualified', '2026-10-05T10:00:00Z']]
      },
      {
        name: 'B',
        owner: 'ravi',
        stage: 'Proposal',
        value: 500_000,
        moves: [
          ['Qualified', '2026-10-01T10:00:00Z'],
          ['Discovery', '2026-10-10T10:00:00Z'],
          ['Proposal', '2026-10-20T10:00:00Z']
        ]
      },
      {
        // Came in before the quarter, and skipped Discovery.
        name: 'C',
        owner: 'lena',
        stage: 'Proposal',
        value: 200_000,
        currency: 'EUR',
        moves: [
          ['Qualified', '2026-09-01T10:00:00Z'],
          ['Proposal', '2026-10-15T10:00:00Z']
        ]
      },
      {
        name: 'D',
        owner: 'lena',
        stage: 'Proposal',
        value: null,
        moves: [['Proposal', '2026-11-01T10:00:00Z']]
      },
      {
        name: 'W',
        owner: 'ravi',
        stage: 'Won',
        closedAt: '2026-10-25T10:00:00Z',
        moves: [
          ['Proposal', '2026-10-02T10:00:00Z'],
          ['Won', '2026-10-25T10:00:00Z']
        ]
      },
      {
        name: 'L',
        owner: 'lena',
        stage: 'Lost',
        closedAt: '2026-10-09T10:00:00Z',
        lostReason: 'Price',
        moves: [
          ['Qualified', '2026-10-03T10:00:00Z'],
          ['Lost', '2026-10-09T10:00:00Z']
        ]
      },
      {
        // Archived deals are left out everywhere.
        name: 'Gone',
        owner: 'ravi',
        stage: 'Qualified',
        archived: true,
        moves: [
          ['Qualified', '2026-10-04T10:00:00Z'],
          ['Discovery', '2026-10-06T10:00:00Z']
        ]
      }
    ]

    it('counts open deals per stage, with a total per currency', async () => {
      await seed(DEALS)
      const report = await reports.pipeline(ravi, { period: 'this_quarter' })

      expect(report.range).toEqual({ from: '2026-10-01', to: '2026-12-31' })
      expect(report.currency).toBe('USD')
      expect(
        report.stages.map(({ name, openCount, openTotals }) => ({
          name,
          openCount,
          openTotals
        }))
      ).toEqual([
        { name: 'Qualified', openCount: 1, openTotals: [usd(100_000)] },
        { name: 'Discovery', openCount: 0, openTotals: [] },
        {
          name: 'Proposal',
          openCount: 3,
          // The workspace's currency first. D has no value yet.
          openTotals: [usd(500_000), eur(200_000)]
        },
        { name: 'Negotiation', openCount: 0, openTotals: [] }
      ])
      // The open deals behind it, biggest first, unknown values last.
      expect(report.deals.map((row) => row.name)).toEqual(['B', 'C', 'A', 'D'])
      expect(report.deals[0]).toMatchObject({
        companyName: 'Halden Capital',
        ownerName: 'Ravi Shah',
        stage: { name: 'Proposal', winProbability: 50 },
        status: 'open'
      })
      expect(report.dealsTruncated).toBe(false)
    })

    it('works out how deals that entered each stage moved on', async () => {
      await seed(DEALS)
      const report = await reports.pipeline(ravi, { period: 'this_quarter' })

      expect(
        report.stages.map(({ name, entered, movedOn, conversion }) => ({
          name,
          entered,
          movedOn,
          conversion
        }))
      ).toEqual([
        // A, B and L came in; only B went further. Lost isn't further.
        { name: 'Qualified', entered: 3, movedOn: 1, conversion: 1 / 3 },
        { name: 'Discovery', entered: 1, movedOn: 1, conversion: 1 },
        // B, C, D and W came in; W was won.
        { name: 'Proposal', entered: 4, movedOn: 1, conversion: 0.25 },
        { name: 'Negotiation', entered: 0, movedOn: 0, conversion: null }
      ])
    })

    it('narrows to one owner, and to the period', async () => {
      await seed(DEALS)
      const mine = await reports.pipeline(ravi, {
        period: 'this_quarter',
        ownerId: PEOPLE.ravi.id
      })
      expect(
        mine.stages.map(({ openCount, entered, movedOn }) => [
          openCount,
          entered,
          movedOn
        ])
      ).toEqual([
        [1, 2, 1],
        [0, 1, 1],
        [1, 2, 1],
        [0, 0, 0]
      ])
      expect(mine.deals.map((row) => row.name)).toEqual(['B', 'A'])

      // Last quarter only C came in. What's open now doesn't depend on it.
      const before = await reports.pipeline(ravi, { period: 'last_quarter' })
      expect(before.range).toEqual({ from: '2026-07-01', to: '2026-09-30' })
      expect(before.stages[0]).toMatchObject({
        openCount: 1,
        entered: 1,
        movedOn: 1,
        conversion: 1
      })
      expect(before.stages[2]).toMatchObject({ openCount: 3, entered: 0 })
    })
  })

  describe('won and lost', () => {
    const DEALS: TSeedDeal[] = [
      {
        name: 'Won big',
        owner: 'ravi',
        stage: 'Won',
        value: 1_000_000,
        closedAt: '2026-10-25T10:00:00Z'
      },
      {
        name: 'Won in euros',
        owner: 'lena',
        stage: 'Won',
        value: 300_000,
        currency: 'EUR',
        closedAt: '2026-11-02T10:00:00Z'
      },
      {
        name: 'Lost on price',
        owner: 'lena',
        stage: 'Lost',
        value: 400_000,
        lostReason: 'Price',
        closedAt: '2026-10-09T10:00:00Z'
      },
      {
        name: 'Lost on price again',
        owner: 'ravi',
        stage: 'Lost',
        value: 100_000,
        lostReason: 'Price',
        closedAt: '2026-11-05T10:00:00Z'
      },
      {
        name: 'Lost to a rival',
        owner: 'ravi',
        stage: 'Lost',
        value: 200_000,
        lostReason: 'Chose a competitor',
        closedAt: '2026-11-06T10:00:00Z'
      },
      {
        name: 'Won last quarter',
        owner: 'ravi',
        stage: 'Won',
        value: 700_000,
        // 00:30 on 1 October in India, still 30 September in UTC.
        closedAt: '2026-09-30T19:00:00Z'
      },
      {
        name: 'Lost, then archived',
        owner: 'ravi',
        stage: 'Lost',
        lostReason: 'Price',
        closedAt: '2026-11-07T10:00:00Z',
        archived: true
      },
      { name: 'Still open', owner: 'ravi', stage: 'Proposal' }
    ]

    it('adds up revenue won, the win rate and lost reasons', async () => {
      await seed(DEALS)
      const report = await reports.wonLost(ravi, { period: 'this_quarter' })

      expect(report.won).toEqual({
        count: 2,
        totals: [usd(1_000_000), eur(300_000)]
      })
      expect(report.lost).toEqual({ count: 3, totals: [usd(700_000)] })
      expect(report.winRate).toBe(0.4)
      expect(report.reasons).toEqual([
        {
          reasonId: reasonIds['Price'],
          label: 'Price',
          count: 2,
          totals: [usd(500_000)]
        },
        {
          reasonId: reasonIds['Chose a competitor'],
          label: 'Chose a competitor',
          count: 1,
          totals: [usd(200_000)]
        }
      ])
      // The deals behind the numbers, newest first.
      expect(report.deals.map((row) => row.name)).toEqual([
        'Lost to a rival',
        'Lost on price again',
        'Won in euros',
        'Won big',
        'Lost on price'
      ])
      expect(report.deals[0]).toMatchObject({
        status: 'lost',
        lostReasonId: reasonIds['Chose a competitor'],
        closedAt: '2026-11-06T10:00:00.000Z'
      })
    })

    it('narrows to one owner, and to the period', async () => {
      await seed(DEALS)
      const lenas = await reports.wonLost(ravi, {
        period: 'this_quarter',
        ownerId: PEOPLE.lena.id
      })
      expect(lenas.won).toEqual({ count: 1, totals: [eur(300_000)] })
      expect(lenas.lost).toEqual({ count: 1, totals: [usd(400_000)] })
      expect(lenas.winRate).toBe(0.5)

      const before = await reports.wonLost(ravi, { period: 'last_quarter' })
      expect(before.won).toEqual({ count: 1, totals: [usd(700_000)] })
      expect(before.lost).toEqual({ count: 0, totals: [] })
      expect(before.winRate).toBe(1)
      expect(before.reasons).toEqual([])
    })

    it('has no win rate when nothing closed', async () => {
      const report = await reports.wonLost(ravi, { period: 'this_month' })
      expect(report).toMatchObject({
        won: { count: 0, totals: [] },
        lost: { count: 0, totals: [] },
        winRate: null,
        reasons: [],
        deals: []
      })
    })

    it('cuts periods at midnight where the team is', async () => {
      await seed(DEALS)
      await db.update(workspace).set({ timeZone: 'Asia/Kolkata' })
      // In India that September deal closed on 1 October.
      const report = await reports.wonLost(ravi, { period: 'this_quarter' })
      expect(report.won.count).toBe(3)
      expect(report.won.totals).toEqual([usd(1_700_000), eur(300_000)])
      const before = await reports.wonLost(ravi, { period: 'last_quarter' })
      expect(before.won.count).toBe(0)
    })
  })

  describe('forecast', () => {
    const DEALS: TSeedDeal[] = [
      {
        // Proposal: 50%.
        name: 'November',
        owner: 'ravi',
        stage: 'Proposal',
        value: 500_000,
        closeDate: '2026-11-20'
      },
      {
        // Qualified: 10%.
        name: 'December',
        owner: 'ravi',
        stage: 'Qualified',
        value: 100_000,
        closeDate: '2026-12-15'
      },
      {
        name: 'December in euros',
        owner: 'lena',
        stage: 'Proposal',
        value: 200_000,
        currency: 'EUR',
        closeDate: '2026-12-01'
      },
      {
        name: 'January, no value',
        owner: 'lena',
        stage: 'Proposal',
        value: null,
        closeDate: '2027-01-31'
      },
      {
        // Negotiation: 75%.
        name: 'Overdue',
        owner: 'lena',
        stage: 'Negotiation',
        value: 800_000,
        closeDate: '2026-10-15'
      },
      {
        // Discovery: 25% of 333.33 is 83.3325, so 83.33.
        name: 'No date',
        owner: 'ravi',
        stage: 'Discovery',
        value: 33_333
      },
      {
        name: 'February',
        owner: 'ravi',
        stage: 'Proposal',
        closeDate: '2027-02-01'
      },
      {
        name: 'Already won',
        owner: 'ravi',
        stage: 'Won',
        closeDate: '2026-11-03',
        closedAt: '2026-11-03T10:00:00Z'
      },
      {
        name: 'Archived',
        owner: 'ravi',
        stage: 'Proposal',
        closeDate: '2026-11-21',
        archived: true
      }
    ]
    const sum = (
      currency: string,
      valueMinor: number,
      weightedMinor: number
    ) => ({
      currency,
      valueMinor,
      weightedMinor
    })

    it('weights open deals by stage, month by month', async () => {
      await seed(DEALS)
      const report = await reports.forecast(manager, {
        period: 'next_3_months'
      })

      expect(report.range).toEqual({ from: '2026-11-01', to: '2027-01-31' })
      expect(report.months).toEqual([
        {
          month: '2026-11',
          count: 1,
          totals: [sum('USD', 500_000, 250_000)]
        },
        {
          month: '2026-12',
          count: 2,
          totals: [sum('USD', 100_000, 10_000), sum('EUR', 200_000, 100_000)]
        },
        { month: '2027-01', count: 1, totals: [sum('USD', 0, 0)] }
      ])
      expect(report.overdue).toEqual({
        count: 1,
        totals: [sum('USD', 800_000, 600_000)]
      })
      expect(report.undated).toEqual({
        count: 1,
        totals: [sum('USD', 33_333, 8_333)]
      })
      // Soonest first, deals with no date last; February is past the period.
      expect(report.deals.map((row) => row.name)).toEqual([
        'Overdue',
        'November',
        'December in euros',
        'December',
        'January, no value',
        'No date'
      ])
    })

    it('narrows to one owner, and shows empty months', async () => {
      await seed(DEALS)
      const lenas = await reports.forecast(admin, {
        period: 'next_6_months',
        ownerId: PEOPLE.lena.id
      })
      expect(lenas.months.map((row) => [row.month, row.count])).toEqual([
        ['2026-11', 0],
        ['2026-12', 1],
        ['2027-01', 1],
        ['2027-02', 0],
        ['2027-03', 0],
        ['2027-04', 0]
      ])
      expect(lenas.months[0].totals).toEqual([])
      expect(lenas.overdue.count).toBe(1)
      expect(lenas.undated).toEqual({ count: 0, totals: [] })
    })

    it('is for managers and admins only', async () => {
      await seed(DEALS)
      await expect(
        reports.forecast(ravi, { period: 'next_3_months' })
      ).rejects.toBeInstanceOf(NotAllowedError)
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
        reports
      })

    it('needs a sign-in', async () => {
      for (const path of ['pipeline', 'won-lost', 'forecast']) {
        const response = await appAs(null).request(`/api/v1/reports/${path}`)
        expect(response.status).toBe(401)
      }
    })

    it('gives members the open reports and refuses them the forecast', async () => {
      const app = appAs(ravi)
      const pipeline = await app.request('/api/v1/reports/pipeline')
      expect(pipeline.status).toBe(200)
      expect(await pipeline.json()).toMatchObject({
        range: { from: '2026-10-01', to: '2026-12-31' }
      })
      const wonLost = await app.request(
        '/api/v1/reports/won-lost?period=last_month'
      )
      expect(wonLost.status).toBe(200)
      expect(await wonLost.json()).toMatchObject({
        range: { from: '2026-10-01', to: '2026-10-31' }
      })

      const forecast = await app.request('/api/v1/reports/forecast')
      expect(forecast.status).toBe(403)
      expect(await forecast.json()).toMatchObject({
        error: { code: 'forbidden' }
      })
    })

    it('gives managers the forecast, and refuses a period it doesn’t have', async () => {
      const app = appAs(manager)
      const forecast = await app.request(
        `/api/v1/reports/forecast?period=next_6_months&ownerId=${PEOPLE.lena.id}`
      )
      expect(forecast.status).toBe(200)
      expect(await forecast.json()).toMatchObject({
        range: { from: '2026-11-01', to: '2027-04-30' }
      })

      const wrong = await app.request(
        '/api/v1/reports/forecast?period=last_month'
      )
      expect(wrong.status).toBe(400)
    })

    it('keeps archived stages out of the stage list', async () => {
      const [extra] = await db
        .insert(stage)
        .values({
          pipelineId,
          name: 'Old stage',
          position: 9,
          archivedAt: new Date(NOW)
        })
        .returning()
      try {
        const report = await reports.pipeline(ravi, { period: 'this_quarter' })
        expect(report.stages.map((row) => row.name)).toEqual([
          'Qualified',
          'Discovery',
          'Proposal',
          'Negotiation'
        ])
      } finally {
        await db.delete(stage).where(eq(stage.id, extra.id))
      }
    })
  })
})
