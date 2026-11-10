import { sessionUserSchema } from '@open-sales/shared'

import packageJson from '../package.json'
import { createApp } from './app'
import { createAuth } from './auth'
import { createDatabase } from './db/client'
import { runMigrations } from './db/migrate'
import { readEnv } from './env'
import { createProposalsService } from './proposals/service'
import { createRecordsService } from './records/routes'
import { resolveAuthSecret } from './secret'
import { createSetupService } from './setup'
import { createTeamService } from './team'

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

const auth = createAuth({
  db,
  secret: await resolveAuthSecret(db, env.AUTH_SECRET),
  baseURL: env.PUBLIC_URL ?? `http://localhost:${env.PORT}`
})

const app = createApp({
  version: packageJson.version,
  isDatabaseReachable: isReachable,
  handleAuth: auth.handler,
  getSessionUser: async (headers) => {
    const found = await auth.api.getSession({ headers })
    const parsed = sessionUserSchema.safeParse(found?.user)
    return parsed.success ? parsed.data : null
  },
  setup: createSetupService(db, auth),
  team: createTeamService(db, auth),
  records: createRecordsService(db),
  proposals: createProposalsService(db),
  publicUrl: env.PUBLIC_URL,
  appScheme: env.APP_URL_SCHEME
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
