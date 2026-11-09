import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

// How long the health check waits for the database before calling it down.
const REACHABLE_TIMEOUT_MS = 2000

/** Connects to Postgres. `sql` is the raw connection, closed on shutdown. */
export const createDatabase = (databaseUrl: string) => {
  const sql = postgres(databaseUrl, {
    max: 10,
    // Give up on a connection attempt instead of waiting the default 30s.
    connect_timeout: 5,
    // Postgres notices ("already exists, skipping") aren't problems; keep them
    // out of the logs.
    onnotice: () => {}
  })
  const db = drizzle(sql, { schema, casing: 'snake_case' })

  const isReachable = async () => {
    const query = sql`select 1`
    const timer = setTimeout(() => query.cancel(), REACHABLE_TIMEOUT_MS)
    try {
      await query
      return true
    } catch {
      return false
    } finally {
      clearTimeout(timer)
    }
  }

  return { db, sql, isReachable }
}

export type TDatabase = ReturnType<typeof createDatabase>['db']
