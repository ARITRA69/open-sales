import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/** The one workspace this server runs. The first-run setup creates it. */
export const workspace = pgTable('workspace', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
})
