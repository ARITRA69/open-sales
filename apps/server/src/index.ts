import packageJson from '../package.json'
import { createApp } from './app'
import { createDatabase } from './db/client'
import { runMigrations } from './db/migrate'
import { readEnv } from './env'

const env = readEnv(process.env)
const { db, sql, isReachable } = createDatabase(env.DATABASE_URL)

try {
  await runMigrations(db)
  console.log('Database is up to date.')
} catch (error) {
  // Docker restarts the server, so it tries again once the database is up.
  const reason = error instanceof Error ? (error.cause ?? error) : error
  console.error('Could not update the database. Is it running?', reason)
  process.exit(1)
}

const app = createApp({
  version: packageJson.version,
  isDatabaseReachable: isReachable
})
const server = Bun.serve({ port: env.PORT, fetch: app.fetch })
console.log(`Server listening on ${server.url}`)

// Docker sends SIGTERM on stop: finish open requests, then close the database.
const shutDown = async () => {
  await server.stop()
  await sql.end({ timeout: 5 })
  process.exit(0)
}
process.on('SIGTERM', shutDown)
process.on('SIGINT', shutDown)
