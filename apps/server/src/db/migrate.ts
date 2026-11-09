import { fileURLToPath } from 'node:url'

import { migrate } from 'drizzle-orm/postgres-js/migrator'

import type { TDatabase } from './client'

const MIGRATIONS_FOLDER = fileURLToPath(
  new URL('../../drizzle', import.meta.url)
)

/**
 * Applies any migrations the database hasn't had yet. Runs on every start, so
 * self-hosters upgrade by pulling a new image and restarting.
 */
export const runMigrations = (db: TDatabase) =>
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
