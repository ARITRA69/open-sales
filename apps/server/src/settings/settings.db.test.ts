/*
 * Settings against a real Postgres: who may change what, saving stages and
 * lost reasons in one go, removing a stage that has deals, and never leaving
 * the workspace without an admin. Runs only with TEST_DATABASE_URL set, and
 * only on a database whose name says "test", because it empties it first:
 *
 *   TEST_DATABASE_URL=postgres://open_sales:open-sales@localhost:5433/open_sales_test_settings \
 *     bunx vitest run src/settings
 */
import type { TPipelineSettings, TSessionUser } from '@open-sales/shared'
import { and, eq, sql } from 'drizzle-orm'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'

import { createApp } from '../app'
import type { TDatabase } from '../db/client'
import { createDatabase } from '../db/client'
import { runMigrations } from '../db/migrate'
import {
  changeLog,
  deal,
  dealStageChange,
  lostReason,
  pipeline,
  session,
  stage,
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
import type { TSettingsService } from './routes'
import { createSettingsService } from './routes'

const DATABASE_URL = process.env.TEST_DATABASE_URL

const PEOPLE = {
  admin: { id: 'u-admin', name: 'Asha Menon', role: 'admin' },
  manager: { id: 'u-manager', name: 'Mo Rahman', role: 'manager' },
  ravi: { id: 'u-ravi', name: 'Ravi Shah', role: 'member' }
} as const

const actor = (who: keyof typeof PEOPLE): TActor => ({
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
  const root = postgres(server.toString(), { onnotice: () => {} })
  const [found] = await root`select 1 from pg_database where datname = ${name}`
  if (!found) await root.unsafe(`create database "${name}"`)
  await root.end()
}

describe.skipIf(!DATABASE_URL)('settings (database)', () => {
  let db: TDatabase
  let close: () => Promise<void>
  let settings: TSettingsService
  let records: TRecordsService

  beforeAll(async () => {
    await ensureDatabase(DATABASE_URL!)
    const connection = createDatabase(DATABASE_URL!)
    db = connection.db
    close = () => connection.sql.end()
    await runMigrations(db)
    settings = createSettingsService(db)
    records = createRecordsService(db)
  })

  afterAll(async () => {
    await close?.()
  })

  beforeEach(async () => {
    await db.execute(
      sql`truncate company, person, deal, deal_person, deal_stage_change, change_log, stage, lost_reason, pipeline, session, "user" cascade`
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
    // The pipeline as a new server has it, a little shorter.
    const [sales] = await db
      .insert(pipeline)
      .values({ name: 'Sales', isDefault: true })
      .returning()
    await db.insert(stage).values(
      (
        [
          ['Qualified', 'open', 10, 14],
          ['Proposal', 'open', 50, 10],
          ['Negotiation', 'open', 75, 10],
          ['Won', 'won', 100, null],
          ['Lost', 'lost', 0, null]
        ] as const
      ).map(([name, kind, winProbability, stalledAfterDays], position) => ({
        pipelineId: sales.id,
        name,
        kind,
        winProbability,
        stalledAfterDays,
        position
      }))
    )
    await db.insert(lostReason).values(
      ['Price', 'Chose a competitor', 'Bad timing'].map((label, position) => ({
        label,
        position
      }))
    )
  })

  const read = () => settings.pipeline.get(admin)
  const stageNamed = (current: TPipelineSettings, name: string) =>
    current.stages.find((s) => s.name === name)!
  /** The open stages as a save takes them, unchanged. */
  const asInput = (current: TPipelineSettings) =>
    current.stages
      .filter((s) => s.kind === 'open')
      .map(
        ({
          id,
          name,
          winProbability,
          stalledAfterDays,
          goal,
          exitCriteria
        }) => ({
          id,
          name,
          winProbability,
          stalledAfterDays,
          goal,
          exitCriteria
        })
      )
  const logged = (recordType: 'stage' | 'lost_reason' | 'user' | 'workspace') =>
    db.select().from(changeLog).where(eq(changeLog.recordType, recordType))

  describe('workspace', () => {
    it('is everyone’s to read and an admin’s to change', async () => {
      expect(await settings.workspace.get()).toEqual({
        name: 'Halden',
        currency: 'USD',
        timeZone: 'UTC'
      })
      for (const who of [manager, ravi]) {
        await expect(
          settings.workspace.update(who, { name: 'Mine now' })
        ).rejects.toBeInstanceOf(NotAllowedError)
      }
      const updated = await settings.workspace.update(admin, {
        name: 'Halden Capital',
        currency: 'gbp',
        timeZone: 'Europe/London'
      })
      expect(updated).toEqual({
        name: 'Halden Capital',
        currency: 'GBP',
        timeZone: 'Europe/London'
      })
      const [entry] = await logged('workspace')
      expect(entry).toMatchObject({ actorId: admin.id, action: 'update' })
      expect(entry.changes.map((change) => change.field).sort()).toEqual([
        'currency',
        'name',
        'timeZone'
      ])
    })

    it('changes only what’s sent, and refuses made-up values', async () => {
      const updated = await settings.workspace.update(admin, {
        timeZone: 'Asia/Kolkata'
      })
      expect(updated).toMatchObject({ name: 'Halden', currency: 'USD' })
      await expect(
        settings.workspace.update(admin, { currency: 'ZZZ1' })
      ).rejects.toBeInstanceOf(ZodError)
      await expect(
        settings.workspace.update(admin, { timeZone: 'Mars/Olympus' })
      ).rejects.toBeInstanceOf(ZodError)
    })
  })

  describe('your own name', () => {
    it('is yours to change, whatever your role', async () => {
      const renamed = await settings.profile.update(ravi, {
        name: '  Ravi K. Shah '
      })
      expect(renamed).toEqual({ ...ravi, name: 'Ravi K. Shah' })
      const [found] = await db.select().from(user).where(eq(user.id, ravi.id))
      expect(found.name).toBe('Ravi K. Shah')
      const [entry] = await logged('user')
      expect(entry).toMatchObject({ actorId: ravi.id, recordId: ravi.id })
    })
  })

  describe('pipeline stages', () => {
    it('are an admin’s to read here and to change', async () => {
      const current = await read()
      for (const who of [manager, ravi]) {
        await expect(settings.pipeline.get(who)).rejects.toBeInstanceOf(
          NotAllowedError
        )
        await expect(
          settings.pipeline.saveStages(who, {
            revision: current.revision,
            stages: asInput(current)
          })
        ).rejects.toBeInstanceOf(NotAllowedError)
      }
      // Everyone still reads the pipeline itself.
      expect((await records.pipeline.get()).stages).toHaveLength(5)
    })

    it('renames, reorders and adds in one save, keeping Won and Lost last', async () => {
      const current = await read()
      const [qualified, proposal, negotiation] = asInput(current)
      const saved = await settings.pipeline.saveStages(admin, {
        revision: current.revision,
        stages: [
          { ...proposal, name: 'Quote sent', winProbability: 40 },
          qualified,
          {
            name: 'Legal review',
            winProbability: 85,
            stalledAfterDays: null,
            goal: 'Get the contract through their legal team.',
            exitCriteria: '  '
          },
          negotiation
        ],
        wonName: 'Closed won'
      })

      expect(saved.stages.map((s) => [s.name, s.position, s.kind])).toEqual([
        ['Quote sent', 0, 'open'],
        ['Qualified', 1, 'open'],
        ['Legal review', 2, 'open'],
        ['Negotiation', 3, 'open'],
        ['Closed won', 4, 'won'],
        ['Lost', 5, 'lost']
      ])
      expect(stageNamed(saved, 'Legal review')).toMatchObject({
        winProbability: 85,
        stalledAfterDays: null,
        goal: 'Get the contract through their legal team.',
        exitCriteria: null,
        dealCount: 0
      })
      expect(saved.revision).not.toBe(current.revision)
      // What everyone else reads follows.
      const forEveryone = await records.pipeline.get()
      expect(forEveryone.stages.map((s) => s.name)).toEqual(
        saved.stages.map((s) => s.name)
      )

      const entries = await logged('stage')
      expect(entries.filter((e) => e.action === 'create')).toHaveLength(1)
      const renamed = entries.find((e) => e.recordId === proposal.id)!
      expect(renamed.changes).toEqual(
        expect.arrayContaining([
          { field: 'name', from: 'Proposal', to: 'Quote sent' },
          { field: 'winProbability', from: 50, to: 40 }
        ])
      )
      // Negotiation only moved down one; Lost only moved down one.
      expect(entries.every((e) => e.actorId === admin.id)).toBe(true)
    })

    it('refuses a save made against an old revision', async () => {
      const current = await read()
      const stages = asInput(current)
      await settings.pipeline.saveStages(admin, {
        revision: current.revision,
        stages: [{ ...stages[0], name: 'Lead' }, ...stages.slice(1)]
      })
      await expect(
        settings.pipeline.saveStages(admin, {
          revision: current.revision,
          stages: [{ ...stages[0], name: 'Suspect' }, ...stages.slice(1)]
        })
      ).rejects.toBeInstanceOf(ChangedSinceError)
      expect((await read()).stages[0].name).toBe('Lead')
    })

    it('saves nothing when part of a save is wrong', async () => {
      const current = await read()
      const [qualified, proposal, negotiation] = asInput(current)
      // Two stages with one name.
      await expect(
        settings.pipeline.saveStages(admin, {
          revision: current.revision,
          stages: [
            { ...qualified, name: 'Discovery' },
            { ...proposal, name: 'discovery ' },
            negotiation
          ]
        })
      ).rejects.toBeInstanceOf(InvalidChangeError)
      // A stage that's neither kept nor removed.
      await expect(
        settings.pipeline.saveStages(admin, {
          revision: current.revision,
          stages: [{ ...qualified, name: 'Discovery' }, proposal]
        })
      ).rejects.toBeInstanceOf(InvalidChangeError)
      // Won can't be removed.
      await expect(
        settings.pipeline.saveStages(admin, {
          revision: current.revision,
          stages: [qualified, proposal, negotiation],
          removed: [{ id: stageNamed(current, 'Won').id, moveDealsTo: null }]
        })
      ).rejects.toBeInstanceOf(InvalidChangeError)
      // No open stages left.
      await expect(
        settings.pipeline.saveStages(admin, {
          revision: current.revision,
          stages: [],
          removed: [qualified, proposal, negotiation].map(({ id }) => ({
            id: id!,
            moveDealsTo: null
          }))
        })
      ).rejects.toBeInstanceOf(ZodError)

      const after = await read()
      expect(after.revision).toBe(current.revision)
      expect(after.stages.map((s) => s.name)).toEqual(
        current.stages.map((s) => s.name)
      )
      expect(await logged('stage')).toHaveLength(0)
    })

    it('removes a stage only once its deals have somewhere to go', async () => {
      const before = await read()
      const proposal = stageNamed(before, 'Proposal')
      const negotiation = stageNamed(before, 'Negotiation')
      const halden = await records.companies.create(ravi, { name: 'Halden' })
      const open = await records.deals.create(ravi, {
        companyId: halden.id,
        name: 'Platform licence',
        stageId: proposal.id
      })
      const shelved = await records.deals.create(ravi, {
        companyId: halden.id,
        name: 'Old pilot',
        stageId: proposal.id
      })
      await records.deals.archive(ravi, shelved.id, shelved.version)

      const current = await read()
      expect(stageNamed(current, 'Proposal').dealCount).toBe(1)
      const kept = asInput(current).filter((s) => s.id !== proposal.id)

      // Nowhere to go.
      await expect(
        settings.pipeline.saveStages(admin, {
          revision: current.revision,
          stages: kept,
          removed: [{ id: proposal.id, moveDealsTo: null }]
        })
      ).rejects.toThrow(/where the deals in “Proposal” should move/)
      // Into a stage that's also going, or isn't a stage.
      await expect(
        settings.pipeline.saveStages(admin, {
          revision: current.revision,
          stages: kept,
          removed: [{ id: proposal.id, moveDealsTo: proposal.id }]
        })
      ).rejects.toBeInstanceOf(InvalidChangeError)
      expect((await records.deals.get(ravi, open.id)).stageId).toBe(proposal.id)

      const saved = await settings.pipeline.saveStages(admin, {
        revision: current.revision,
        stages: kept,
        removed: [{ id: proposal.id, moveDealsTo: negotiation.id }]
      })
      expect(saved.stages.map((s) => s.name)).toEqual([
        'Qualified',
        'Negotiation',
        'Won',
        'Lost'
      ])
      expect(stageNamed(saved, 'Negotiation').dealCount).toBe(1)

      // The open deal moved like any other move; the archived one came too.
      const moved = await records.deals.get(ravi, open.id)
      expect(moved).toMatchObject({
        stageId: negotiation.id,
        status: 'open',
        version: open.version + 1
      })
      const [archived] = await db
        .select()
        .from(deal)
        .where(eq(deal.id, shelved.id))
      expect(archived.stageId).toBe(negotiation.id)
      expect(archived.archivedAt).not.toBeNull()
      const moves = await db
        .select()
        .from(dealStageChange)
        .where(eq(dealStageChange.toStageId, negotiation.id))
      expect(moves.map((move) => move.dealId).sort()).toEqual(
        [open.id, shelved.id].sort()
      )
      expect(moves.every((move) => move.fromStageId === proposal.id)).toBe(true)

      // The stage is archived, not deleted: history still points at it.
      const [gone] = await db
        .select()
        .from(stage)
        .where(eq(stage.id, proposal.id))
      expect(gone.archivedAt).not.toBeNull()
      const [entry] = await db
        .select()
        .from(changeLog)
        .where(
          and(
            eq(changeLog.recordType, 'stage'),
            eq(changeLog.action, 'archive')
          )
        )
      expect(entry).toMatchObject({ recordId: proposal.id, actorId: admin.id })
      // New deals can't land there, and the board has no column for it.
      await expect(
        records.deals.create(ravi, {
          companyId: halden.id,
          name: 'Late',
          stageId: proposal.id
        })
      ).rejects.toBeInstanceOf(InvalidChangeError)
      const board = await records.pipeline.board(ravi)
      expect(board.columns.map((column) => column.count)).toEqual([0, 1])
    })

    it('removes an empty stage without asking', async () => {
      const current = await read()
      const proposal = stageNamed(current, 'Proposal')
      const saved = await settings.pipeline.saveStages(admin, {
        revision: current.revision,
        stages: asInput(current).filter((s) => s.id !== proposal.id),
        removed: [{ id: proposal.id, moveDealsTo: null }]
      })
      expect(saved.stages.map((s) => s.position)).toEqual([0, 1, 2, 3])
    })
  })

  describe('lost reasons', () => {
    const labels = (current: TPipelineSettings, archived = false) =>
      current.lostReasons
        .filter((reason) => Boolean(reason.archivedAt) === archived)
        .map((reason) => reason.label)

    it('are an admin’s to change', async () => {
      const current = await read()
      for (const who of [manager, ravi]) {
        await expect(
          settings.pipeline.saveLostReasons(who, {
            revision: current.revision,
            reasons: [{ label: 'Because' }]
          })
        ).rejects.toBeInstanceOf(NotAllowedError)
      }
    })

    it('adds, renames, reorders, archives and brings back', async () => {
      const current = await read()
      const [price, competitor, timing] = current.lostReasons
      const saved = await settings.pipeline.saveLostReasons(admin, {
        revision: current.revision,
        reasons: [
          { id: timing.id, label: 'Bad timing' },
          { label: 'No budget' },
          { id: price.id, label: 'Too expensive' }
        ]
      })
      expect(labels(saved)).toEqual([
        'Bad timing',
        'No budget',
        'Too expensive'
      ])
      expect(labels(saved, true)).toEqual(['Chose a competitor'])
      // Closing a deal as lost offers only the live ones.
      expect(
        (await records.pipeline.get()).lostReasons.map((r) => r.label)
      ).toEqual(['Bad timing', 'No budget', 'Too expensive'])

      const entries = await logged('lost_reason')
      expect(entries.map((e) => e.action).sort()).toEqual([
        'archive',
        'create',
        'update',
        'update'
      ])

      await expect(
        settings.pipeline.saveLostReasons(admin, {
          revision: current.revision,
          reasons: [{ label: 'Stale' }]
        })
      ).rejects.toBeInstanceOf(ChangedSinceError)

      const restored = await settings.pipeline.saveLostReasons(admin, {
        revision: saved.revision,
        reasons: [
          ...saved.lostReasons
            .filter((reason) => !reason.archivedAt)
            .map(({ id, label }) => ({ id, label })),
          { id: competitor.id, label: 'Chose a competitor' }
        ]
      })
      expect(labels(restored)).toEqual([
        'Bad timing',
        'No budget',
        'Too expensive',
        'Chose a competitor'
      ])
      expect(labels(restored, true)).toEqual([])
    })

    it('refuses repeats, unknown reasons and an empty list', async () => {
      const current = await read()
      await expect(
        settings.pipeline.saveLostReasons(admin, {
          revision: current.revision,
          reasons: [{ label: 'Price' }, { label: ' price' }]
        })
      ).rejects.toBeInstanceOf(InvalidChangeError)
      await expect(
        settings.pipeline.saveLostReasons(admin, {
          revision: current.revision,
          reasons: [{ id: 'nope', label: 'Price' }]
        })
      ).rejects.toBeInstanceOf(InvalidChangeError)
      await expect(
        settings.pipeline.saveLostReasons(admin, {
          revision: current.revision,
          reasons: []
        })
      ).rejects.toBeInstanceOf(ZodError)
      expect((await read()).revision).toBe(current.revision)
    })

    it('leaves a lost deal its reason when the reason is archived', async () => {
      const current = await read()
      const [price, competitor] = current.lostReasons
      const halden = await records.companies.create(ravi, { name: 'Halden' })
      const lost = await records.deals.create(ravi, {
        companyId: halden.id,
        name: 'Platform licence',
        stageId: stageNamed(current, 'Lost').id,
        lostReasonId: price.id
      })
      await settings.pipeline.saveLostReasons(admin, {
        revision: current.revision,
        reasons: [{ id: competitor.id, label: competitor.label }]
      })
      expect((await records.deals.get(ravi, lost.id)).lostReasonId).toBe(
        price.id
      )
    })
  })

  describe('roles and turning accounts off', () => {
    const statusOf = async (id: string) => {
      const [found] = await db
        .select({ role: user.role, status: user.status })
        .from(user)
        .where(eq(user.id, id))
      return found
    }
    const addPerson = (id: string, role: string, status = 'active') =>
      db
        .insert(user)
        .values({ id, name: id, email: `${id}@halden.com`, role, status })

    it('are an admin’s to change', async () => {
      for (const who of [manager, ravi]) {
        await expect(
          settings.members.update(who, ravi.id, { role: 'admin' })
        ).rejects.toBeInstanceOf(NotAllowedError)
        await expect(
          settings.members.update(who, admin.id, { status: 'deactivated' })
        ).rejects.toBeInstanceOf(NotAllowedError)
      }
      expect(await statusOf(ravi.id)).toEqual({
        role: 'member',
        status: 'active'
      })
    })

    it('changes a role and writes it down', async () => {
      const updated = await settings.members.update(admin, ravi.id, {
        role: 'manager'
      })
      expect(updated).toMatchObject({
        id: ravi.id,
        role: 'manager',
        status: 'active'
      })
      const [entry] = await logged('user')
      expect(entry).toMatchObject({
        actorId: admin.id,
        recordId: ravi.id,
        action: 'update',
        changes: [{ field: 'role', from: 'member', to: 'manager' }]
      })
    })

    it('signs someone out everywhere when they’re deactivated', async () => {
      const inAnHour = new Date(Date.now() + 60 * 60 * 1000)
      await db.insert(session).values([
        { id: 's1', token: 't1', userId: ravi.id, expiresAt: inAnHour },
        { id: 's2', token: 't2', userId: ravi.id, expiresAt: inAnHour },
        { id: 's3', token: 't3', userId: manager.id, expiresAt: inAnHour }
      ])
      const off = await settings.members.update(admin, ravi.id, {
        status: 'deactivated'
      })
      expect(off.status).toBe('deactivated')
      const left = await db.select({ id: session.id }).from(session)
      expect(left).toEqual([{ id: 's3' }])
      // They can't own new records until they're back.
      await expect(
        records.companies.create(manager, { name: 'Acme', ownerId: ravi.id })
      ).rejects.toBeInstanceOf(InvalidChangeError)

      const on = await settings.members.update(admin, ravi.id, {
        status: 'active'
      })
      expect(on).toMatchObject({ status: 'active', role: 'member' })
    })

    it('never lets an admin deactivate themselves', async () => {
      await addPerson('u-second', 'admin')
      await expect(
        settings.members.update(admin, admin.id, { status: 'deactivated' })
      ).rejects.toThrow(/your own account/)
      expect((await statusOf(admin.id)).status).toBe('active')
    })

    it('never leaves the workspace without an active admin', async () => {
      // The only admin can't step down.
      await expect(
        settings.members.update(admin, admin.id, { role: 'manager' })
      ).rejects.toThrow(/at least one admin/)

      // A deactivated admin doesn't count as one.
      await addPerson('u-former', 'admin', 'deactivated')
      await expect(
        settings.members.update(admin, admin.id, { role: 'member' })
      ).rejects.toBeInstanceOf(InvalidChangeError)

      // With a second active admin, either may go, but not both.
      await settings.members.update(admin, ravi.id, { role: 'admin' })
      const raviAsAdmin: TActor = { ...ravi, role: 'admin' }
      await settings.members.update(raviAsAdmin, admin.id, {
        status: 'deactivated'
      })
      await expect(
        settings.members.update(raviAsAdmin, ravi.id, { role: 'member' })
      ).rejects.toThrow(/at least one admin/)
      expect(await statusOf(ravi.id)).toEqual({
        role: 'admin',
        status: 'active'
      })

      // Someone who was an admin when they signed in, but isn't now.
      await expect(
        settings.members.update(admin, ravi.id, { role: 'member' })
      ).rejects.toBeInstanceOf(NotAllowedError)
    })

    it('leaves people who haven’t joined to Approve and Decline', async () => {
      await addPerson('u-waiting', 'member', 'pending')
      await expect(
        settings.members.update(admin, 'u-waiting', { role: 'manager' })
      ).rejects.toThrow(/Approve them first/)
      await expect(
        settings.members.update(admin, 'u-nobody', { role: 'manager' })
      ).rejects.toThrow(/doesn’t exist/)
    })
  })

  describe('over the API', () => {
    const appAs = (me: TSessionUser | null) =>
      createApp({
        version: 'test',
        isDatabaseReachable: async () => true,
        handleAuth: async () => new Response(null, { status: 404 }),
        getSessionUser: async () => me,
        setup: {} as TSetupService,
        team: {} as TTeamService,
        settings
      })

    const send = (method: string, path: string, body: unknown) =>
      new Request(`http://test/api/v1${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })

    // Just the parts of an answer these tests read.
    const bodyOf = async (response: Response) =>
      (await response.json()) as {
        error: { code: string }
        user: { name: string }
        member: { id: string; role: string }
      }

    it('needs a sign-in', async () => {
      for (const path of ['/settings/workspace', '/settings/pipeline']) {
        const response = await appAs(null).request(`/api/v1${path}`)
        expect(response.status).toBe(401)
      }
      const response = await appAs(null).request(
        send('PATCH', `/team/members/${ravi.id}`, { role: 'admin' })
      )
      expect(response.status).toBe(401)
    })

    it('refuses every admin-only write from a member or a manager', async () => {
      const current = await read()
      const writes = [
        send('PATCH', '/settings/workspace', { name: 'Mine now' }),
        send('PUT', '/settings/pipeline/stages', {
          revision: current.revision,
          stages: asInput(current)
        }),
        send('PUT', '/settings/pipeline/lost-reasons', {
          revision: current.revision,
          reasons: [{ label: 'Because' }]
        }),
        send('PATCH', `/team/members/${ravi.id}`, { role: 'admin' })
      ]
      for (const who of [manager, ravi]) {
        for (const write of writes) {
          const response = await appAs(who).request(write.clone())
          expect(response.status, write.url).toBe(403)
          expect((await bodyOf(response)).error.code).toBe('forbidden')
        }
        const reading = await appAs(who).request('/api/v1/settings/pipeline')
        expect(reading.status).toBe(403)
        // Reading the workspace and changing your own name are for everyone.
        const workspaceRead = await appAs(who).request(
          '/api/v1/settings/workspace'
        )
        expect(workspaceRead.status).toBe(200)
        const rename = await appAs(who).request(
          send('PATCH', '/settings/me', { name: `${who.name} Jr` })
        )
        expect(rename.status).toBe(200)
        expect((await bodyOf(rename)).user.name).toBe(`${who.name} Jr`)
      }
    })

    it('answers each problem with its own status and code', async () => {
      const app = appAs(admin)
      const current = await read()

      const saved = await app.request(
        send('PUT', '/settings/pipeline/stages', {
          revision: current.revision,
          stages: asInput(current)
        })
      )
      expect(saved.status).toBe(200)

      const stale = await app.request(
        send('PUT', '/settings/pipeline/stages', {
          revision: current.revision,
          stages: asInput(current)
        })
      )
      expect(stale.status).toBe(409)
      expect((await bodyOf(stale)).error.code).toBe('changed_since')

      const invalid = await app.request(
        send('PUT', '/settings/pipeline/stages', {
          revision: current.revision,
          stages: [{ name: '', winProbability: 140, stalledAfterDays: null }]
        })
      )
      expect(invalid.status).toBe(400)
      expect((await bodyOf(invalid)).error.code).toBe('invalid_request')

      const lastAdmin = await app.request(
        send('PATCH', `/team/members/${admin.id}`, { role: 'member' })
      )
      expect(lastAdmin.status).toBe(400)
      expect((await bodyOf(lastAdmin)).error.code).toBe('invalid_change')

      const nobody = await app.request(
        send('PATCH', '/team/members/u-nobody', { role: 'member' })
      )
      expect(nobody.status).toBe(404)

      const promoted = await app.request(
        send('PATCH', `/team/members/${ravi.id}`, { role: 'manager' })
      )
      expect(promoted.status).toBe(200)
      expect((await bodyOf(promoted)).member).toMatchObject({
        id: ravi.id,
        role: 'manager'
      })
    })
  })
})
