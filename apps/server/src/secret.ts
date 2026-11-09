import { randomBytes } from 'node:crypto'

import { eq } from 'drizzle-orm'

import type { TDatabase } from './db/client'
import { instanceSetting } from './db/schema'

const SECRET_KEY = 'auth_secret'

/**
 * The secret Better Auth signs sessions with. AUTH_SECRET wins if it's set;
 * otherwise the server makes one on first start and keeps it in the database,
 * so a self-hoster never runs with a guessable default and sessions survive
 * restarts.
 */
export const resolveAuthSecret = async (
  db: TDatabase,
  fromEnv: string | undefined
): Promise<string> => {
  if (fromEnv) return fromEnv

  await db
    .insert(instanceSetting)
    .values({ key: SECRET_KEY, value: randomBytes(32).toString('base64url') })
    // Two server copies starting at once both keep the first one written.
    .onConflictDoNothing()

  const [stored] = await db
    .select({ value: instanceSetting.value })
    .from(instanceSetting)
    .where(eq(instanceSetting.key, SECRET_KEY))

  return stored.value
}
