import type {
  TProposal,
  TProposalApprove,
  TProposalCreate,
  TProposalDecline,
  TProposalListQuery,
  TProposalPage,
  TProposalRecordType,
  TProposalStatus,
  TProposalValue
} from '@open-sales/shared'
import {
  canEditCompany,
  canEditDeal,
  canEditPerson,
  companyCreateSchema,
  companyUpdateSchema,
  dealCreateSchema,
  dealUpdateSchema,
  isWaitingProposal,
  personCreateSchema,
  personUpdateSchema,
  PROPOSAL_FIELDS,
  PROPOSAL_RECORD_TYPES,
  PROPOSAL_UNDO_MS,
  proposalApproveSchema,
  proposalCreateSchema,
  proposalDeclineSchema
} from '@open-sales/shared'
import { and, count, desc, eq, inArray, lt } from 'drizzle-orm'
import { z } from 'zod'

import type { TDatabase } from '../db/client'
import type { TFieldChange } from '../db/schema'
import {
  company,
  deal,
  lostReason,
  person,
  proposal,
  stage,
  user,
  workspace
} from '../db/schema'
import type { TActor, TQueries } from '../records/common'
import {
  ChangedSinceError,
  decodeCursor,
  encodeCursor,
  InvalidChangeError,
  isRecordId,
  NotAllowedError,
  RecordNotFoundError
} from '../records/common'
import { createRecordsService } from '../records/routes'

/* Errors the routes turn into answers. Messages are for people. */

/** Someone else decides this one. */
export class NotYoursError extends Error {
  constructor() {
    super('This is waiting for someone else to decide.')
  }
}

/** Already approved, declined or undone. */
export class AlreadyDecidedError extends Error {
  constructor(status: TProposalStatus) {
    super(
      status === 'approved'
        ? 'This was already approved.'
        : status === 'declined'
          ? 'This was already declined.'
          : 'This was already undone.'
    )
  }
}

/** The short time for undoing an approved change has passed. */
export class UndoExpiredError extends Error {
  constructor() {
    super(
      'It’s too late to undo this here. Open the record and change it back by hand.'
    )
  }
}

/** The record moved on after the change was approved. */
export class UndoConflictError extends Error {
  constructor() {
    super(
      'This was changed again after it was approved, so it can’t be undone here. Open the record and change it back by hand.'
    )
  }
}

type TRow = typeof proposal.$inferSelect

const WAITING = ['pending', 'out_of_date'] as const

const RECORDS = {
  company: {
    plural: 'companies',
    word: 'company',
    create: companyCreateSchema,
    update: companyUpdateSchema
  },
  person: {
    plural: 'people',
    word: 'person',
    create: personCreateSchema,
    update: personUpdateSchema
  },
  deal: {
    plural: 'deals',
    word: 'deal',
    create: dealCreateSchema,
    update: dealUpdateSchema
  }
} as const

/** A record a proposal is about, as it stands now. */
type TTarget = {
  type: TProposalRecordType
  id: string
  name: string
  companyName: string | null
  currency: string | null
  version: number
  archivedAt: Date | null
  // Who it belongs to: where "send to owner" sends it.
  ownerId: string
  mayEdit: (me: TActor) => boolean
  // The fields a proposal can change, as stored.
  values: Record<string, TProposalValue>
}

const valuesOf = (type: TProposalRecordType, row: Record<string, unknown>) =>
  Object.fromEntries(
    PROPOSAL_FIELDS[type].map((field) => [
      field,
      (row[field] ?? null) as TProposalValue
    ])
  )

const loadTargets = async (
  q: TQueries,
  type: TProposalRecordType,
  ids: string[]
): Promise<TTarget[]> => {
  const wanted = [...new Set(ids)].filter(isRecordId)
  if (wanted.length === 0) return []

  if (type === 'company') {
    const rows = await q
      .select()
      .from(company)
      .where(inArray(company.id, wanted))
    return rows.map((row) => ({
      type,
      id: row.id,
      name: row.name,
      companyName: null,
      currency: null,
      version: row.version,
      archivedAt: row.archivedAt,
      ownerId: row.ownerId,
      mayEdit: (me) => canEditCompany(me.role, me.id, row.ownerId),
      values: valuesOf(type, row)
    }))
  }

  if (type === 'person') {
    const rows = await q
      .select({
        row: person,
        companyName: company.name,
        ownerId: company.ownerId
      })
      .from(person)
      .innerJoin(company, eq(company.id, person.companyId))
      .where(inArray(person.id, wanted))
    return rows.map(({ row, companyName, ownerId }) => ({
      type,
      id: row.id,
      name: row.name,
      companyName,
      currency: null,
      version: row.version,
      archivedAt: row.archivedAt,
      ownerId,
      mayEdit: (me) => canEditPerson(me.role, me.id, ownerId),
      values: valuesOf(type, row)
    }))
  }

  const rows = await q
    .select({
      row: deal,
      companyName: company.name,
      companyOwnerId: company.ownerId
    })
    .from(deal)
    .innerJoin(company, eq(company.id, deal.companyId))
    .where(inArray(deal.id, wanted))
  return rows.map(({ row, companyName, companyOwnerId }) => ({
    type,
    id: row.id,
    name: row.name,
    companyName,
    currency: row.currency,
    version: row.version,
    archivedAt: row.archivedAt,
    ownerId: row.ownerId,
    mayEdit: (me) =>
      canEditDeal(me.role, me.id, { ownerId: row.ownerId, companyOwnerId }),
    values: valuesOf(type, row)
  }))
}

const loadTarget = async (
  q: TQueries,
  type: TProposalRecordType,
  id: string
) => {
  const [found] = await loadTargets(q, type, [id])
  if (!found) throw new RecordNotFoundError(RECORDS[type].word)
  return found
}

/** Tasks and activities come with their own tables; until then, no. */
const recordTypeOf = (type: string): TProposalRecordType => {
  const found = PROPOSAL_RECORD_TYPES.find((known) => known === type)
  if (!found) {
    throw new InvalidChangeError(
      'AI can only propose changes to companies, people and deals for now.'
    )
  }
  return found
}

const firstProblem = (error: z.ZodError) => error.issues[0].message

/**
 * Proposed values, checked and tidied the way the record's own form would
 * (a pasted URL becomes a domain, an email goes lower case). Refuses fields
 * AI may not set.
 */
const checkValues = (
  type: TProposalRecordType,
  kind: 'create' | 'update',
  proposed: { field: string; to: TProposalValue }[]
): Record<string, TProposalValue> => {
  const allowed: readonly string[] = PROPOSAL_FIELDS[type]
  const raw: Record<string, TProposalValue> = {}
  for (const { field, to } of proposed) {
    if (!allowed.includes(field)) {
      throw new InvalidChangeError(
        field === 'ownerId'
          ? 'AI can’t change who owns a record. Ask a manager to reassign it.'
          : `AI can’t set “${field}” on a ${RECORDS[type].word}.`
      )
    }
    if (field in raw) {
      throw new InvalidChangeError(`“${field}” is there twice.`)
    }
    raw[field] = to
  }

  const parsed =
    kind === 'create'
      ? RECORDS[type].create.safeParse(raw)
      : RECORDS[type].update.safeParse({ ...raw, version: 1 })
  if (!parsed.success) throw new InvalidChangeError(firstProblem(parsed.error))

  const tidy = parsed.data as Record<string, unknown>
  const values: Record<string, TProposalValue> = {}
  for (const field of Object.keys(raw)) {
    // The record's own schema dropped it: not something an update can change.
    if (!(field in tidy)) {
      throw new InvalidChangeError(
        `AI can’t change “${field}” on a ${RECORDS[type].word}.`
      )
    }
    values[field] = (tidy[field] ?? null) as TProposalValue
  }
  return values
}

/** Ids in a proposal must point at something real: a stage, a reason, a company. */
const assertReferences = async (
  q: TQueries,
  me: TActor,
  values: Record<string, TProposalValue>
) => {
  const { stageId, lostReasonId, companyId } = values
  if (typeof stageId === 'string') {
    const [found] = isRecordId(stageId)
      ? await q
          .select({ id: stage.id })
          .from(stage)
          .where(eq(stage.id, stageId))
      : []
    if (!found) throw new InvalidChangeError('Choose a stage that’s in use.')
  }
  if (typeof lostReasonId === 'string') {
    const [found] = isRecordId(lostReasonId)
      ? await q
          .select({ id: lostReason.id })
          .from(lostReason)
          .where(eq(lostReason.id, lostReasonId))
      : []
    if (!found) throw new InvalidChangeError('Choose one of the lost reasons.')
  }
  if (typeof companyId === 'string') {
    const [found] = isRecordId(companyId)
      ? await q
          .select({ ownerId: company.ownerId, archivedAt: company.archivedAt })
          .from(company)
          .where(eq(company.id, companyId))
      : []
    if (!found || found.archivedAt) {
      throw new InvalidChangeError('Choose a company that’s still in use.')
    }
    if (!canEditCompany(me.role, me.id, found.ownerId)) {
      throw new NotAllowedError(
        'Only the company’s owner, a manager or an admin can add to it.'
      )
    }
  }
}

const NOT_ALLOWED = (word: string) =>
  `You can’t change this ${word}, so your AI can’t either. Only its owner, a manager or an admin can.`

const keyOf = (type: string, id: string) => `${type}:${id}`

type TServiceOptions = {
  // Passed in so tests can move the clock past the undo window.
  now?: () => Date
  undoMs?: number
}

/**
 * Proposals: made by a person's AI, decided by a person. Approving applies
 * the change through the records services, so the same role and version
 * checks run and the change log says "AI, approved by …".
 */
export const createProposalsService = (
  db: TDatabase,
  { now = () => new Date(), undoMs = PROPOSAL_UNDO_MS }: TServiceOptions = {}
) => {
  // The records services, working inside a proposal's own transaction.
  const recordsIn = (tx: TQueries) =>
    createRecordsService(tx as unknown as TDatabase)

  /** Proposals as the app shows them: names for ids, and what's current. */
  const describe = async (
    q: TQueries,
    rows: TRow[],
    me: TActor
  ): Promise<TProposal[]> => {
    if (rows.length === 0) return []

    const targets = new Map<string, TTarget>()
    for (const type of PROPOSAL_RECORD_TYPES) {
      const ids = rows
        .filter((row) => row.targetType === type && row.targetId)
        .map((row) => row.targetId as string)
      for (const target of await loadTargets(q, type, ids)) {
        targets.set(keyOf(type, target.id), target)
      }
    }
    const targetOf = (row: TRow) =>
      row.targetId
        ? targets.get(keyOf(row.targetType, row.targetId))
        : undefined

    const allValues = [
      ...rows.flatMap((row) => row.changes),
      ...[...targets.values()].map((target) => ({
        field: 'companyId',
        from: target.values.companyId ?? null,
        to: null
      }))
    ]
    const companyIds = [
      ...new Set(
        allValues
          .filter((change) => change.field === 'companyId')
          .flatMap((change) => [change.from, change.to])
          .filter((id): id is string => typeof id === 'string')
          .filter(isRecordId)
      )
    ]
    const userIds = [
      ...new Set(
        rows.flatMap((row) => [
          row.requestedById,
          row.approverId,
          ...(row.decidedById ? [row.decidedById] : [])
        ])
      )
    ]
    const [stages, reasons, companies, users, [settings]] = await Promise.all([
      q.select({ id: stage.id, name: stage.name }).from(stage),
      q.select({ id: lostReason.id, name: lostReason.label }).from(lostReason),
      companyIds.length > 0
        ? q
            .select({ id: company.id, name: company.name })
            .from(company)
            .where(inArray(company.id, companyIds))
        : [],
      q
        .select({ id: user.id, name: user.name })
        .from(user)
        .where(inArray(user.id, userIds)),
      q.select({ currency: workspace.currency }).from(workspace).limit(1)
    ])
    const names = {
      stageId: new Map(stages.map((row) => [row.id, row.name])),
      lostReasonId: new Map(reasons.map((row) => [row.id, row.name])),
      companyId: new Map(companies.map((row) => [row.id, row.name]))
    }
    const labelOf = (field: string, value: unknown) =>
      field in names && typeof value === 'string'
        ? (names[field as keyof typeof names].get(value) ?? null)
        : null
    const userNames = new Map(users.map((row) => [row.id, row.name]))
    const ownerOf = (id: string) => ({ id, name: userNames.get(id) ?? '' })

    return rows.map((row) => {
      const target = targetOf(row)
      const status: TProposalStatus =
        row.status === 'pending' &&
        target &&
        row.baseVersion !== null &&
        target.version !== row.baseVersion
          ? 'out_of_date'
          : row.status
      const showsCurrent =
        isWaitingProposal(status) && row.kind === 'update' && target
      const proposed = (field: string) =>
        row.changes.find((change) => change.field === field)?.to

      return {
        id: row.id,
        kind: row.kind,
        status,
        title: row.title,
        why: row.why,
        target: {
          type: row.targetType,
          id: row.targetId,
          name:
            target?.name ??
            (typeof proposed('name') === 'string'
              ? (proposed('name') as string)
              : row.title),
          companyName:
            target?.companyName ?? labelOf('companyId', proposed('companyId')),
          currency:
            row.targetType === 'deal'
              ? (target?.currency ??
                (typeof proposed('currency') === 'string'
                  ? (proposed('currency') as string)
                  : (settings?.currency ?? 'USD')))
              : null,
          version: target?.version ?? null
        },
        changes: row.changes.map((change) => ({
          field: change.field,
          from: change.from as TProposalValue,
          to: change.to as TProposalValue,
          fromLabel: labelOf(change.field, change.from),
          toLabel: labelOf(change.field, change.to),
          ...(showsCurrent
            ? {
                current: target.values[change.field] ?? null,
                currentLabel: labelOf(change.field, target.values[change.field])
              }
            : {})
        })),
        sources: row.sources,
        requestedBy: ownerOf(row.requestedById),
        approver: ownerOf(row.approverId),
        engine: row.engine,
        decidedBy: row.decidedById ? ownerOf(row.decidedById) : null,
        decidedAt: row.decidedAt?.toISOString() ?? null,
        declineReason: row.declineReason,
        undoUntil: row.undoUntil?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        canDecide: row.approverId === me.id
      }
    })
  }

  const NOT_FOUND = () => new RecordNotFoundError('proposal')

  const readOne = async (q: TQueries, me: TActor, id: string) => {
    const rows = isRecordId(id)
      ? await q.select().from(proposal).where(eq(proposal.id, id))
      : []
    const [found] = await describe(q, rows, me)
    if (!found) throw NOT_FOUND()
    return found
  }

  /** Loads a proposal to decide, locked until the transaction ends. */
  const lock = async (tx: TQueries, id: string) => {
    const [row] = isRecordId(id)
      ? await tx
          .select()
          .from(proposal)
          .where(eq(proposal.id, id))
          .for('update')
      : []
    if (!row) throw NOT_FOUND()
    return row
  }

  const assertWaiting = (row: TRow) => {
    if (!isWaitingProposal(row.status)) {
      throw new AlreadyDecidedError(row.status)
    }
  }

  return {
    get: (me: TActor, id: string) => readOne(db, me, id),

    /**
     * What waits for me, newest first; or, with a target, what waits on
     * that record whoever decides it.
     */
    list: async (
      me: TActor,
      query: TProposalListQuery
    ): Promise<TProposalPage> => {
      const onRecord = query.targetType && query.targetId
      if (onRecord && !isRecordId(query.targetId ?? '')) {
        return { items: [], nextCursor: null, total: 0 }
      }
      const matches = and(
        inArray(proposal.status, WAITING),
        query.targetType && query.targetId
          ? and(
              eq(proposal.targetType, query.targetType),
              eq(proposal.targetId, query.targetId)
            )
          : eq(proposal.approverId, me.id)
      )
      // Ids sort by creation time, so the id alone pages newest first.
      const after = decodeCursor(query.cursor)
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(proposal)
          .where(
            and(
              matches,
              after && isRecordId(after.id)
                ? lt(proposal.id, after.id)
                : undefined
            )
          )
          .orderBy(desc(proposal.id))
          .limit(query.limit + 1),
        db.select({ total: count() }).from(proposal).where(matches)
      ])
      const hasMore = rows.length > query.limit
      const shown = hasMore ? rows.slice(0, query.limit) : rows
      const last = shown.at(-1)
      return {
        items: await describe(db, shown, me),
        nextCursor: hasMore && last ? encodeCursor(null, last.id) : null,
        total
      }
    },

    /**
     * A person's AI proposes a change, as that person. Refused if they
     * couldn't make the change by hand. The old values are read here, not
     * taken from the AI.
     */
    create: async (me: TActor, input: TProposalCreate): Promise<TProposal> => {
      const data = proposalCreateSchema.parse(input)
      if (data.kind === 'email_draft') {
        throw new InvalidChangeError('AI can’t propose email drafts yet.')
      }
      const type = recordTypeOf(data.targetType)
      const { word } = RECORDS[type]
      const shared = {
        kind: data.kind,
        targetType: type,
        title: data.title,
        why: data.why ?? null,
        sources: data.sources,
        requestedById: me.id,
        approverId: me.id,
        engine: data.engine
      }

      const id = await db.transaction(async (tx) => {
        if (data.kind === 'create') {
          if (data.targetId) {
            throw new InvalidChangeError('A new record has no id yet.')
          }
          const values = checkValues(type, 'create', data.changes)
          await assertReferences(tx, me, values)
          const [made] = await tx
            .insert(proposal)
            .values({
              ...shared,
              changes: Object.entries(values)
                .filter(([, to]) => to !== null)
                .map(([field, to]) => ({ field, from: null, to }))
            })
            .returning({ id: proposal.id })
          return made.id
        }

        if (!data.targetId) {
          throw new InvalidChangeError(`Say which ${word} to change.`)
        }
        const target = await loadTarget(tx, type, data.targetId)
        if (!target.mayEdit(me)) throw new NotAllowedError(NOT_ALLOWED(word))
        if (target.archivedAt) {
          throw new InvalidChangeError(`Restore this ${word} to change it.`)
        }
        if (
          data.baseVersion !== undefined &&
          data.baseVersion !== target.version
        ) {
          throw new ChangedSinceError()
        }

        let changes: TFieldChange[] = []
        if (data.kind === 'update') {
          const values = checkValues(type, 'update', data.changes)
          await assertReferences(tx, me, values)
          changes = Object.entries(values)
            .filter(([field, to]) => (target.values[field] ?? null) !== to)
            .map(([field, to]) => ({
              field,
              from: target.values[field] ?? null,
              to
            }))
          if (changes.length === 0) {
            throw new InvalidChangeError(
              'That’s already how it is. There’s nothing to change.'
            )
          }
        }
        const [made] = await tx
          .insert(proposal)
          .values({
            ...shared,
            targetId: target.id,
            baseVersion: target.version,
            changes
          })
          .returning({ id: proposal.id })
        return made.id
      })
      return readOne(db, me, id)
    },

    /**
     * Applies the change as the person approving it: their role is checked
     * again, and the record's version. If the record changed since, nothing
     * is saved, the proposal goes out of date and the answer says so with
     * the current values. Sending `version` (the one they've now seen)
     * applies it anyway.
     */
    approve: (
      me: TActor,
      id: string,
      input: TProposalApprove = {}
    ): Promise<{
      outcome: 'approved' | 'changed_since'
      proposal: TProposal
    }> =>
      db.transaction(async (tx) => {
        const data = proposalApproveSchema.parse(input)
        const row = await lock(tx, id)
        if (row.approverId !== me.id) throw new NotYoursError()
        assertWaiting(row)
        const type = recordTypeOf(row.targetType)
        const { plural } = RECORDS[type]

        // The proposed values, with any the person edited first.
        const proposed = row.changes.map((change) => ({
          field: change.field,
          to: change.to as TProposalValue
        }))
        for (const edit of data.changes ?? []) {
          const found = proposed.find((change) => change.field === edit.field)
          if (!found) {
            throw new InvalidChangeError(
              `“${edit.field}” isn’t part of this proposal.`
            )
          }
          found.to = edit.to
        }

        const records = recordsIn(tx)
        const actor: TActor = { ...me, via: 'ai_proposal', proposalId: row.id }
        const version = data.version ?? row.baseVersion ?? 1
        const before = row.targetId
          ? await loadTarget(tx, type, row.targetId)
          : null
        let targetId = row.targetId
        try {
          if (row.kind === 'create') {
            const values = checkValues(type, 'create', proposed)
            const made = await records[plural].create(actor, values as never)
            targetId = made.id
          } else if (row.kind === 'update' && targetId) {
            const values = checkValues(type, 'update', proposed)
            await records[plural].update(actor, targetId, {
              ...values,
              version
            } as never)
          } else if (row.kind === 'archive' && targetId) {
            await records[plural].archive(actor, targetId, version)
          } else {
            throw new InvalidChangeError('This proposal can’t be applied.')
          }
        } catch (error) {
          if (error instanceof ChangedSinceError) {
            await tx
              .update(proposal)
              .set({ status: 'out_of_date' })
              .where(eq(proposal.id, row.id))
            return {
              outcome: 'changed_since' as const,
              proposal: await readOne(tx, me, row.id)
            }
          }
          if (error instanceof z.ZodError) {
            throw new InvalidChangeError(firstProblem(error))
          }
          throw error
        }

        // What really changed, including what followed from it (closing a
        // deal sets its close date): that's what Undo puts back.
        const after = await loadTarget(tx, type, targetId as string)
        const order = [
          ...proposed.map((change) => change.field),
          ...PROPOSAL_FIELDS[type]
        ]
        const applied: TFieldChange[] =
          row.kind === 'archive'
            ? []
            : [...new Set(order)]
                .map((field) => ({
                  field,
                  from: before?.values[field] ?? null,
                  to: after.values[field] ?? null
                }))
                .filter((change) => change.from !== change.to)

        const decidedAt = now()
        await tx
          .update(proposal)
          .set({
            status: 'approved',
            targetId,
            baseVersion: after.version,
            changes: applied,
            decidedById: me.id,
            decidedAt,
            undoUntil: new Date(decidedAt.getTime() + undoMs)
          })
          .where(eq(proposal.id, row.id))
        return {
          outcome: 'approved' as const,
          proposal: await readOne(tx, me, row.id)
        }
      }),

    /** Says no. The reason is kept for the AI to learn from. */
    decline: (
      me: TActor,
      id: string,
      input: TProposalDecline = {}
    ): Promise<TProposal> =>
      db.transaction(async (tx) => {
        const data = proposalDeclineSchema.parse(input)
        const row = await lock(tx, id)
        // Whoever decides it, or the person whose AI asked, taking it back.
        if (row.approverId !== me.id && row.requestedById !== me.id) {
          throw new NotYoursError()
        }
        assertWaiting(row)
        await tx
          .update(proposal)
          .set({
            status: 'declined',
            decidedById: me.id,
            decidedAt: now(),
            declineReason: data.reason ?? null
          })
          .where(eq(proposal.id, row.id))
        return readOne(tx, me, row.id)
      }),

    /**
     * Puts an approved change back, for a short time after approving it and
     * only while the record still says what the proposal set.
     */
    undo: (me: TActor, id: string): Promise<TProposal> =>
      db.transaction(async (tx) => {
        const row = await lock(tx, id)
        if (row.decidedById !== me.id) throw new NotYoursError()
        if (row.status !== 'approved') throw new AlreadyDecidedError(row.status)
        if (!row.undoUntil || now() > row.undoUntil) {
          throw new UndoExpiredError()
        }
        const type = recordTypeOf(row.targetType)
        const { plural } = RECORDS[type]
        const target = await loadTarget(tx, type, row.targetId ?? '')
        const records = recordsIn(tx)
        // A person undoing it: their change, tied to the proposal.
        const actor: TActor = { ...me, via: 'app', proposalId: row.id }

        try {
          if (row.kind === 'update') {
            const stillAsSet = row.changes.every(
              (change) => (target.values[change.field] ?? null) === change.to
            )
            if (!stillAsSet) throw new UndoConflictError()
            if (row.changes.length > 0) {
              await records[plural].update(actor, target.id, {
                ...Object.fromEntries(
                  row.changes.map((change) => [change.field, change.from])
                ),
                version: target.version
              } as never)
            }
          } else if (row.kind === 'create') {
            if (target.version !== row.baseVersion) {
              throw new UndoConflictError()
            }
            await records[plural].archive(actor, target.id, target.version)
          } else if (row.kind === 'archive') {
            if (target.version !== row.baseVersion) {
              throw new UndoConflictError()
            }
            await records[plural].restore(actor, target.id, target.version)
          }
        } catch (error) {
          if (error instanceof ChangedSinceError) throw new UndoConflictError()
          throw error
        }

        await tx
          .update(proposal)
          .set({ status: 'undone' })
          .where(eq(proposal.id, row.id))
        return readOne(tx, me, row.id)
      }),

    /**
     * Hands the decision to whoever owns the record, for when the person
     * whose AI proposed it can no longer make the change themselves.
     */
    sendToOwner: (me: TActor, id: string): Promise<TProposal> =>
      db.transaction(async (tx) => {
        const row = await lock(tx, id)
        if (row.approverId !== me.id && row.requestedById !== me.id) {
          throw new NotYoursError()
        }
        assertWaiting(row)
        const type = recordTypeOf(row.targetType)

        let ownerId: string | null
        if (row.targetId) {
          ownerId = (await loadTarget(tx, type, row.targetId)).ownerId
        } else {
          // A new person or deal goes to the owner of the company it's for.
          const companyId = row.changes.find(
            (change) => change.field === 'companyId'
          )?.to
          const [found] =
            typeof companyId === 'string' && isRecordId(companyId)
              ? await tx
                  .select({ ownerId: company.ownerId })
                  .from(company)
                  .where(eq(company.id, companyId))
              : []
          ownerId = found?.ownerId ?? null
        }
        if (!ownerId) {
          throw new InvalidChangeError('There’s no owner to send this to.')
        }
        if (ownerId === row.approverId) {
          throw new InvalidChangeError('It’s already waiting for the owner.')
        }
        await tx
          .update(proposal)
          .set({ approverId: ownerId, status: 'pending' })
          .where(eq(proposal.id, row.id))
        return readOne(tx, me, row.id)
      })
  }
}

export type TProposalsService = ReturnType<typeof createProposalsService>
