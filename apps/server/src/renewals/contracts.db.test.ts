/*
 * Contracts and renewals against a real Postgres: adding a contract from a
 * won deal, starting its renewal, "won't renew", who may do which, and the
 * change log. Runs only with TEST_DATABASE_URL set, and only on a database
 * whose name says "test", because it empties it first:
 *
 *   TEST_DATABASE_URL=postgres://open_sales:open-sales@localhost:5433/open_sales_test_renewals \
 *     bunx vitest run src/renewals
 */
import type { TContract, TSessionUser } from '@open-sales/shared'
import { addDaysToDay } from '@open-sales/shared'
import { and, eq, sql } from 'drizzle-orm'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createApp } from '../app'
import type { TDatabase } from '../db/client'
import { createDatabase } from '../db/client'
import { runMigrations } from '../db/migrate'
import { changeLog, deal, user, workspace } from '../db/schema'
import type { TActor } from '../records/common'
import {
  ChangedSinceError,
  DuplicateError,
  InvalidChangeError,
  NotAllowedError
} from '../records/common'
import type { TRecordsService } from '../records/routes'
import { createRecordsService } from '../records/routes'
import type { TSetupService } from '../setup'
import type { TTeamService } from '../team'
import type { TContractService } from './contracts'
import { createContractService } from './contracts'

const DATABASE_URL = process.env.TEST_DATABASE_URL

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

// The workspace is in UTC, so this is the server's "today".
const TODAY = new Date().toISOString().slice(0, 10)
const inDays = (days: number) => addDaysToDay(TODAY, days)

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

describe.skipIf(!DATABASE_URL)('contracts service (database)', () => {
  let db: TDatabase
  let close: () => Promise<void>
  let records: TRecordsService
  let contracts: TContractService

  beforeAll(async () => {
    await ensureDatabase(DATABASE_URL!)
    const connection = createDatabase(DATABASE_URL!)
    db = connection.db
    close = () => connection.sql.end()
    await runMigrations(db)
    records = createRecordsService(db)
    contracts = createContractService(db)
  })

  afterAll(async () => {
    await close?.()
  })

  beforeEach(async () => {
    await db.execute(
      sql`truncate contract, company, person, deal, deal_person, deal_stage_change, change_log, "user" cascade`
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

  const closeDeal = async (
    me: TActor,
    dealId: string,
    kind: 'won' | 'lost',
    lostNote?: string
  ) => {
    const { stages, lostReasons } = await records.pipeline.get()
    const current = await records.deals.get(me, dealId)
    return records.deals.update(me, dealId, {
      stageId: stages.find((s) => s.kind === kind)!.id,
      version: current.version,
      ...(kind === 'lost' ? { lostReasonId: lostReasons[0].id, lostNote } : {})
    })
  }

  /** A company of `me`'s with a won deal, ready for a contract. */
  const wonDeal = async (me: TActor, companyName: string) => {
    const company = await records.companies.create(me, { name: companyName })
    const open = await records.deals.create(me, {
      companyId: company.id,
      name: 'Platform rollout',
      valueMinor: 3_600_000,
      closeDate: inDays(-300)
    })
    return { company, deal: await closeDeal(me, open.id, 'won') }
  }

  /** A contract of `me`'s that renews `days` from today. */
  const contractDue = async (me: TActor, companyName: string, days: number) => {
    const { deal: won } = await wonDeal(me, companyName)
    return contracts.create(me, {
      dealId: won.id,
      startsOn: inDays(days - 365),
      renewsOn: inDays(days),
      valueMinor: 3_600_000
    })
  }

  const upcoming = (me: TActor, window: 30 | 60 | 90 = 90) =>
    contracts.list(me, {
      view: 'upcoming',
      window,
      owner: 'anyone',
      limit: 50
    })

  const logFor = (recordType: 'contract' | 'deal', recordId: string) =>
    db
      .select()
      .from(changeLog)
      .where(
        and(
          eq(changeLog.recordType, recordType),
          eq(changeLog.recordId, recordId)
        )
      )
      .orderBy(changeLog.id)

  describe('adding a contract', () => {
    it('starts from a won deal, once, and takes it off the waiting list', async () => {
      const { company, deal: won } = await wonDeal(ravi, 'Halden Capital')
      const waiting = await contracts.candidates(ravi, {
        owner: 'anyone',
        limit: 20
      })
      expect(waiting.items).toHaveLength(1)
      expect(waiting.items[0]).toMatchObject({
        deal: { id: won.id, name: 'Platform rollout' },
        company: { id: company.id },
        valueMinor: 3_600_000,
        suggestedStartsOn: won.closeDate,
        suggestedRenewsOn: addDaysToDay(won.closeDate!, 365),
        canEdit: true
      })

      const made = await contracts.create(ravi, {
        dealId: won.id,
        startsOn: inDays(-300),
        renewsOn: inDays(65),
        valueMinor: 4_000_000
      })
      expect(made).toMatchObject({
        company: { id: company.id, name: 'Halden Capital' },
        owner: { id: ravi.id, name: 'Ravi Shah' },
        deal: { id: won.id, name: 'Platform rollout' },
        renewalDeal: null,
        valueMinor: 4_000_000,
        currency: 'USD',
        renewsOn: inDays(65),
        status: 'active',
        endReason: null,
        version: 1,
        canEdit: true
      })

      await expect(
        contracts.create(ravi, {
          dealId: won.id,
          startsOn: inDays(0),
          renewsOn: inDays(365),
          valueMinor: 1
        })
      ).rejects.toBeInstanceOf(DuplicateError)
      const after = await contracts.candidates(ravi, {
        owner: 'anyone',
        limit: 20
      })
      expect(after.items).toHaveLength(0)
    })

    it('needs the deal to be won', async () => {
      const company = await records.companies.create(ravi, { name: 'Halden' })
      const open = await records.deals.create(ravi, {
        companyId: company.id,
        name: 'Platform'
      })
      await expect(
        contracts.create(ravi, {
          dealId: open.id,
          startsOn: inDays(0),
          renewsOn: inDays(365),
          valueMinor: 1
        })
      ).rejects.toThrow('Only a won deal can start a contract.')
    })
  })

  describe('the renewal list', () => {
    it('shows what’s due in 30, 60 or 90 days, soonest first, overdue included', async () => {
      await contractDue(ravi, 'In eighty', 80)
      await contractDue(ravi, 'In ten', 10)
      await contractDue(lena, 'Overdue', -5)
      await contractDue(ravi, 'In forty-five', 45)
      await contractDue(ravi, 'Next year', 120)

      const names = async (window: 30 | 60 | 90) =>
        (await upcoming(ravi, window)).items.map((c) => c.company.name)
      expect(await names(30)).toEqual(['Overdue', 'In ten'])
      expect(await names(60)).toEqual(['Overdue', 'In ten', 'In forty-five'])
      expect(await names(90)).toEqual([
        'Overdue',
        'In ten',
        'In forty-five',
        'In eighty'
      ])

      const mine = await contracts.list(lena, {
        view: 'upcoming',
        window: 90,
        owner: 'me',
        limit: 50
      })
      expect(mine.items.map((c) => c.company.name)).toEqual(['Overdue'])
    })

    it('pages by renewal date with a cursor', async () => {
      for (const days of [30, 10, 20]) {
        await contractDue(ravi, `Due in ${days}`, days)
      }
      const query = {
        view: 'upcoming' as const,
        window: 90 as const,
        owner: 'anyone' as const,
        limit: 2
      }
      const first = await contracts.list(ravi, query)
      const second = await contracts.list(ravi, {
        ...query,
        cursor: first.nextCursor ?? undefined
      })
      expect(
        [...first.items, ...second.items].map((c) => c.company.name)
      ).toEqual(['Due in 10', 'Due in 20', 'Due in 30'])
      expect(second.nextCursor).toBeNull()
    })

    it('leaves out contracts at archived companies', async () => {
      const made = await contractDue(ravi, 'Halden', 10)
      const company = await records.companies.get(ravi, made.company.id)
      await records.companies.archive(ravi, company.id, company.version)
      expect((await upcoming(ravi)).items).toHaveLength(0)
    })
  })

  describe('starting a renewal', () => {
    it('makes a renewal deal from the contract and marks it renewing', async () => {
      const made = await contractDue(ravi, 'Halden Capital', 40)
      const { stages } = await records.pipeline.get()

      const renewing = await contracts.startRenewal(ravi, made.id, {
        version: 1
      })
      expect(renewing).toMatchObject({ status: 'renewing', version: 2 })
      expect(renewing.renewalDeal).toMatchObject({
        name: `Halden Capital renewal ${inDays(40).slice(0, 4)}`,
        status: 'open'
      })

      const renewalDeal = await records.deals.get(
        ravi,
        renewing.renewalDeal!.id
      )
      expect(renewalDeal).toMatchObject({
        company: { id: made.company.id },
        owner: { id: ravi.id },
        stageId: stages[0].id,
        valueMinor: 3_600_000,
        currency: 'USD',
        closeDate: inDays(40)
      })
      const [row] = await db
        .select({ kind: deal.kind, contractId: deal.contractId })
        .from(deal)
        .where(eq(deal.id, renewalDeal.id))
      expect(row).toEqual({ kind: 'renewal', contractId: made.id })

      await expect(
        contracts.startRenewal(ravi, made.id, { version: 2 })
      ).rejects.toThrow('This renewal has already been started.')
    })

    it('takes what the person changed in the dialog', async () => {
      const made = await contractDue(ravi, 'Halden Capital', 40)
      const { stages } = await records.pipeline.get()
      const renewing = await contracts.startRenewal(ravi, made.id, {
        version: 1,
        valueMinor: 4_200_000,
        closeDate: inDays(30),
        stageId: stages[2].id
      })
      expect(
        await records.deals.get(ravi, renewing.renewalDeal!.id)
      ).toMatchObject({
        valueMinor: 4_200_000,
        closeDate: inDays(30),
        stageId: stages[2].id
      })

      const other = await contractDue(ravi, 'Lumen', 50)
      await expect(
        contracts.startRenewal(ravi, other.id, {
          version: 1,
          stageId: stages.find((s) => s.kind === 'won')!.id
        })
      ).rejects.toBeInstanceOf(InvalidChangeError)
      // Refused whole: no stray deal, and the contract is untouched.
      const deals = await records.deals.list(ravi, {
        owner: 'anyone',
        archived: false,
        companyId: other.company.id,
        limit: 50
      })
      expect(deals.items.map((d) => d.status)).toEqual(['won'])
      expect(await contracts.get(ravi, other.id)).toMatchObject({
        status: 'active',
        version: 1
      })
    })

    it('refuses a change made against an old version', async () => {
      const made = await contractDue(ravi, 'Halden Capital', 40)
      await contracts.end(ravi, made.id, { version: 1, reason: 'No budget' })
      await contracts.reopen(ravi, made.id, 2)
      await expect(
        contracts.startRenewal(ravi, made.id, { version: 1 })
      ).rejects.toBeInstanceOf(ChangedSinceError)
    })

    it('follows the renewal deal: won renews it, lost ends it, archived frees it', async () => {
      const toWin = await contractDue(ravi, 'Wins', 10)
      const toLose = await contractDue(ravi, 'Loses', 20)
      const toDrop = await contractDue(ravi, 'Drops', 30)
      const started: Record<string, TContract> = {}
      for (const made of [toWin, toLose, toDrop]) {
        started[made.id] = await contracts.startRenewal(ravi, made.id, {
          version: 1
        })
      }

      const wonRenewal = await closeDeal(
        ravi,
        started[toWin.id].renewalDeal!.id,
        'won'
      )
      await closeDeal(
        ravi,
        started[toLose.id].renewalDeal!.id,
        'lost',
        'Went with Acme'
      )
      const dropped = await records.deals.get(
        ravi,
        started[toDrop.id].renewalDeal!.id
      )
      await records.deals.archive(ravi, dropped.id, dropped.version)

      const { lostReasons } = await records.pipeline.get()
      const open = await upcoming(ravi)
      expect(open.items.map((c) => [c.company.name, c.status])).toEqual([
        ['Drops', 'active']
      ])
      const closed = await contracts.list(ravi, {
        view: 'closed',
        window: 90,
        owner: 'anyone',
        limit: 50
      })
      expect(
        closed.items.map((c) => [c.company.name, c.status, c.endReason])
      ).toEqual([
        ['Loses', 'ended', `${lostReasons[0].label}: Went with Acme`],
        ['Wins', 'renewed', null]
      ])

      // The log says the system did it, following the deal.
      const log = await logFor('contract', toWin.id)
      expect(log.at(-1)).toMatchObject({
        actorId: null,
        via: 'system',
        changes: [{ field: 'status', from: 'renewing', to: 'renewed' }]
      })

      // The won renewal waits for the next term's contract, carrying on
      // from where the old one leaves off.
      const waiting = await contracts.candidates(ravi, {
        owner: 'anyone',
        limit: 20
      })
      expect(waiting.items).toHaveLength(1)
      expect(waiting.items[0]).toMatchObject({
        deal: { id: wonRenewal.id },
        suggestedStartsOn: inDays(10)
      })

      // The freed contract can be started again.
      const again = await contracts.startRenewal(ravi, toDrop.id, {
        version: 3
      })
      expect(again.status).toBe('renewing')
      expect(again.renewalDeal!.id).not.toBe(dropped.id)
    })
  })

  describe('won’t renew', () => {
    it('records why and ends the contract, until it’s reopened', async () => {
      const made = await contractDue(ravi, 'Halden Capital', 40)
      const ended = await contracts.end(ravi, made.id, {
        version: 1,
        reason: ' Chose another tool '
      })
      expect(ended).toMatchObject({
        status: 'ended',
        endReason: 'Chose another tool',
        version: 2
      })
      expect((await upcoming(ravi)).items).toHaveLength(0)
      await expect(
        contracts.end(ravi, made.id, { version: 2, reason: 'Again' })
      ).rejects.toThrow('This contract has already finished.')

      const reopened = await contracts.reopen(ravi, made.id, 2)
      expect(reopened).toMatchObject({
        status: 'active',
        endReason: null,
        version: 3
      })
      expect((await upcoming(ravi)).items).toHaveLength(1)
    })

    it('isn’t for a renewal that’s under way', async () => {
      const made = await contractDue(ravi, 'Halden Capital', 40)
      await contracts.startRenewal(ravi, made.id, { version: 1 })
      await expect(
        contracts.end(ravi, made.id, { version: 2, reason: 'No budget' })
      ).rejects.toThrow('Mark that deal as lost instead.')
    })
  })

  describe('who may change a contract', () => {
    it('lets everyone read, and only the company’s owner, managers and admins change', async () => {
      const { deal: won } = await wonDeal(ravi, 'Halden Capital')
      const input = {
        dealId: won.id,
        startsOn: inDays(-300),
        renewsOn: inDays(65),
        valueMinor: 3_600_000
      }
      await expect(contracts.create(lena, input)).rejects.toBeInstanceOf(
        NotAllowedError
      )
      const waiting = await contracts.candidates(lena, {
        owner: 'anyone',
        limit: 20
      })
      expect(waiting.items[0].canEdit).toBe(false)

      const made = await contracts.create(ravi, input)
      const asLena = await contracts.get(lena, made.id)
      expect(asLena).toMatchObject({ id: made.id, canEdit: false })
      expect((await upcoming(lena)).items).toHaveLength(1)

      await expect(
        contracts.startRenewal(lena, made.id, { version: 1 })
      ).rejects.toBeInstanceOf(NotAllowedError)
      await expect(
        contracts.end(lena, made.id, { version: 1, reason: 'No budget' })
      ).rejects.toBeInstanceOf(NotAllowedError)

      const ended = await contracts.end(manager, made.id, {
        version: 1,
        reason: 'No budget'
      })
      await expect(
        contracts.reopen(lena, made.id, ended.version)
      ).rejects.toBeInstanceOf(NotAllowedError)
      const reopened = await contracts.reopen(manager, made.id, ended.version)
      const renewing = await contracts.startRenewal(manager, made.id, {
        version: reopened.version
      })
      // The renewal deal belongs to the company's owner, not who started it.
      expect(
        (await records.deals.get(manager, renewing.renewalDeal!.id)).owner.id
      ).toBe(ravi.id)
    })

    it('moves with the company when it changes hands', async () => {
      const made = await contractDue(ravi, 'Halden Capital', 40)
      const company = await records.companies.get(manager, made.company.id)
      await records.companies.update(manager, company.id, {
        ownerId: lena.id,
        version: company.version
      })
      expect(await contracts.get(lena, made.id)).toMatchObject({
        owner: { id: lena.id },
        canEdit: true
      })
      expect((await contracts.get(ravi, made.id)).canEdit).toBe(false)
    })
  })

  it('writes every change to the change log', async () => {
    const made = await contractDue(ravi, 'Halden Capital', 40)
    await contracts.end(ravi, made.id, { version: 1, reason: 'No budget' })
    await contracts.reopen(ravi, made.id, 2)
    const renewing = await contracts.startRenewal(ravi, made.id, {
      version: 3
    })

    const log = await logFor('contract', made.id)
    expect(log.map((entry) => entry.action)).toEqual([
      'create',
      'update',
      'update',
      'update'
    ])
    expect(log[0].changes).toContainEqual({
      field: 'renewsOn',
      from: null,
      to: inDays(40)
    })
    expect(log[1]).toMatchObject({
      actorId: ravi.id,
      via: 'app',
      changes: [
        { field: 'status', from: 'active', to: 'ended' },
        { field: 'endReason', from: null, to: 'No budget' }
      ]
    })
    expect(log[3].changes).toEqual([
      { field: 'status', from: 'active', to: 'renewing' }
    ])

    const dealLog = await logFor('deal', renewing.renewalDeal!.id)
    expect(dealLog.map((entry) => entry.action)).toEqual(['create', 'update'])
    expect(dealLog[1].changes).toEqual([
      { field: 'kind', from: 'new', to: 'renewal' },
      { field: 'contractId', from: null, to: made.id }
    ])
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
        records,
        contracts
      })

    const post = (path: string, body: unknown) =>
      new Request(`http://test/api/v1${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })

    it('needs a sign-in', async () => {
      const response = await appAs(null).request('/api/v1/contracts')
      expect(response.status).toBe(401)
    })

    it('answers each call, and each problem with its own status and code', async () => {
      const { deal: won } = await wonDeal(ravi, 'Halden Capital')
      const app = appAs(ravi)
      const input = {
        dealId: won.id,
        startsOn: inDays(-300),
        renewsOn: inDays(65),
        valueMinor: 3_600_000
      }

      const waiting = await app.request('/api/v1/contracts/candidates')
      expect(waiting.status).toBe(200)
      expect(
        ((await waiting.json()) as { items: unknown[] }).items
      ).toHaveLength(1)

      const backwards = await app.request(
        post('/contracts', { ...input, renewsOn: inDays(-301) })
      )
      expect(backwards.status).toBe(400)
      expect(await backwards.json()).toMatchObject({
        error: { message: 'The renewal date must be after the start date' }
      })

      const forbidden = await appAs(lena).request(post('/contracts', input))
      expect(forbidden.status).toBe(403)

      const made = await app.request(post('/contracts', input))
      expect(made.status).toBe(201)
      const contract = (await made.json()) as TContract

      const duplicate = await app.request(post('/contracts', input))
      expect(duplicate.status).toBe(409)
      expect(await duplicate.json()).toMatchObject({
        error: { code: 'contract_exists' }
      })

      const listed = await app.request('/api/v1/contracts?window=90')
      expect(listed.status).toBe(200)
      expect(
        ((await listed.json()) as { items: TContract[] }).items.map((c) => c.id)
      ).toEqual([contract.id])
      expect((await app.request('/api/v1/contracts?window=30')).status).toBe(
        200
      )
      expect((await app.request('/api/v1/contracts?window=45')).status).toBe(
        400
      )

      const stale = await app.request(
        post(`/contracts/${contract.id}/end`, { version: 9, reason: 'Budget' })
      )
      expect(stale.status).toBe(409)
      expect(await stale.json()).toMatchObject({
        error: { code: 'changed_since' }
      })

      const noReason = await app.request(
        post(`/contracts/${contract.id}/end`, { version: 1, reason: '' })
      )
      expect(noReason.status).toBe(400)

      const renewing = await app.request(
        post(`/contracts/${contract.id}/start-renewal`, { version: 1 })
      )
      expect(renewing.status).toBe(200)
      expect(await renewing.json()).toMatchObject({ status: 'renewing' })

      const tooLate = await app.request(
        post(`/contracts/${contract.id}/end`, { version: 2, reason: 'Budget' })
      )
      expect(tooLate.status).toBe(400)
      expect(await tooLate.json()).toMatchObject({
        error: { code: 'invalid_change' }
      })

      expect((await app.request('/api/v1/contracts/not-an-id')).status).toBe(
        404
      )
      expect(
        (await app.request(post('/contracts/not-an-id/reopen', { version: 1 })))
          .status
      ).toBe(404)
    })
  })
})
