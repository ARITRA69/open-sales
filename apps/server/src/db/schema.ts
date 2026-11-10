import { sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import {
  bigint,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core'

import { newId } from './ids'

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow()
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())
const archivedAt = () => timestamp({ withTimezone: true })
// UUIDv7: sorts by creation time, so new rows land at the end of an index.
const id = () => uuid().primaryKey().$defaultFn(newId)
// Bumped on every write: stops two people (or a stale AI proposal)
// overwriting each other. See "Versions" in docs/data-model.md.
const version = () => integer().notNull().default(1)
const customFields = () =>
  jsonb().$type<Record<string, unknown>>().notNull().default({})

/** The one workspace this server runs. The first-run setup creates it. */
export const workspace = pgTable('workspace', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  // The default for new deals, ISO 4217.
  currency: char({ length: 3 }).notNull().default('USD'),
  // IANA name, for "due today" and report weeks.
  timeZone: text().notNull().default('UTC'),
  createdAt: createdAt()
})

/** Values the server keeps for itself, such as its generated auth secret. */
export const instanceSetting = pgTable('instance_setting', {
  key: text().primaryKey(),
  value: text().notNull(),
  createdAt: createdAt()
})

/*
 * Better Auth's tables. Field names follow its models (see better-auth's
 * docs); Drizzle stores them snake_case. `role` is ours: see ROLES in
 * packages/shared.
 */

export const user = pgTable(
  'user',
  {
    id: text().primaryKey(),
    name: text().notNull(),
    email: text().notNull().unique(),
    emailVerified: boolean().notNull().default(false),
    image: text(),
    role: text().notNull().default('member'),
    // Whether they can sign in. See USER_STATUSES in packages/shared.
    status: text().notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    check(
      'user_role_check',
      sql`${table.role} in ('admin', 'manager', 'member')`
    ),
    check(
      'user_status_check',
      sql`${table.status} in ('active', 'pending', 'declined', 'deactivated')`
    )
  ]
)

export const session = pgTable('session', {
  id: text().primaryKey(),
  token: text().notNull().unique(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  ipAddress: text(),
  userAgent: text(),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
  updatedAt: updatedAt()
})

export const account = pgTable('account', {
  id: text().primaryKey(),
  accountId: text().notNull(),
  providerId: text().notNull(),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text(),
  refreshToken: text(),
  idToken: text(),
  accessTokenExpiresAt: timestamp({ withTimezone: true }),
  refreshTokenExpiresAt: timestamp({ withTimezone: true }),
  scope: text(),
  // A password hash, for email and password sign-in.
  password: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt()
})

export const verification = pgTable('verification', {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt()
})

/*
 * The team's join link: one shared link anyone on the team can use. Only one
 * is live at a time (the rest have `revoked_at`). The token is kept as is, so
 * an admin can copy the link again; it only lets someone ask to join, and
 * only people at `allowed_domain` get in without approval.
 */
export const joinLink = pgTable(
  'join_link',
  {
    id: uuid().primaryKey().$defaultFn(newId),
    token: text().notNull().unique(),
    // People with an email here join straight away, e.g. "acme.com".
    allowedDomain: text(),
    role: text().notNull().default('member'),
    createdById: text()
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
    revokedAt: timestamp({ withTimezone: true })
  },
  (table) => [
    check('join_link_role_check', sql`${table.role} = 'member'`),
    index('join_link_created_by_idx').on(table.createdById),
    index('join_link_live_idx')
      .on(table.createdAt)
      .where(sql`${table.revokedAt} is null`)
  ]
)

/**
 * Someone who joined with the link and waits for approval. The app holds the
 * ticket (hashed here) to ask whether they've been let in.
 */
export const joinRequest = pgTable(
  'join_request',
  {
    id: uuid().primaryKey().$defaultFn(newId),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    joinLinkId: uuid()
      .notNull()
      .references(() => joinLink.id),
    ticketHash: text().notNull(),
    createdAt: createdAt(),
    decidedAt: timestamp({ withTimezone: true }),
    decidedById: text().references(() => user.id)
  },
  (table) => [
    uniqueIndex('join_request_user_idx').on(table.userId),
    uniqueIndex('join_request_ticket_idx').on(table.ticketHash),
    index('join_request_link_idx').on(table.joinLinkId),
    index('join_request_decided_by_idx').on(table.decidedById)
  ]
)

/*
 * Sales records. The design, and the query each index serves, is in
 * docs/data-model.md. Lists page by keyset, so list indexes end with `id`.
 * References to `user` aren't indexed unless a list needs them: people are
 * deactivated, never deleted.
 */

export const stageKind = pgEnum('stage_kind', ['open', 'won', 'lost'])
export const dealStatus = pgEnum('deal_status', ['open', 'won', 'lost'])
export const dealKind = pgEnum('deal_kind', ['new', 'renewal'])
export const dealPersonRole = pgEnum('deal_person_role', [
  'champion',
  'decision_maker',
  'evaluator',
  'blocker'
])

/** One row ("Sales") for now; several pipelines come later. */
export const pipeline = pgTable(
  'pipeline',
  {
    id: id(),
    name: text().notNull(),
    position: integer().notNull().default(0),
    isDefault: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    // Exactly one default pipeline.
    uniqueIndex('pipeline_default_idx')
      .on(table.isDefault)
      .where(sql`${table.isDefault}`)
  ]
)

export const stage = pgTable(
  'stage',
  {
    id: id(),
    pipelineId: uuid()
      .notNull()
      .references(() => pipeline.id),
    name: text().notNull(),
    // Not unique: reordering rewrites positions in one transaction.
    position: integer().notNull(),
    kind: stageKind().notNull().default('open'),
    winProbability: smallint().notNull().default(0),
    // Null means a deal here never counts as stalled.
    stalledAfterDays: integer(),
    // Plain words the AI reads: what this stage is for, and what moves a
    // deal on ("Pricing sent and budget confirmed").
    goal: text(),
    exitCriteria: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt()
  },
  (table) => [
    check(
      'stage_win_probability_check',
      sql`${table.winProbability} between 0 and 100`
    ),
    index('stage_pipeline_position_idx').on(table.pipelineId, table.position),
    // Won and Lost exist once per pipeline.
    uniqueIndex('stage_pipeline_closed_kind_idx')
      .on(table.pipelineId, table.kind)
      .where(sql`${table.kind} in ('won', 'lost')`)
  ]
)

/** The choices shown when a deal is closed as lost. */
export const lostReason = pgTable('lost_reason', {
  id: id(),
  label: text().notNull(),
  position: integer().notNull(),
  createdAt: createdAt(),
  archivedAt: archivedAt()
})

/** The companies we sell to: "Accounts" in the app. */
export const company = pgTable(
  'company',
  {
    id: id(),
    name: text().notNull(),
    // "halden.com": lower case, no www. Matches imports and email senders.
    domain: text(),
    // Exactly one owner, who (with managers and admins) may change it.
    ownerId: text()
      .notNull()
      .references(() => user.id),
    industry: text(),
    description: text(),
    customFields: customFields(),
    // manual, import, lead, email …
    source: text().notNull().default('manual'),
    // Copied from the newest activity; sorts lists and finds quiet accounts.
    lastActivityAt: timestamp({ withTimezone: true }),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt()
  },
  (table) => [
    index('company_owner_name_idx')
      .on(table.ownerId, table.name, table.id)
      .where(sql`${table.archivedAt} is null`),
    index('company_name_idx')
      .on(table.name, table.id)
      .where(sql`${table.archivedAt} is null`),
    index('company_last_activity_idx')
      .on(table.lastActivityAt.desc(), table.id)
      .where(sql`${table.archivedAt} is null`),
    // One company per domain: the duplicate check for imports and leads.
    uniqueIndex('company_domain_idx')
      .on(table.domain)
      .where(sql`${table.domain} is not null and ${table.archivedAt} is null`),
    index('company_name_search_idx').using(
      'gin',
      sql`${table.name} gin_trgm_ops`
    ),
    index('company_custom_fields_idx').using(
      'gin',
      sql`${table.customFields} jsonb_path_ops`
    )
  ]
)

/** Contacts. Everyone works somewhere, so a person always has a company. */
export const person = pgTable(
  'person',
  {
    id: id(),
    companyId: uuid()
      .notNull()
      .references(() => company.id),
    // One field: people's names don't split cleanly.
    name: text().notNull(),
    title: text(),
    // Stored lower case.
    email: text(),
    phone: text(),
    linkedinUrl: text(),
    customFields: customFields(),
    source: text().notNull().default('manual'),
    lastActivityAt: timestamp({ withTimezone: true }),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt()
  },
  (table) => [
    // A company's People tab. Not partial, so it also serves the foreign key.
    index('person_company_name_idx').on(table.companyId, table.name, table.id),
    // Everyone's People list, A–Z.
    index('person_name_idx')
      .on(table.name, table.id)
      .where(sql`${table.archivedAt} is null`),
    // Duplicates, and matching email senders to people.
    uniqueIndex('person_email_idx')
      .on(table.email)
      .where(sql`${table.email} is not null and ${table.archivedAt} is null`),
    index('person_name_search_idx').using(
      'gin',
      sql`${table.name} gin_trgm_ops`
    ),
    index('person_email_search_idx').using(
      'gin',
      sql`${table.email} gin_trgm_ops`
    ),
    index('person_custom_fields_idx').using(
      'gin',
      sql`${table.customFields} jsonb_path_ops`
    )
  ]
)

export const deal = pgTable(
  'deal',
  {
    id: id(),
    companyId: uuid()
      .notNull()
      .references(() => company.id),
    name: text().notNull(),
    // Starts as the company's owner.
    ownerId: text()
      .notNull()
      .references(() => user.id),
    pipelineId: uuid()
      .notNull()
      .references(() => pipeline.id),
    stageId: uuid()
      .notNull()
      .references(() => stage.id),
    // Copied from the stage's kind, in the same transaction as the move.
    status: dealStatus().notNull().default('open'),
    // Minor units (cents). Null until known.
    valueMinor: bigint({ mode: 'number' }),
    currency: char({ length: 3 }).notNull(),
    // Expected while open; the actual day once closed.
    closeDate: date({ mode: 'string' }),
    nextStep: text(),
    // Copied; drives "idle 12 days" and deals needing a nudge.
    stageEnteredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp({ withTimezone: true }),
    lostReasonId: uuid().references(() => lostReason.id),
    lostNote: text(),
    kind: dealKind().notNull().default('new'),
    // The contract a renewal deal renews. See `contract`, under renewals.
    contractId: uuid().references((): AnyPgColumn => contract.id),
    customFields: customFields(),
    source: text().notNull().default('manual'),
    lastActivityAt: timestamp({ withTimezone: true }),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt()
  },
  (table) => [
    check(
      'deal_value_check',
      sql`${table.valueMinor} is null or ${table.valueMinor} >= 0`
    ),
    // The board, column by column, with each column's count and value.
    index('deal_board_idx')
      .on(
        table.pipelineId,
        table.stageId,
        table.lastActivityAt.desc(),
        table.id
      )
      .where(sql`${table.status} = 'open' and ${table.archivedAt} is null`),
    // "My deals" and the forecast.
    index('deal_owner_status_idx')
      .on(table.ownerId, table.status, table.closeDate)
      .where(sql`${table.archivedAt} is null`),
    // A company's Deals tab. Not partial, so it also serves the foreign key.
    index('deal_company_status_idx').on(table.companyId, table.status),
    // Forecast by month, "closing this month".
    index('deal_close_date_idx')
      .on(table.closeDate)
      .where(sql`${table.status} = 'open' and ${table.archivedAt} is null`),
    // Deals needing a nudge.
    index('deal_stage_entered_idx')
      .on(table.stageEnteredAt)
      .where(sql`${table.status} = 'open' and ${table.archivedAt} is null`),
    // Won and lost reports by period.
    index('deal_closed_at_idx')
      .on(table.closedAt)
      .where(sql`${table.status} in ('won', 'lost')`),
    index('deal_stage_idx').on(table.stageId),
    index('deal_lost_reason_idx')
      .on(table.lostReasonId)
      .where(sql`${table.status} = 'lost'`),
    index('deal_name_search_idx').using('gin', sql`${table.name} gin_trgm_ops`),
    index('deal_custom_fields_idx').using(
      'gin',
      sql`${table.customFields} jsonb_path_ops`
    ),
    // A contract's renewal deals, newest last.
    index('deal_contract_idx')
      .on(table.contractId, table.id)
      .where(sql`${table.contractId} is not null`)
  ]
)

/** The buying committee: who's involved in a deal, and how. */
export const dealPerson = pgTable(
  'deal_person',
  {
    dealId: uuid()
      .notNull()
      .references(() => deal.id, { onDelete: 'cascade' }),
    personId: uuid()
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    role: dealPersonRole(),
    createdAt: createdAt()
  },
  (table) => [
    primaryKey({ columns: [table.dealId, table.personId] }),
    index('deal_person_person_idx').on(table.personId)
  ]
)

/** Every stage move, for conversion between stages and time in stage. */
export const dealStageChange = pgTable(
  'deal_stage_change',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    dealId: uuid()
      .notNull()
      .references(() => deal.id, { onDelete: 'cascade' }),
    // Null when the deal was created.
    fromStageId: uuid().references(() => stage.id),
    toStageId: uuid()
      .notNull()
      .references(() => stage.id),
    changedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    changedById: text().references(() => user.id)
  },
  (table) => [
    index('deal_stage_change_deal_idx').on(table.dealId, table.changedAt),
    // "How many reached Proposal this quarter".
    index('deal_stage_change_to_idx').on(table.toStageId, table.changedAt),
    index('deal_stage_change_from_idx').on(table.fromStageId)
  ]
)

export const changeVia = pgEnum('change_via', [
  'app',
  'ai_proposal',
  'import',
  'api',
  'system'
])
export const changeRecordType = pgEnum('change_record_type', [
  'company',
  'person',
  'deal',
  'pipeline',
  'stage',
  'lost_reason',
  'user',
  'workspace',
  'task',
  'activity',
  'lead',
  'contract',
  'playbook'
])
export const changeAction = pgEnum('change_action', [
  'create',
  'update',
  'archive',
  'restore',
  'purge'
])

/** One field's change: `{ field, from, to }`. */
export type TFieldChange = { field: string; from: unknown; to: unknown }

/** Every write, by anyone or anything. Append-only. */
export const changeLog = pgTable(
  'change_log',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // Null for the system.
    actorId: text().references(() => user.id),
    via: changeVia().notNull(),
    recordType: changeRecordType().notNull(),
    // Text, since user ids aren't uuids.
    recordId: text().notNull(),
    action: changeAction().notNull(),
    changes: jsonb().$type<TFieldChange[]>().notNull().default([]),
    // Set when an approved proposal made the change: "AI, approved by Asha".
    proposalId: uuid().references(() => proposal.id)
  },
  (table) => [
    // Field changes on a record's timeline.
    index('change_log_record_idx').on(
      table.recordType,
      table.recordId,
      table.id.desc()
    ),
    index('change_log_actor_idx').on(table.actorId, table.id.desc()),
    // The audit log by date: tiny, and fine for append-only rows.
    index('change_log_occurred_idx').using('brin', table.occurredAt),
    index('change_log_proposal_idx')
      .on(table.proposalId)
      .where(sql`${table.proposalId} is not null`)
  ]
)

// proposals

export const proposalKind = pgEnum('proposal_kind', [
  'update',
  'create',
  'archive',
  'email_draft'
])
export const proposalStatus = pgEnum('proposal_status', [
  'pending',
  'approved',
  'declined',
  'out_of_date',
  'undone'
])
export const proposalTargetType = pgEnum('proposal_target_type', [
  'company',
  'person',
  'deal',
  'task',
  'activity'
])
export const aiEngine = pgEnum('ai_engine', ['claude-code', 'codex'])

/** The email, note or record a proposal came from. */
export type TProposalSourceRef = { type: string; id: string; label?: string }

/**
 * A change AI wants to make, waiting for a person to say yes: the heart of
 * approve-first AI. See "The proposal lifecycle" in docs/user-flows.md.
 */
export const proposal = pgTable(
  'proposal',
  {
    id: id(),
    kind: proposalKind().notNull(),
    status: proposalStatus().notNull().default('pending'),
    targetType: proposalTargetType().notNull(),
    // Null for a new record, until approving it makes one.
    targetId: uuid(),
    // The target's version when proposed: the "Changed since" check.
    baseVersion: integer(),
    // Each field's old and new value. A new record's fields have no old one.
    changes: jsonb().$type<TFieldChange[]>().notNull().default([]),
    title: text().notNull(),
    // The one-line reason shown on the card.
    why: text(),
    sources: jsonb().$type<TProposalSourceRef[]>().notNull().default([]),
    // Whose AI made it.
    requestedById: text()
      .notNull()
      .references(() => user.id),
    // Who decides: the requester, or the owner on "send to owner".
    approverId: text()
      .notNull()
      .references(() => user.id),
    engine: aiEngine().notNull(),
    decidedById: text().references(() => user.id),
    decidedAt: timestamp({ withTimezone: true }),
    declineReason: text(),
    // Set on approve: until when it can be undone.
    undoUntil: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    // "Waiting for you" and the sidebar count: the busiest query in the app.
    // Out-of-date proposals wait for the person too.
    index('proposal_waiting_idx')
      .on(table.approverId, table.createdAt.desc(), table.id)
      .where(sql`${table.status} in ('pending', 'out_of_date')`),
    // What waits on a record.
    index('proposal_target_idx')
      .on(table.targetType, table.targetId)
      .where(sql`${table.status} in ('pending', 'out_of_date')`),
    // "What my AI did".
    index('proposal_requested_by_idx').on(
      table.requestedById,
      table.createdAt.desc()
    ),
    // Clearing out old declined proposals.
    index('proposal_status_idx').on(table.status, table.createdAt)
  ]
)

// timeline

export const activityType = pgEnum('activity_type', [
  'note',
  'call',
  'meeting',
  'email'
])
export const activitySource = pgEnum('activity_source', [
  'manual',
  'ai',
  'email_sync',
  'calendar_sync',
  'import'
])
export const taskSource = pgEnum('task_source', ['manual', 'ai'])

/** What only some kinds of activity have, such as how a call went. */
export type TActivityData = { outcome?: string }

/** Notes, calls, meetings and emails, in one stream. */
export const activity = pgTable(
  'activity',
  {
    id: id(),
    type: activityType().notNull(),
    // When it happened, or starts. Future values are "upcoming".
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // Meetings.
    endsAt: timestamp({ withTimezone: true }),
    // The timeline it belongs to. Null only for emails not yet matched.
    companyId: uuid().references(() => company.id),
    // Also shown on this deal.
    dealId: uuid().references(() => deal.id),
    // Who wrote or logged it; null for synced emails.
    authorId: text().references(() => user.id),
    source: activitySource().notNull().default('manual'),
    // Subject, meeting name, call summary.
    title: text(),
    // Note text, call notes; for emails, the plain-text body.
    body: text(),
    data: jsonb().$type<TActivityData>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt()
  },
  (table) => [
    // A company's timeline (and its upcoming items, read the other way).
    index('activity_company_idx')
      .on(table.companyId, table.occurredAt.desc(), table.id)
      .where(sql`${table.archivedAt} is null`),
    // A deal's timeline.
    index('activity_deal_idx')
      .on(table.dealId, table.occurredAt.desc(), table.id)
      .where(sql`${table.dealId} is not null and ${table.archivedAt} is null`),
    // Activity reports per person.
    index('activity_author_idx').on(table.authorId, table.occurredAt.desc())
  ]
)

/** Who an activity involved: the people on a call, a note's subject. */
export const activityPerson = pgTable(
  'activity_person',
  {
    activityId: uuid()
      .notNull()
      .references(() => activity.id, { onDelete: 'cascade' }),
    personId: uuid()
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' })
  },
  (table) => [
    primaryKey({ columns: [table.activityId, table.personId] }),
    // A person's timeline and "last contacted".
    index('activity_person_person_idx').on(table.personId, table.activityId)
  ]
)

export const task = pgTable(
  'task',
  {
    id: id(),
    title: text().notNull(),
    notes: text(),
    // Null means no date.
    dueOn: date({ mode: 'string' }),
    assigneeId: text()
      .notNull()
      .references(() => user.id),
    createdById: text()
      .notNull()
      .references(() => user.id),
    // What it's about. Any may be null.
    companyId: uuid().references(() => company.id),
    dealId: uuid().references(() => deal.id),
    personId: uuid().references(() => person.id),
    completedAt: timestamp({ withTimezone: true }),
    source: taskSource().notNull().default('manual'),
    // The proposal that created it. The reference joins it when the
    // proposal table exists.
    proposalId: uuid(),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt()
  },
  (table) => [
    // Today's follow-ups, due and overdue.
    index('task_assignee_due_idx')
      .on(table.assigneeId, table.dueOn, table.id)
      .where(sql`${table.completedAt} is null and ${table.archivedAt} is null`),
    // Not partial, so they also serve the foreign keys and finished tasks
    // on a record's timeline.
    index('task_company_idx').on(table.companyId),
    index('task_deal_idx').on(table.dealId),
    index('task_person_idx').on(table.personId)
  ]
)

// leads

export const leadStatus = pgEnum('lead_status', [
  'new',
  'qualified',
  'disqualified',
  'converted'
])

/**
 * The Leads inbox: people who've shown interest, until someone converts them
 * into a company, a person and perhaps a deal, or turns them away.
 */
export const lead = pgTable(
  'lead',
  {
    id: id(),
    name: text().notNull(),
    // Stored lower case, like a person's.
    email: text(),
    phone: text(),
    companyName: text(),
    title: text(),
    // What they wrote.
    message: text(),
    // manual, import, web_form, email
    source: text().notNull().default('manual'),
    status: leadStatus().notNull().default('new'),
    // Null until someone is given it, or takes it by working it.
    ownerId: text().references(() => user.id),
    // The AI's note on fit.
    fitNote: text(),
    disqualifiedReason: text(),
    // Set on convert. Plain ids, as the data model has them: a purged
    // record leaves the lead's history standing.
    convertedCompanyId: uuid(),
    convertedPersonId: uuid(),
    convertedDealId: uuid(),
    // The original row or form post.
    raw: jsonb().$type<Record<string, unknown>>(),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    // The inbox: new leads, newest first.
    index('lead_inbox_idx').on(table.status, table.createdAt.desc(), table.id),
    // "My leads".
    index('lead_owner_status_idx').on(table.ownerId, table.status),
    // Matching to existing people on convert.
    index('lead_email_idx').on(table.email)
  ]
)

// renewals

export const contractStatus = pgEnum('contract_status', [
  'active',
  'renewing',
  'renewed',
  'ended'
])

/**
 * What a renewal renews: started by a won deal, with the day it comes up
 * again. Its renewal deals point back with `deal.contract_id`. It follows
 * its company: no owner of its own, and no archive (it ends instead).
 */
export const contract = pgTable(
  'contract',
  {
    id: id(),
    companyId: uuid()
      .notNull()
      .references(() => company.id),
    // The won deal that started it. Null leaves room for imported contracts.
    dealId: uuid().references(() => deal.id),
    // Minor units (cents).
    valueMinor: bigint({ mode: 'number' }).notNull(),
    currency: char({ length: 3 }).notNull(),
    startsOn: date({ mode: 'string' }).notNull(),
    renewsOn: date({ mode: 'string' }).notNull(),
    status: contractStatus().notNull().default('active'),
    // Why it ended: the "won't renew" reason, or the lost renewal's.
    endReason: text(),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    check('contract_value_check', sql`${table.valueMinor} >= 0`),
    check('contract_dates_check', sql`${table.renewsOn} > ${table.startsOn}`),
    // Renewals in the next 30, 60 or 90 days, soonest first.
    index('contract_upcoming_idx')
      .on(table.renewsOn, table.id)
      .where(sql`${table.status} in ('active', 'renewing')`),
    index('contract_company_idx').on(table.companyId),
    // A won deal starts one contract.
    uniqueIndex('contract_deal_idx').on(table.dealId)
  ]
)

// playbooks

/** What a playbook asks before it runs. See playbookBlankSchema in packages/shared. */
export type TPlaybookBlankRow = {
  name: string
  question: string
  options: string[]
}

/**
 * A shared AI instruction the team runs on a record. What the AI is told
 * lives in `playbook_version`; this row says which version is in use and
 * whether the team can see it. The starters have no author.
 */
export const playbook = pgTable(
  'playbook',
  {
    id: id(),
    name: text().notNull(),
    // One line saying what it does.
    description: text(),
    // Null for the starters that ship with the product.
    authorId: text().references(() => user.id),
    // The newest version. Null only for the moment between making the
    // playbook and its first version, inside one transaction.
    currentVersionId: uuid().references((): AnyPgColumn => playbookVersion.id),
    // Null while it's a draft, which only its author, managers and admins see.
    publishedAt: timestamp({ withTimezone: true }),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt()
  },
  (table) => [
    // The library, A–Z.
    index('playbook_name_idx')
      .on(table.name, table.id)
      .where(sql`${table.archivedAt} is null`),
    index('playbook_current_version_idx').on(table.currentVersionId)
  ]
)

/** One saved edit of a playbook. Never changed, so a run can say which it used. */
export const playbookVersion = pgTable(
  'playbook_version',
  {
    id: id(),
    playbookId: uuid()
      .notNull()
      .references(() => playbook.id),
    // 1, 2, 3… within the playbook.
    version: integer().notNull(),
    // Plain words, with `{Name}` where a blank's answer goes.
    steps: text().notNull(),
    blanks: jsonb().$type<TPlaybookBlankRow[]>().notNull().default([]),
    // From PLAYBOOK_CHANGES in packages/shared: fields, tasks, email_drafts.
    allowedChanges: jsonb().$type<string[]>().notNull().default([]),
    // Null for the starters.
    createdById: text().references(() => user.id),
    createdAt: createdAt()
  },
  (table) => [
    // Also serves the foreign key.
    uniqueIndex('playbook_version_playbook_version_idx').on(
      table.playbookId,
      table.version
    )
  ]
)
