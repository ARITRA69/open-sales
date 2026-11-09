import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  pgTable,
  text,
  timestamp,
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
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    check(
      'user_role_check',
      sql`${table.role} in ('admin', 'manager', 'member')`
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
