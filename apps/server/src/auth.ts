import { MIN_PASSWORD_LENGTH } from '@open-sales/shared'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError } from 'better-auth/api'
import { bearer } from 'better-auth/plugins'
import { count, eq } from 'drizzle-orm'

import type { TDatabase } from './db/client'
import { account, session, user, verification } from './db/schema'

export const AUTH_BASE_PATH = '/api/v1/auth'

/** Why someone can't sign in, for the sign-in screen. */
const statusMessage = (status: string | undefined) =>
  status === 'pending'
    ? 'Your account is waiting for an admin to approve it.'
    : status === 'declined'
      ? 'An admin didn’t approve this account. Ask them to look again.'
      : 'This account is turned off. Ask your admin.'

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
      // Setup and joining sign in on purpose, once the account may be used.
      autoSignIn: false
    },
    user: {
      additionalFields: {
        // Clients can't set their own role (input: false). See ROLES.
        role: {
          type: 'string',
          required: false,
          defaultValue: 'member',
          input: false
        },
        // Pending until an admin approves, unless the join link's domain
        // matches. See USER_STATUSES.
        status: {
          type: 'string',
          required: false,
          defaultValue: 'pending',
          input: false
        }
      }
    },
    databaseHooks: {
      user: {
        create: {
          // The first person on a new server runs it. Everyone after starts
          // as a member waiting for approval; joining may let them in.
          before: async (newUser) => {
            const [{ total }] = await db.select({ total: count() }).from(user)
            const isFirst = total === 0
            return {
              data: {
                ...newUser,
                role: isFirst ? 'admin' : 'member',
                status: isFirst ? 'active' : 'pending'
              }
            }
          }
        }
      },
      session: {
        create: {
          // Only active people get a session; this is what sign-in hits.
          before: async (newSession) => {
            const [found] = await db
              .select({ status: user.status })
              .from(user)
              .where(eq(user.id, newSession.userId))
            if (found?.status !== 'active') {
              throw new APIError('FORBIDDEN', {
                message: statusMessage(found?.status)
              })
            }
          }
        }
      }
    },
    plugins: [bearer()]
  })

export type TAuth = ReturnType<typeof createAuth>
