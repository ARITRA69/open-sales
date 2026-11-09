import { MIN_PASSWORD_LENGTH } from '@open-sales/shared'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { bearer } from 'better-auth/plugins'
import { count } from 'drizzle-orm'

import type { TDatabase } from './db/client'
import { account, session, user, verification } from './db/schema'

export const AUTH_BASE_PATH = '/api/v1/auth'

type TCreateAuthArgs = {
  db: TDatabase
  secret: string
  // Where the server is reached, e.g. http://localhost:8787.
  baseURL: string
}

/**
 * Better Auth: email and password sign-in and sessions. The desktop app signs
 * in from its main process and sends the token back as `Authorization:
 * Bearer`, which the bearer plugin accepts in place of a cookie.
 */
export const createAuth = ({ db, secret, baseURL }: TCreateAuthArgs) =>
  betterAuth({
    basePath: AUTH_BASE_PATH,
    baseURL,
    secret,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user, session, account, verification }
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      autoSignIn: true
    },
    user: {
      additionalFields: {
        // Clients can't set their own role (input: false). See ROLES.
        role: {
          type: 'string',
          required: false,
          defaultValue: 'member',
          input: false
        }
      }
    },
    databaseHooks: {
      user: {
        create: {
          // The first person on a new server runs it.
          before: async (newUser) => {
            const [{ total }] = await db.select({ total: count() }).from(user)
            return {
              data: { ...newUser, role: total === 0 ? 'admin' : 'member' }
            }
          }
        }
      }
    },
    plugins: [bearer()]
  })

export type TAuth = ReturnType<typeof createAuth>
