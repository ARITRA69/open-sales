/*
 * Proposals against a real Postgres: who may make and decide one, the
 * "Changed since" check, undo and its window, and how the change log labels
 * what AI proposed. Runs only with TEST_DATABASE_URL set, on a database whose
 * name says "test", because it empties it first:
 *
 *   TEST_DATABASE_URL=postgres://open_sales:open-sales@localhost:5433/open_sales_test_proposals \
 *     bunx vitest run src/proposals
 */
import type { TSessionUser } from '@open-sales/shared'
import { and, eq, sql } from 'drizzle-orm'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createApp } from '../app'
import type { TDatabase } from '../db/client'
import { createDatabase } from '../db/client'
import { runMigrations } from '../db/migrate'
import { changeLog, proposal, user, workspace } from '../db/schema'
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
import type { TProposalsService } from './service'
import {
  AlreadyDecidedError,
  createProposalsService,
  NotYoursError,
  UndoConflictError,
  UndoExpiredError
} from './service'

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

const UNDO_MS = 60_000

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

describe.skipIf(!DATABASE_URL)('proposals service (database)', () => {
  let db: TDatabase
  let close: () => Promise<void>
  let records: TRecordsService
  let proposals: TProposalsService
  // Moved forward to step past the undo window.
  let clock = () => new Date()

  beforeAll(async () => {
    await ensureDatabase(DATABASE_URL!)
    const connection = createDatabase(DATABASE_URL!)
    db = connection.db
    close = () => connection.sql.end()
    await runMigrations(db)
    records = createRecordsService(db)
    proposals = createProposalsService(db, {
      now: () => clock(),
      undoMs: UNDO_MS
    })
  })

  afterAll(async () => {
    await close?.()
  })

  beforeEach(async () => {
    clock = () => new Date()
    await db.execute(
      sql`truncate proposal, company, person, deal, deal_person, deal_stage_change, change_log, "user" cascade`
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

  /** Ravi's company with one deal in the first stage. */
  const seed = async () => {
    const halden = await records.companies.create(ravi, {
      name: 'Halden Capital',
      domain: 'halden.com'
    })
    const platform = await records.deals.create(ravi, {
      companyId: halden.id,
      name: 'Platform',
      valueMinor: 1_800_000
    })
    const { stages, lostReasons } = await records.pipeline.get()
    return { halden, platform, stages, lostReasons }
  }

  const proposeStage = (
    me: TActor,
    dealId: string,
    stageId: string,
    extra: { baseVersion?: number } = {}
  ) =>
    proposals.create(me, {
      kind: 'update',
      targetType: 'deal',
      targetId: dealId,
      changes: [{ field: 'stageId', to: stageId }],
      title: 'Move Platform along',
      why: 'Dan asked for pricing by Friday',
      sources: [{ type: 'email', id: '<m1@halden.com>' }],
      engine: 'claude-code',
      ...extra
    })

  const logFor = (recordType: 'company' | 'deal' | 'person', id: string) =>
    db
      .select()
      .from(changeLog)
      .where(
        and(eq(changeLog.recordType, recordType), eq(changeLog.recordId, id))
      )
      .orderBy(changeLog.id)

  describe('making one', () => {
    it('records who asked, which tool, why, and each field’s before and after', async () => {
      const { platform, stages } = await seed()
      const made = await proposals.create(ravi, {
        kind: 'update',
        targetType: 'deal',
        targetId: platform.id,
        changes: [
          { field: 'stageId', to: stages[2].id },
          { field: 'valueMinor', to: 2_500_000 },
          { field: 'nextStep', to: '  Send pricing by Friday ' }
        ],
        title: 'Move Platform to Proposal',
        why: 'Dan asked for pricing by Friday',
        sources: [{ type: 'email', id: '<m1@halden.com>' }],
        engine: 'codex'
      })

      expect(made).toMatchObject({
        kind: 'update',
        status: 'pending',
        title: 'Move Platform to Proposal',
        why: 'Dan asked for pricing by Friday',
        engine: 'codex',
        requestedBy: { id: ravi.id, name: 'Ravi Shah' },
        approver: { id: ravi.id, name: 'Ravi Shah' },
        canDecide: true,
        target: {
          type: 'deal',
          id: platform.id,
          name: 'Platform',
          companyName: 'Halden Capital',
          currency: 'USD',
          version: 1
        },
        sources: [{ type: 'email', id: '<m1@halden.com>' }]
      })
      expect(made.changes).toEqual([
        {
          field: 'stageId',
          from: stages[0].id,
          to: stages[2].id,
          fromLabel: stages[0].name,
          toLabel: stages[2].name,
          current: stages[0].id,
          currentLabel: stages[0].name
        },
        {
          field: 'valueMinor',
          from: 1_800_000,
          to: 2_500_000,
          fromLabel: null,
          toLabel: null,
          current: 1_800_000,
          currentLabel: null
        },
        {
          field: 'nextStep',
          from: null,
          to: 'Send pricing by Friday',
          fromLabel: null,
          toLabel: null,
          current: null,
          currentLabel: null
        }
      ])
      // Nothing changes until someone says yes.
      expect(await records.deals.get(ravi, platform.id)).toMatchObject({
        stageId: stages[0].id,
        version: 1
      })
    })

    it('refuses what the person couldn’t do by hand', async () => {
      const { halden, platform, stages } = await seed()
      await expect(
        proposeStage(lena, platform.id, stages[1].id)
      ).rejects.toBeInstanceOf(NotAllowedError)
      await expect(
        proposals.create(lena, {
          kind: 'create',
          targetType: 'person',
          changes: [
            { field: 'companyId', to: halden.id },
            { field: 'name', to: 'Dan Okafor' }
          ],
          title: 'Add Dan Okafor',
          engine: 'claude-code'
        })
      ).rejects.toBeInstanceOf(NotAllowedError)
      await expect(
        proposals.create(lena, {
          kind: 'archive',
          targetType: 'company',
          targetId: halden.id,
          title: 'Archive Halden Capital',
          engine: 'claude-code'
        })
      ).rejects.toBeInstanceOf(NotAllowedError)
      // A manager can, so their AI can.
      await expect(
        proposeStage(manager, platform.id, stages[1].id)
      ).resolves.toMatchObject({ status: 'pending' })
    })

    it('never lets AI change the owner, and checks values like the form does', async () => {
      const { halden, platform } = await seed()
      const propose = (field: string, to: string | number | null) =>
        proposals.create(manager, {
          kind: 'update',
          targetType: field === 'domain' ? 'company' : 'deal',
          targetId: field === 'domain' ? halden.id : platform.id,
          changes: [{ field, to }],
          title: 'Change it',
          engine: 'claude-code'
        })

      await expect(propose('ownerId', lena.id)).rejects.toThrow(
        'AI can’t change who owns a record'
      )
      await expect(propose('valueMinor', -5)).rejects.toBeInstanceOf(
        InvalidChangeError
      )
      await expect(propose('stageId', 'not-a-stage')).rejects.toThrow(
        'Choose a stage that’s in use.'
      )
      await expect(propose('companyId', halden.id)).rejects.toBeInstanceOf(
        InvalidChangeError
      )
      // Already that value: nothing to propose.
      await expect(
        propose('domain', 'https://www.Halden.com/')
      ).rejects.toThrow('nothing to change')
    })

    it('refuses a proposal made from an old read of the record', async () => {
      const { platform, stages } = await seed()
      await records.deals.update(ravi, platform.id, {
        nextStep: 'Call Dan',
        version: 1
      })
      await expect(
        proposeStage(ravi, platform.id, stages[1].id, { baseVersion: 1 })
      ).rejects.toBeInstanceOf(ChangedSinceError)
      await expect(
        proposeStage(ravi, platform.id, stages[1].id, { baseVersion: 2 })
      ).resolves.toMatchObject({ target: { version: 2 } })
    })

    it('doesn’t take tasks, activities or email drafts yet', async () => {
      const base = { title: 'x', engine: 'claude-code' as const }
      await expect(
        proposals.create(ravi, { ...base, kind: 'create', targetType: 'task' })
      ).rejects.toBeInstanceOf(InvalidChangeError)
      await expect(
        proposals.create(ravi, {
          ...base,
          kind: 'email_draft',
          targetType: 'deal'
        })
      ).rejects.toBeInstanceOf(InvalidChangeError)
    })
  })

  describe('listing', () => {
    it('shows what waits for me, newest first, and what waits on a record', async () => {
      const { halden, platform, stages } = await seed()
      const first = await proposeStage(ravi, platform.id, stages[1].id)
      const second = await proposals.create(ravi, {
        kind: 'update',
        targetType: 'company',
        targetId: halden.id,
        changes: [{ field: 'industry', to: 'Finance' }],
        title: 'Set the industry',
        engine: 'claude-code'
      })
      const byManager = await proposeStage(manager, platform.id, stages[2].id)

      const mine = await proposals.list(ravi, { limit: 50 })
      expect(mine.items.map((item) => item.id)).toEqual([second.id, first.id])
      expect(mine.total).toBe(2)

      const paged = await proposals.list(ravi, { limit: 1 })
      expect(paged.items.map((item) => item.id)).toEqual([second.id])
      expect(paged.total).toBe(2)
      const rest = await proposals.list(ravi, {
        limit: 1,
        cursor: paged.nextCursor ?? undefined
      })
      expect(rest.items.map((item) => item.id)).toEqual([first.id])
      expect(rest.nextCursor).toBeNull()

      // On the deal, whoever decides: Ravi's and the manager's.
      const onDeal = await proposals.list(lena, {
        targetType: 'deal',
        targetId: platform.id,
        limit: 50
      })
      expect(onDeal.items.map((item) => item.id)).toEqual([
        byManager.id,
        first.id
      ])
      expect(onDeal.items.every((item) => !item.canDecide)).toBe(true)

      await proposals.decline(ravi, first.id)
      expect((await proposals.list(ravi, { limit: 50 })).total).toBe(1)
    })
  })

  describe('approving', () => {
    it('applies the change and labels it as AI, approved by that person', async () => {
      const { platform, stages } = await seed()
      const made = await proposeStage(ravi, platform.id, stages[2].id)
      const { outcome, proposal: approved } = await proposals.approve(
        ravi,
        made.id
      )

      expect(outcome).toBe('approved')
      expect(approved).toMatchObject({
        status: 'approved',
        decidedBy: { id: ravi.id, name: 'Ravi Shah' },
        target: { version: 2 }
      })
      expect(approved.undoUntil).not.toBeNull()
      expect(await records.deals.get(ravi, platform.id)).toMatchObject({
        stageId: stages[2].id,
        version: 2
      })

      const log = await logFor('deal', platform.id)
      expect(log.at(-1)).toMatchObject({
        action: 'update',
        actorId: ravi.id,
        via: 'ai_proposal',
        proposalId: made.id,
        changes: [{ field: 'stageId', from: stages[0].id, to: stages[2].id }]
      })
      // What people do by hand is still "app", with no proposal.
      expect(log[0]).toMatchObject({ via: 'app', proposalId: null })
    })

    it('takes the values a person edited first', async () => {
      const { platform, stages } = await seed()
      const made = await proposals.create(ravi, {
        kind: 'update',
        targetType: 'deal',
        targetId: platform.id,
        changes: [
          { field: 'stageId', to: stages[2].id },
          { field: 'valueMinor', to: 2_500_000 }
        ],
        title: 'Move Platform to Proposal',
        engine: 'claude-code'
      })

      await expect(
        proposals.approve(ravi, made.id, {
          changes: [{ field: 'nextStep', to: 'Not proposed' }]
        })
      ).rejects.toThrow('isn’t part of this proposal')
      await expect(
        proposals.approve(ravi, made.id, {
          changes: [{ field: 'valueMinor', to: -1 }]
        })
      ).rejects.toBeInstanceOf(InvalidChangeError)

      const { proposal: approved } = await proposals.approve(ravi, made.id, {
        changes: [{ field: 'valueMinor', to: 2_200_000 }]
      })
      expect(await records.deals.get(ravi, platform.id)).toMatchObject({
        stageId: stages[2].id,
        valueMinor: 2_200_000
      })
      // The proposal keeps what was really saved.
      expect(approved.changes).toMatchObject([
        { field: 'stageId', to: stages[2].id },
        { field: 'valueMinor', from: 1_800_000, to: 2_200_000 }
      ])
    })

    it('checks the role again, and can hand the decision to the owner', async () => {
      const { halden, stages } = await seed()
      // A deal Ravi owns outright, so it stays his when the company moves.
      const made = await proposals.create(ravi, {
        kind: 'update',
        targetType: 'company',
        targetId: halden.id,
        changes: [{ field: 'industry', to: 'Finance' }],
        title: 'Set the industry',
        engine: 'claude-code'
      })
      // The company changes hands before Ravi gets to it.
      const moved = await records.companies.update(manager, halden.id, {
        ownerId: lena.id,
        version: 1
      })

      // Out of date too, so Ravi approves against what he now sees.
      await expect(
        proposals.approve(ravi, made.id, { version: moved.version })
      ).rejects.toBeInstanceOf(NotAllowedError)
      expect(await proposals.get(ravi, made.id)).toMatchObject({
        canDecide: true
      })
      expect((await records.companies.get(ravi, halden.id)).industry).toBeNull()

      const sent = await proposals.sendToOwner(ravi, made.id)
      expect(sent).toMatchObject({
        approver: { id: lena.id, name: 'Lena Ortiz' },
        requestedBy: { id: ravi.id },
        canDecide: false
      })
      expect((await proposals.list(ravi, { limit: 50 })).total).toBe(0)
      const forLena = await proposals.list(lena, { limit: 50 })
      expect(forLena.items).toMatchObject([
        { id: made.id, canDecide: true, requestedBy: { name: 'Ravi Shah' } }
      ])
      await expect(proposals.sendToOwner(ravi, made.id)).rejects.toThrow(
        'already waiting for the owner'
      )

      await proposals.approve(lena, made.id, { version: moved.version })
      expect((await records.companies.get(lena, halden.id)).industry).toBe(
        'Finance'
      )
      expect((await logFor('company', halden.id)).at(-1)).toMatchObject({
        actorId: lena.id,
        via: 'ai_proposal',
        proposalId: made.id
      })
      expect(stages.length).toBeGreaterThan(0)
    })

    it('is only for the person it waits for, and only once', async () => {
      const { platform, stages } = await seed()
      const made = await proposeStage(ravi, platform.id, stages[1].id)
      await expect(proposals.approve(manager, made.id)).rejects.toBeInstanceOf(
        NotYoursError
      )
      await expect(proposals.decline(lena, made.id)).rejects.toBeInstanceOf(
        NotYoursError
      )
      await proposals.approve(ravi, made.id)
      await expect(proposals.approve(ravi, made.id)).rejects.toBeInstanceOf(
        AlreadyDecidedError
      )
      await expect(proposals.decline(ravi, made.id)).rejects.toBeInstanceOf(
        AlreadyDecidedError
      )
    })
  })

  describe('when the record changed since', () => {
    it('shows as out of date with the current values, saves nothing, then applies once seen', async () => {
      const { platform, stages } = await seed()
      const made = await proposeStage(ravi, platform.id, stages[2].id)
      // Someone moves the deal after the AI proposed.
      await records.deals.update(manager, platform.id, {
        stageId: stages[1].id,
        version: 1
      })

      // Already shown as out of date, before anyone tries.
      const listed = (await proposals.list(ravi, { limit: 50 })).items[0]
      expect(listed).toMatchObject({
        status: 'out_of_date',
        target: { version: 2 }
      })
      expect(listed.changes[0]).toMatchObject({
        from: stages[0].id,
        current: stages[1].id,
        currentLabel: stages[1].name,
        to: stages[2].id
      })

      const refused = await proposals.approve(ravi, made.id)
      expect(refused.outcome).toBe('changed_since')
      expect(refused.proposal).toMatchObject({ status: 'out_of_date' })
      expect(refused.proposal.changes[0].current).toBe(stages[1].id)
      expect(await records.deals.get(ravi, platform.id)).toMatchObject({
        stageId: stages[1].id,
        version: 2
      })
      const [stored] = await db
        .select({ status: proposal.status })
        .from(proposal)
        .where(eq(proposal.id, made.id))
      expect(stored.status).toBe('out_of_date')
      // Still waiting for a decision.
      expect((await proposals.list(ravi, { limit: 50 })).total).toBe(1)

      // It moves again while the card is open: still nothing saved.
      await records.deals.update(manager, platform.id, {
        nextStep: 'Call Dan',
        version: 2
      })
      expect(
        (await proposals.approve(ravi, made.id, { version: 2 })).outcome
      ).toBe('changed_since')

      const applied = await proposals.approve(ravi, made.id, { version: 3 })
      expect(applied.outcome).toBe('approved')
      expect(applied.proposal.changes).toMatchObject([
        { field: 'stageId', from: stages[1].id, to: stages[2].id }
      ])
      expect((await records.deals.get(ravi, platform.id)).stageId).toBe(
        stages[2].id
      )
    })

    it('can be dismissed instead', async () => {
      const { platform, stages } = await seed()
      const made = await proposeStage(ravi, platform.id, stages[2].id)
      await records.deals.update(manager, platform.id, {
        stageId: stages[1].id,
        version: 1
      })
      await proposals.approve(ravi, made.id)
      const declined = await proposals.decline(ravi, made.id, {
        reason: ' Wrong deal '
      })
      expect(declined).toMatchObject({
        status: 'declined',
        declineReason: 'Wrong deal',
        decidedBy: { id: ravi.id }
      })
      expect((await records.deals.get(ravi, platform.id)).stageId).toBe(
        stages[1].id
      )
    })
  })

  describe('undo', () => {
    it('puts the old values back within the window, as the person’s own change', async () => {
      const { platform, stages } = await seed()
      const won = stages.find((s) => s.kind === 'won')!
      await records.deals.update(ravi, platform.id, {
        closeDate: '2027-01-15',
        version: 1
      })
      const made = await proposeStage(ravi, platform.id, won.id)
      const { proposal: approved } = await proposals.approve(ravi, made.id)
      // Closing the deal also set its close date to today.
      expect(approved.changes.map((change) => change.field)).toEqual([
        'stageId',
        'closeDate'
      ])
      expect(await records.deals.get(ravi, platform.id)).toMatchObject({
        status: 'won'
      })

      const undone = await proposals.undo(ravi, made.id)
      expect(undone.status).toBe('undone')
      expect(await records.deals.get(ravi, platform.id)).toMatchObject({
        stageId: stages[0].id,
        status: 'open',
        closeDate: '2027-01-15',
        closedAt: null
      })
      expect((await logFor('deal', platform.id)).at(-1)).toMatchObject({
        actorId: ravi.id,
        via: 'app',
        proposalId: made.id
      })
      await expect(proposals.undo(ravi, made.id)).rejects.toBeInstanceOf(
        AlreadyDecidedError
      )
    })

    it('is refused once the window has passed', async () => {
      const { platform, stages } = await seed()
      const made = await proposeStage(ravi, platform.id, stages[2].id)
      await proposals.approve(ravi, made.id)

      const later = Date.now() + UNDO_MS + 1000
      clock = () => new Date(later)
      await expect(proposals.undo(ravi, made.id)).rejects.toBeInstanceOf(
        UndoExpiredError
      )
      expect((await records.deals.get(ravi, platform.id)).stageId).toBe(
        stages[2].id
      )
      expect((await proposals.get(ravi, made.id)).status).toBe('approved')
    })

    it('is refused if the record moved on, and only for whoever approved', async () => {
      const { platform, stages } = await seed()
      const made = await proposeStage(ravi, platform.id, stages[2].id)
      await proposals.approve(ravi, made.id)
      await expect(proposals.undo(manager, made.id)).rejects.toBeInstanceOf(
        NotYoursError
      )

      // A change to another field doesn't block it…
      const noted = await records.deals.update(manager, platform.id, {
        nextStep: 'Call Dan',
        version: 2
      })
      // …but a change to what the proposal set does.
      await records.deals.update(manager, platform.id, {
        stageId: stages[3].id,
        version: noted.version
      })
      await expect(proposals.undo(ravi, made.id)).rejects.toBeInstanceOf(
        UndoConflictError
      )
      expect((await records.deals.get(ravi, platform.id)).stageId).toBe(
        stages[3].id
      )
    })

    it('keeps other people’s later changes to other fields', async () => {
      const { platform, stages } = await seed()
      const made = await proposeStage(ravi, platform.id, stages[2].id)
      await proposals.approve(ravi, made.id)
      await records.deals.update(manager, platform.id, {
        nextStep: 'Call Dan',
        version: 2
      })
      await proposals.undo(ravi, made.id)
      expect(await records.deals.get(ravi, platform.id)).toMatchObject({
        stageId: stages[0].id,
        nextStep: 'Call Dan'
      })
    })
  })

  describe('new records and archiving', () => {
    it('adds a person when approved, and archives them again on undo', async () => {
      const { halden } = await seed()
      const made = await proposals.create(ravi, {
        kind: 'create',
        targetType: 'person',
        changes: [
          { field: 'companyId', to: halden.id },
          { field: 'name', to: 'Dan Okafor' },
          { field: 'title', to: 'CFO' },
          { field: 'email', to: 'Dan@Halden.com' }
        ],
        title: 'Add Dan Okafor to Halden Capital',
        why: 'He signed the last email as CFO',
        engine: 'claude-code'
      })
      expect(made).toMatchObject({
        status: 'pending',
        target: {
          type: 'person',
          id: null,
          name: 'Dan Okafor',
          companyName: 'Halden Capital'
        }
      })
      expect(made.changes).toContainEqual({
        field: 'email',
        from: null,
        to: 'dan@halden.com',
        fromLabel: null,
        toLabel: null
      })

      const { proposal: approved } = await proposals.approve(ravi, made.id)
      const danId = approved.target.id!
      expect(await records.people.get(ravi, danId)).toMatchObject({
        name: 'Dan Okafor',
        title: 'CFO',
        email: 'dan@halden.com',
        company: { id: halden.id }
      })
      expect((await logFor('person', danId))[0]).toMatchObject({
        action: 'create',
        via: 'ai_proposal',
        proposalId: made.id
      })

      await proposals.undo(ravi, made.id)
      expect((await records.people.get(ravi, danId)).archivedAt).not.toBeNull()
    })

    it('archives a company when approved, and restores it on undo', async () => {
      const { halden, platform } = await seed()
      const made = await proposals.create(ravi, {
        kind: 'archive',
        targetType: 'company',
        targetId: halden.id,
        title: 'Archive Halden Capital',
        why: 'They closed down in October',
        engine: 'claude-code'
      })
      await proposals.approve(ravi, made.id)
      expect(
        (await records.companies.get(ravi, halden.id)).archivedAt
      ).not.toBeNull()
      expect(
        (await records.deals.get(ravi, platform.id)).archivedAt
      ).not.toBeNull()

      await proposals.undo(ravi, made.id)
      expect(
        (await records.companies.get(ravi, halden.id)).archivedAt
      ).toBeNull()
      expect((await records.deals.get(ravi, platform.id)).archivedAt).toBeNull()
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
        proposals
      })

    const post = (path: string, body: unknown = {}) =>
      new Request(`http://test/api/v1${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })

    it('needs a sign-in', async () => {
      const response = await appAs(null).request('/api/v1/proposals')
      expect(response.status).toBe(401)
    })

    it('answers each problem with its own status and code', async () => {
      const { platform, stages } = await seed()
      const app = appAs(ravi)
      const body = {
        kind: 'update',
        targetType: 'deal',
        targetId: platform.id,
        changes: [{ field: 'stageId', to: stages[2].id }],
        title: 'Move Platform to Proposal',
        engine: 'claude-code'
      }

      const made = await app.request(post('/proposals', body))
      expect(made.status).toBe(201)
      const { id } = (await made.json()) as { id: string }

      const forbidden = await appAs(lena).request(post('/proposals', body))
      expect(forbidden.status).toBe(403)
      expect(await forbidden.json()).toMatchObject({
        error: { code: 'forbidden' }
      })
      const untitled = await app.request(
        post('/proposals', { ...body, title: '' })
      )
      expect(untitled.status).toBe(400)

      const listed = await app.request('/api/v1/proposals')
      expect(await listed.json()).toMatchObject({
        items: [{ id }],
        total: 1
      })
      expect((await app.request(`/api/v1/proposals/${id}`)).status).toBe(200)
      expect((await app.request('/api/v1/proposals/nope')).status).toBe(404)

      const notMine = await appAs(manager).request(
        post(`/proposals/${id}/approve`)
      )
      expect(notMine.status).toBe(403)
      expect(await notMine.json()).toMatchObject({
        error: { code: 'not_yours' }
      })

      // The deal moves; the refusal carries what it says now.
      await records.deals.update(manager, platform.id, {
        stageId: stages[1].id,
        version: 1
      })
      const stale = await app.request(post(`/proposals/${id}/approve`))
      expect(stale.status).toBe(409)
      expect(await stale.json()).toMatchObject({
        error: { code: 'changed_since' },
        proposal: {
          id,
          status: 'out_of_date',
          target: { version: 2 },
          changes: [{ current: stages[1].id, currentLabel: stages[1].name }]
        }
      })

      const approved = await app.request(
        post(`/proposals/${id}/approve`, { version: 2 })
      )
      expect(approved.status).toBe(200)
      expect(await approved.json()).toMatchObject({ status: 'approved' })

      const again = await app.request(post(`/proposals/${id}/decline`))
      expect(again.status).toBe(409)
      expect(await again.json()).toMatchObject({
        error: { code: 'already_decided' }
      })

      const undone = await app.request(post(`/proposals/${id}/undo`))
      expect(undone.status).toBe(200)
      expect(await undone.json()).toMatchObject({ status: 'undone' })
    })
  })
})
