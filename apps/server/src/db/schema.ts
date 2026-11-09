import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core'

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow()
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())

/** The one workspace this server runs. The first-run setup creates it. */
export const workspace = pgTable('workspace', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
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
    id: uuid()
      .primaryKey()
      .$defaultFn(() => Bun.randomUUIDv7()),
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
    id: uuid()
      .primaryKey()
      .$defaultFn(() => Bun.randomUUIDv7()),
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
