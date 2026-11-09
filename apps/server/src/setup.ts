import type {
  TSetupRequest,
  TSetupStatus,
  TSignedInResponse
} from '@open-sales/shared'
import { sessionUserSchema } from '@open-sales/shared'
import { count, sql } from 'drizzle-orm'

import type { TAuth } from './auth'
import type { TDatabase } from './db/client'
import { user, workspace } from './db/schema'

// Any fixed number; every server copy takes the same lock during setup.
const SETUP_LOCK_ID = 7_020_301

export class SetupAlreadyDoneError extends Error {
  constructor() {
    super('This server is already set up.')
  }
}

export type TSetupService = {
  getStatus: () => Promise<TSetupStatus>
  // Throws SetupAlreadyDoneError once anyone has an account.
  run: (input: TSetupRequest) => Promise<TSignedInResponse>
}

/** First-run setup: the first person creates the workspace and becomes admin. */
export const createSetupService = (
  db: TDatabase,
  auth: TAuth
): TSetupService => ({
  getStatus: async () => {
    const [{ total }] = await db.select({ total: count() }).from(user)
    const [current] = await db
      .select({ name: workspace.name })
      .from(workspace)
      .limit(1)

    return { needsSetup: total === 0, workspaceName: current?.name ?? null }
  },

  run: (input) =>
    db.transaction(async (tx) => {
      // Held until this transaction ends, so two setups can't both pass the
      // "no users yet" check.
      await tx.execute(sql`select pg_advisory_xact_lock(${SETUP_LOCK_ID})`)

      const [{ total }] = await tx.select({ total: count() }).from(user)
      if (total > 0) throw new SetupAlreadyDoneError()

      // The user.create hook in auth.ts makes this first user an active admin.
      await auth.api.signUpEmail({
        body: { name: input.name, email: input.email, password: input.password }
      })
      await tx.insert(workspace).values({ name: input.workspaceName })

      const signedIn = await auth.api.signInEmail({
        body: { email: input.email, password: input.password }
      })
      return {
        token: signedIn.token,
        user: sessionUserSchema.parse(signedIn.user)
      }
    })
})
