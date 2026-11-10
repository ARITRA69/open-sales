/*
 * The leads service against a real Postgres: who may assign and work a lead,
 * and converting one into an account, a person and a deal. Runs only with
 * TEST_DATABASE_URL set, and only on a database whose name says "test",
 * because it empties it first:
 *
 *   TEST_DATABASE_URL=postgres://open_sales:open-sales@localhost:5433/open_sales_test_leads \
 *     bunx vitest run src/leads
 */
import type { TSessionUser } from '@open-sales/shared'
import { and, eq, sql } from 'drizzle-orm'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createApp } from '../app'
import type { TDatabase } from '../db/client'
import { createDatabase } from '../db/client'
import { runMigrations } from '../db/migrate'
import {
  changeLog,
  company,
  deal,
  dealPerson,
  lead,
  person,
  user,
  workspace
} from '../db/schema'
import type { TActor } from '../records/common'
import {
  ChangedSinceError,
  InvalidChangeError,
  NotAllowedError
} from '../records/common'
import type { TRecordsService } from '../records/routes'
import { createRecordsService } from '../records/routes'
import type { TSetupService } from '../setup'
import type { TTeamService } from '../team'
import type { TLeadsService } from './leads'
import { createLeadsService, MatchChangedError } from './leads'

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

describe.skipIf(!DATABASE_URL)('leads service (database)', () => {
  let db: TDatabase
  let close: () => Promise<void>
  let records: TRecordsService
  let leads: TLeadsService

  beforeAll(async () => {
    await ensureDatabase(DATABASE_URL!)
    const connection = createDatabase(DATABASE_URL!)
    db = connection.db
    close = () => connection.sql.end()
    await runMigrations(db)
    records = createRecordsService(db)
    leads = createLeadsService(db)
  })

  afterAll(async () => {
    await close?.()
  })

  beforeEach(async () => {
    await db.execute(
      sql`truncate lead, company, person, deal, deal_person, deal_stage_change, change_log, "user" cascade`
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

  /** A lead nobody has yet, as an import or the web form would leave it. */
  const unassigned = (me: TActor, fields: Record<string, unknown> = {}) =>
    leads.create(me, {
      name: 'Dana Whitfield',
      email: 'dana@northwind.io',
      companyName: 'Northwind Freight',
      ownerId: null,
      ...fields
    })

  const logFor = (
    recordType: 'lead' | 'company' | 'person' | 'deal',
    id: string
  ) =>
    db
      .select()
      .from(changeLog)
      .where(
        and(eq(changeLog.recordType, recordType), eq(changeLog.recordId, id))
      )
      .orderBy(changeLog.id)

  describe('the inbox', () => {
    it('keeps a lead typed in by hand with whoever typed it', async () => {
      const made = await leads.create(ravi, {
        name: ' Dana Whitfield ',
        email: 'Dana@Northwind.io',
        phone: '+44 20 7946 0000',
        message: 'Saw you at the expo.'
      })
      expect(made).toMatchObject({
        name: 'Dana Whitfield',
        email: 'dana@northwind.io',
        phone: '+442079460000',
        source: 'manual',
        status: 'new',
        owner: { id: ravi.id, name: 'Ravi Shah' },
        fitNote: null,
        version: 1,
        canWork: true,
        canAssign: false
      })
      const [entry] = await logFor('lead', made.id)
      expect(entry).toMatchObject({ actorId: ravi.id, action: 'create' })
    })

    it('lets only managers and admins type one in for someone else', async () => {
      await expect(
        leads.create(ravi, { name: 'Dana', ownerId: lena.id })
      ).rejects.toBeInstanceOf(NotAllowedError)
      const forLena = await leads.create(manager, {
        name: 'Dana',
        ownerId: lena.id
      })
      expect(forLena.owner?.id).toBe(lena.id)
      await expect(
        leads.create(manager, { name: 'Dana', ownerId: 'nobody' })
      ).rejects.toBeInstanceOf(InvalidChangeError)
    })

    it('lists by owner, status and search, newest first, a page at a time', async () => {
      const first = await unassigned(manager, { name: 'Ada One' })
      const second = await leads.create(ravi, { name: 'Bo Two' })
      const third = await leads.create(lena, {
        name: 'Cy Three',
        companyName: 'Lumen Retail'
      })
      await leads.disqualify(lena, third.id, { version: 1, reason: 'Spam' })

      const query = (extra: Record<string, unknown> = {}) => ({
        owner: 'anyone' as const,
        status: 'open' as const,
        limit: 50,
        ...extra
      })
      const names = async (extra?: Record<string, unknown>, me = ravi) =>
        (await leads.list(me, query(extra))).items.map((item) => item.name)

      // Open leads only, newest first.
      expect(await names()).toEqual(['Bo Two', 'Ada One'])
      expect(await names({ status: 'any' })).toEqual([
        'Cy Three',
        'Bo Two',
        'Ada One'
      ])
      expect(await names({ status: 'disqualified' })).toEqual(['Cy Three'])
      expect(await names({ owner: 'me' })).toEqual(['Bo Two'])
      expect(await names({ owner: 'none' })).toEqual(['Ada One'])
      expect(await names({ status: 'any', q: 'lumen' })).toEqual(['Cy Three'])

      const pageOne = await leads.list(ravi, query({ status: 'any', limit: 2 }))
      expect(pageOne.items.map((item) => item.id)).toEqual([
        third.id,
        second.id
      ])
      const pageTwo = await leads.list(
        ravi,
        query({ status: 'any', limit: 2, cursor: pageOne.nextCursor })
      )
      expect(pageTwo.items.map((item) => item.id)).toEqual([first.id])
      expect(pageTwo.nextCursor).toBeNull()
    })
  })

  describe('who may do what', () => {
    it('lets managers assign to anyone, and members only take what nobody has', async () => {
      const open = await unassigned(manager)
      expect(open).toMatchObject({ owner: null, canTake: true })

      // A member can't hand a lead to a teammate…
      await expect(
        leads.assign(ravi, open.id, { version: 1, ownerId: lena.id })
      ).rejects.toBeInstanceOf(NotAllowedError)
      // …but can take one nobody has.
      const taken = await leads.assign(ravi, open.id, {
        version: 1,
        ownerId: ravi.id
      })
      expect(taken).toMatchObject({ owner: { id: ravi.id }, version: 2 })

      // Once it's someone's, another member can't take it, and its owner
      // can't give it away.
      await expect(
        leads.assign(lena, open.id, { version: 2, ownerId: lena.id })
      ).rejects.toBeInstanceOf(NotAllowedError)
      await expect(
        leads.assign(ravi, open.id, { version: 2, ownerId: null })
      ).rejects.toBeInstanceOf(NotAllowedError)

      const moved = await leads.assign(manager, open.id, {
        version: 2,
        ownerId: lena.id
      })
      expect(moved).toMatchObject({ owner: { id: lena.id }, version: 3 })
      const back = await leads.assign(manager, open.id, {
        version: 3,
        ownerId: null
      })
      expect(back.owner).toBeNull()

      const log = await logFor('lead', open.id)
      expect(log.at(-1)).toMatchObject({
        actorId: manager.id,
        action: 'update',
        changes: [{ field: 'ownerId', from: lena.id, to: null }]
      })
    })

    it('keeps a member off a teammate’s lead', async () => {
      const lenas = await leads.create(lena, { name: 'Dana' })
      expect((await leads.get(ravi, lenas.id)).canWork).toBe(false)

      await expect(leads.qualify(ravi, lenas.id, 1)).rejects.toBeInstanceOf(
        NotAllowedError
      )
      await expect(
        leads.disqualify(ravi, lenas.id, { version: 1, reason: 'No budget' })
      ).rejects.toBeInstanceOf(NotAllowedError)
      await expect(
        leads.convert(ravi, lenas.id, {
          version: 1,
          companyId: null,
          companyName: 'Northwind'
        })
      ).rejects.toBeInstanceOf(NotAllowedError)

      // A manager may work anyone's.
      const qualified = await leads.qualify(manager, lenas.id, 1)
      expect(qualified).toMatchObject({ status: 'qualified', version: 2 })
    })

    it('lets a member work a lead nobody has, without taking it', async () => {
      const open = await unassigned(manager)
      const qualified = await leads.qualify(ravi, open.id, 1)
      expect(qualified).toMatchObject({ status: 'qualified', owner: null })
    })

    it('disqualifies with a reason, and reopens', async () => {
      const mine = await leads.create(ravi, { name: 'Dana' })
      await expect(
        leads.disqualify(ravi, mine.id, { version: 1, reason: '  ' })
      ).rejects.toThrow()

      const out = await leads.disqualify(ravi, mine.id, {
        version: 1,
        reason: 'A student project'
      })
      expect(out).toMatchObject({
        status: 'disqualified',
        disqualifiedReason: 'A student project',
        version: 2
      })
      await expect(
        leads.convert(ravi, mine.id, {
          version: 2,
          companyId: null,
          companyName: 'Northwind'
        })
      ).rejects.toBeInstanceOf(InvalidChangeError)

      const reopened = await leads.reopen(ravi, mine.id, 2)
      expect(reopened).toMatchObject({
        status: 'new',
        disqualifiedReason: null,
        version: 3
      })
    })

    it('refuses a change made against an old version', async () => {
      const mine = await leads.create(ravi, { name: 'Dana' })
      await leads.qualify(ravi, mine.id, 1)
      await expect(
        leads.disqualify(ravi, mine.id, { version: 1, reason: 'Spam' })
      ).rejects.toBeInstanceOf(ChangedSinceError)
      await expect(
        leads.convert(ravi, mine.id, {
          version: 1,
          companyId: null,
          companyName: 'Northwind'
        })
      ).rejects.toBeInstanceOf(ChangedSinceError)
    })
  })

  describe('converting', () => {
    it('makes a new company, person and deal, owned by whoever converts', async () => {
      const open = await unassigned(manager, {
        title: 'Fleet Director',
        phone: '+442079460000'
      })
      expect(await leads.match(ravi, open.id)).toEqual({
        company: null,
        person: null,
        canAddDeal: true
      })

      const done = await leads.convert(ravi, open.id, {
        version: 1,
        companyId: null,
        deal: { name: 'Fleet tracking', valueMinor: 1_250_000 }
      })

      expect(done.company).toMatchObject({
        name: 'Northwind Freight',
        owner: { id: ravi.id, name: 'Ravi Shah' },
        isNew: true
      })
      expect(done.person).toMatchObject({ name: 'Dana Whitfield', isNew: true })
      expect(done.deal).toMatchObject({ name: 'Fleet tracking' })
      expect(done.lead).toMatchObject({
        status: 'converted',
        // Nobody had it, so it's the converter's now.
        owner: { id: ravi.id },
        convertedCompanyId: done.company.id,
        convertedPersonId: done.person.id,
        convertedDealId: done.deal!.id,
        version: 2
      })

      const [madeCompany] = await db
        .select()
        .from(company)
        .where(eq(company.id, done.company.id))
      expect(madeCompany).toMatchObject({
        domain: 'northwind.io',
        ownerId: ravi.id,
        source: 'lead'
      })
      const [madePerson] = await db
        .select()
        .from(person)
        .where(eq(person.id, done.person.id))
      expect(madePerson).toMatchObject({
        companyId: done.company.id,
        email: 'dana@northwind.io',
        title: 'Fleet Director',
        phone: '+442079460000',
        source: 'lead'
      })
      const [madeDeal] = await db
        .select()
        .from(deal)
        .where(eq(deal.id, done.deal!.id))
      expect(madeDeal).toMatchObject({
        companyId: done.company.id,
        ownerId: ravi.id,
        valueMinor: 1_250_000,
        status: 'open',
        source: 'lead'
      })
      // The lead is the deal's first contact.
      expect(await db.select().from(dealPerson)).toEqual([
        expect.objectContaining({
          dealId: done.deal!.id,
          personId: done.person.id
        })
      ])

      // Every record it made, and the lead itself, is in the change log.
      for (const [type, id] of [
        ['company', done.company.id],
        ['person', done.person.id],
        ['deal', done.deal!.id]
      ] as const) {
        expect(await logFor(type, id)).toEqual([
          expect.objectContaining({ actorId: ravi.id, action: 'create' })
        ])
      }
      const leadLog = await logFor('lead', open.id)
      expect(leadLog.at(-1)).toMatchObject({
        actorId: ravi.id,
        action: 'update',
        changes: expect.arrayContaining([
          { field: 'status', from: 'new', to: 'converted' },
          { field: 'ownerId', from: null, to: ravi.id },
          { field: 'convertedCompanyId', from: null, to: done.company.id }
        ])
      })

      // It can't be converted twice.
      await expect(
        leads.convert(ravi, open.id, { version: 2, companyId: null })
      ).rejects.toBeInstanceOf(InvalidChangeError)
    })

    it('converts without a deal, and never makes a company from free mail', async () => {
      const gmail = await leads.create(ravi, {
        name: 'Sam Free',
        email: 'sam@gmail.com'
      })
      // No company name and no work email: the person has to say.
      await expect(
        leads.convert(ravi, gmail.id, { version: 1, companyId: null })
      ).rejects.toBeInstanceOf(InvalidChangeError)

      const done = await leads.convert(ravi, gmail.id, {
        version: 1,
        companyId: null,
        companyName: 'Sam’s Bakery'
      })
      expect(done.deal).toBeNull()
      expect(done.lead.convertedDealId).toBeNull()
      const [made] = await db
        .select()
        .from(company)
        .where(eq(company.id, done.company.id))
      expect(made).toMatchObject({ name: 'Sam’s Bakery', domain: null })
      expect(await db.select().from(deal)).toEqual([])
    })

    it('links to an existing company with another owner, and leaves its owner alone', async () => {
      const northwind = await records.companies.create(lena, {
        name: 'Northwind Freight',
        domain: 'northwind.io'
      })
      // The lead's company name is spelt differently: the email decides.
      const mine = await leads.create(ravi, {
        name: 'Dana Whitfield',
        email: 'dana@northwind.io',
        companyName: 'Northwind Ltd'
      })

      // Ravi doesn't own Northwind, so on his own he can't add people to it.
      await expect(
        records.people.create(ravi, { companyId: northwind.id, name: 'Dana' })
      ).rejects.toBeInstanceOf(NotAllowedError)

      const match = await leads.match(ravi, mine.id)
      expect(match).toEqual({
        company: {
          id: northwind.id,
          name: 'Northwind Freight',
          owner: { id: lena.id, name: 'Lena Ortiz' },
          matchedBy: 'domain'
        },
        person: null,
        canAddDeal: false
      })

      // The exception stops at the person: no deal on someone else's account.
      await expect(
        leads.convert(ravi, mine.id, {
          version: 1,
          companyId: northwind.id,
          deal: { name: 'Fleet tracking' }
        })
      ).rejects.toBeInstanceOf(NotAllowedError)
      // Refused whole: nothing was left behind.
      expect(await db.select().from(person)).toEqual([])

      const done = await leads.convert(ravi, mine.id, {
        version: 1,
        companyId: northwind.id
      })
      expect(done.company).toEqual({
        id: northwind.id,
        name: 'Northwind Freight',
        // Returned so the app can say whose account it is.
        owner: { id: lena.id, name: 'Lena Ortiz' },
        isNew: false
      })
      expect(done.person.isNew).toBe(true)
      expect(done.deal).toBeNull()

      // The account is untouched: same owner, same version, one company.
      const after = await records.companies.get(lena, northwind.id)
      expect(after).toMatchObject({ owner: { id: lena.id }, version: 1 })
      expect(await db.select().from(company)).toHaveLength(1)

      const [linked] = await db
        .select()
        .from(person)
        .where(eq(person.id, done.person.id))
      expect(linked).toMatchObject({
        companyId: northwind.id,
        name: 'Dana Whitfield',
        source: 'lead'
      })
      // The log names the person who converted, not a manager.
      expect(await logFor('person', done.person.id)).toEqual([
        expect.objectContaining({ actorId: ravi.id, action: 'create' })
      ])
      // Ravi still can't change the person: they belong to Lena's account.
      expect((await records.people.get(ravi, done.person.id)).canEdit).toBe(
        false
      )
    })

    it('lets a manager add a deal on someone else’s account; it starts with the account’s owner', async () => {
      const northwind = await records.companies.create(lena, {
        name: 'Northwind Freight'
      })
      const open = await unassigned(manager, { email: null })
      const match = await leads.match(manager, open.id)
      expect(match).toMatchObject({
        company: { id: northwind.id, matchedBy: 'name' },
        canAddDeal: true
      })
      const done = await leads.convert(manager, open.id, {
        version: 1,
        companyId: northwind.id,
        deal: { name: 'Fleet tracking' }
      })
      const made = await records.deals.get(manager, done.deal!.id)
      expect(made.owner.id).toBe(lena.id)
      expect(done.company.owner.id).toBe(lena.id)
    })

    it('links to someone who already has the lead’s email instead of adding them twice', async () => {
      const northwind = await records.companies.create(lena, {
        name: 'Northwind Freight'
      })
      const dana = await records.people.create(lena, {
        companyId: northwind.id,
        name: 'Dana W.',
        email: 'dana@gmail.com'
      })
      const mine = await leads.create(ravi, {
        name: 'Dana Whitfield',
        email: 'dana@gmail.com',
        companyName: 'Somewhere Else'
      })
      expect(await leads.match(ravi, mine.id)).toMatchObject({
        company: { id: northwind.id, matchedBy: 'person' },
        person: { id: dana.id, name: 'Dana W.' }
      })
      const done = await leads.convert(ravi, mine.id, {
        version: 1,
        companyId: northwind.id
      })
      expect(done.person).toEqual({
        id: dana.id,
        name: 'Dana W.',
        isNew: false
      })
      expect(await db.select().from(person)).toHaveLength(1)
      expect(done.lead.convertedPersonId).toBe(dana.id)
    })

    it('won’t do something the person wasn’t shown', async () => {
      const mine = await leads.create(ravi, {
        name: 'Dana Whitfield',
        email: 'dana@northwind.io',
        companyName: 'Northwind Freight'
      })
      // They were shown "a new account"; then someone added Northwind.
      const northwind = await records.companies.create(lena, {
        name: 'Northwind Freight',
        domain: 'northwind.io'
      })
      await expect(
        leads.convert(ravi, mine.id, { version: 1, companyId: null })
      ).rejects.toBeInstanceOf(MatchChangedError)
      expect((await leads.get(ravi, mine.id)).status).toBe('new')

      // And the other way round: shown an account that's since been archived.
      await records.companies.archive(lena, northwind.id, 1)
      await expect(
        leads.convert(ravi, mine.id, { version: 1, companyId: northwind.id })
      ).rejects.toBeInstanceOf(MatchChangedError)
    })

    it('undoes everything if a step fails', async () => {
      // No pipeline stage to put the deal in: the deal can't be made.
      await db.execute(sql`update stage set archived_at = now()`)
      try {
        const open = await unassigned(manager)
        await expect(
          leads.convert(ravi, open.id, {
            version: 1,
            companyId: null,
            deal: { name: 'Fleet tracking' }
          })
        ).rejects.toBeInstanceOf(InvalidChangeError)
        expect(await db.select().from(company)).toEqual([])
        expect(await db.select().from(person)).toEqual([])
        expect(await leads.get(ravi, open.id)).toMatchObject({
          status: 'new',
          owner: null,
          version: 1
        })
        expect(await logFor('lead', open.id)).toHaveLength(1)
      } finally {
        await db.execute(sql`update stage set archived_at = null`)
      }
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
        records,
        leads
      })

    const post = (path: string, body: unknown) =>
      new Request(`http://test/api/v1${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })

    it('needs a sign-in', async () => {
      expect((await appAs(null).request('/api/v1/leads')).status).toBe(401)
      expect(
        (await appAs(null).request(post('/leads', { name: 'Dana' }))).status
      ).toBe(401)
    })

    it('answers with the right codes', async () => {
      const app = appAs(ravi)
      const made = await app.request(
        post('/leads', {
          name: 'Dana Whitfield',
          email: 'dana@northwind.io',
          companyName: 'Northwind Freight'
        })
      )
      expect(made.status).toBe(201)
      const { id } = (await made.json()) as { id: string }

      expect((await app.request(post('/leads', { name: '' }))).status).toBe(400)
      expect((await app.request('/api/v1/leads/not-an-id')).status).toBe(404)
      expect((await app.request('/api/v1/leads?status=nope')).status).toBe(400)

      const list = await app.request('/api/v1/leads?owner=me&q=dana')
      expect(list.status).toBe(200)
      expect(((await list.json()) as { items: unknown[] }).items).toHaveLength(
        1
      )

      const forbidden = await appAs(lena).request(
        post(`/leads/${id}/qualify`, { version: 1 })
      )
      expect(forbidden.status).toBe(403)

      const match = await app.request(`/api/v1/leads/${id}/match`)
      expect(await match.json()).toEqual({
        company: null,
        person: null,
        canAddDeal: true
      })

      const qualified = await app.request(
        post(`/leads/${id}/qualify`, { version: 1 })
      )
      expect(qualified.status).toBe(200)

      const stale = await app.request(
        post(`/leads/${id}/disqualify`, { version: 1, reason: 'Spam' })
      )
      expect(stale.status).toBe(409)
      expect(await stale.json()).toMatchObject({
        error: { code: 'changed_since' }
      })

      await records.companies.create(lena, {
        name: 'Northwind Freight',
        domain: 'northwind.io'
      })
      const unseen = await app.request(
        post(`/leads/${id}/convert`, { version: 2, companyId: null })
      )
      expect(unseen.status).toBe(409)
      expect(await unseen.json()).toMatchObject({
        error: { code: 'match_changed' }
      })

      const shown = (await (
        await app.request(`/api/v1/leads/${id}/match`)
      ).json()) as { company: { id: string } }
      const converted = await app.request(
        post(`/leads/${id}/convert`, {
          version: 2,
          companyId: shown.company.id
        })
      )
      expect(converted.status).toBe(200)
      expect(await converted.json()).toMatchObject({
        lead: { status: 'converted' },
        company: { isNew: false, owner: { id: lena.id } },
        deal: null
      })

      const again = await app.request(
        post(`/leads/${id}/convert`, {
          version: 3,
          companyId: shown.company.id
        })
      )
      expect(again.status).toBe(400)
      expect(await again.json()).toMatchObject({
        error: { code: 'invalid_change' }
      })
      expect(await db.select().from(lead)).toHaveLength(1)
    })
  })
})
