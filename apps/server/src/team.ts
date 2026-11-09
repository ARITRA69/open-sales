import { createHash, randomBytes } from 'node:crypto'

import type {
  Role,
  TJoinPreview,
  TJoinRequest,
  TJoinRequestStatus,
  TJoinResponse,
  TMember,
  TUserStatus
} from '@open-sales/shared'
import { sessionUserSchema } from '@open-sales/shared'
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'

import type { TAuth } from './auth'
import type { TDatabase } from './db/client'
import { joinLink, joinRequest, session, user, workspace } from './db/schema'

// Any fixed number; every server copy takes the same lock to change the link.
const JOIN_LINK_LOCK_ID = 7_020_302

const newToken = () => randomBytes(24).toString('base64url')
const hashTicket = (ticket: string) =>
  createHash('sha256').update(ticket).digest('hex')

export class JoinLinkInvalidError extends Error {
  constructor() {
    super(
      'This join link has expired or was reset. Ask your admin for a new one.'
    )
  }
}

export class EmailTakenError extends Error {
  constructor() {
    super('There’s already an account for that email. Sign in instead.')
  }
}

export class MemberNotFoundError extends Error {
  constructor() {
    super('That person isn’t waiting to join any more.')
  }
}

/** The live join link as the server keeps it. The route turns it into a URL. */
export type TJoinLinkRecord = {
  token: string
  allowedDomain: string | null
  role: Role
  createdAt: Date
}

export type TTeamService = {
  getJoinLink: () => Promise<TJoinLinkRecord | null>
  // Replaces the live link, if any, so the old one stops working.
  createJoinLink: (
    byUserId: string,
    allowedDomain: string | null
  ) => Promise<TJoinLinkRecord>
  updateJoinLink: (
    allowedDomain: string | null
  ) => Promise<TJoinLinkRecord | null>
  disableJoinLink: () => Promise<void>
  // Null when the token isn't a live link.
  previewJoin: (token: string) => Promise<TJoinPreview | null>
  join: (input: TJoinRequest) => Promise<TJoinResponse>
  getJoinRequestStatus: (ticket: string) => Promise<TJoinRequestStatus | null>
  listMembers: () => Promise<TMember[]>
  approve: (userId: string, byUserId: string) => Promise<void>
  decline: (userId: string, byUserId: string) => Promise<void>
}

const REQUEST_STATUS: Record<TUserStatus, TJoinRequestStatus['status']> = {
  active: 'approved',
  pending: 'pending',
  declined: 'declined',
  deactivated: 'declined'
}

/** The join link, joining with it, and approving the people who did. */
export const createTeamService = (db: TDatabase, auth: TAuth): TTeamService => {
  const linkColumns = {
    id: joinLink.id,
    token: joinLink.token,
    allowedDomain: joinLink.allowedDomain,
    role: joinLink.role,
    createdAt: joinLink.createdAt
  }

  const toRecord = (row: {
    token: string
    allowedDomain: string | null
    role: string
    createdAt: Date
  }): TJoinLinkRecord => ({
    token: row.token,
    allowedDomain: row.allowedDomain,
    role: row.role as Role,
    createdAt: row.createdAt
  })

  const findLiveLink = async (token?: string) => {
    const [row] = await db
      .select(linkColumns)
      .from(joinLink)
      .where(
        token
          ? and(isNull(joinLink.revokedAt), eq(joinLink.token, token))
          : isNull(joinLink.revokedAt)
      )
      .orderBy(desc(joinLink.createdAt))
      .limit(1)
    return row ?? null
  }

  const workspaceName = async () => {
    const [current] = await db
      .select({ name: workspace.name })
      .from(workspace)
      .limit(1)
    return current?.name ?? null
  }

  return {
    getJoinLink: async () => {
      const live = await findLiveLink()
      return live ? toRecord(live) : null
    },

    createJoinLink: (byUserId, allowedDomain) =>
      db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(${JOIN_LINK_LOCK_ID})`
        )
        await tx
          .update(joinLink)
          .set({ revokedAt: new Date() })
          .where(isNull(joinLink.revokedAt))
        const [created] = await tx
          .insert(joinLink)
          .values({ token: newToken(), allowedDomain, createdById: byUserId })
          .returning(linkColumns)
        return toRecord(created)
      }),

    updateJoinLink: async (allowedDomain) => {
      const [updated] = await db
        .update(joinLink)
        .set({ allowedDomain })
        .where(isNull(joinLink.revokedAt))
        .returning(linkColumns)
      return updated ? toRecord(updated) : null
    },

    disableJoinLink: async () => {
      await db
        .update(joinLink)
        .set({ revokedAt: new Date() })
        .where(isNull(joinLink.revokedAt))
    },

    previewJoin: async (token) =>
      (await findLiveLink(token))
        ? { workspaceName: await workspaceName() }
        : null,

    join: async (input) => {
      const link = await findLiveLink(input.token)
      if (!link) throw new JoinLinkInvalidError()

      const email = input.email.trim().toLowerCase()
      const [existing] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, email))
      if (existing) throw new EmailTakenError()

      // The user.create hook in auth.ts makes them a pending member.
      await auth.api.signUpEmail({
        body: { name: input.name, email, password: input.password }
      })
      const [created] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, email))

      const domain = email.split('@')[1]
      if (link.allowedDomain && domain === link.allowedDomain) {
        await db
          .update(user)
          .set({ status: 'active', role: link.role })
          .where(eq(user.id, created.id))
        const signedIn = await auth.api.signInEmail({
          body: { email, password: input.password }
        })
        return {
          status: 'active',
          token: signedIn.token,
          user: sessionUserSchema.parse(signedIn.user)
        }
      }

      const ticket = newToken()
      await db.insert(joinRequest).values({
        userId: created.id,
        joinLinkId: link.id,
        ticketHash: hashTicket(ticket)
      })
      return { status: 'pending', ticket }
    },

    getJoinRequestStatus: async (ticket) => {
      const [found] = await db
        .select({ status: user.status })
        .from(joinRequest)
        .innerJoin(user, eq(user.id, joinRequest.userId))
        .where(eq(joinRequest.ticketHash, hashTicket(ticket)))
      return found
        ? { status: REQUEST_STATUS[found.status as TUserStatus] }
        : null
    },

    listMembers: async () => {
      const rows = await db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          createdAt: user.createdAt
        })
        .from(user)
        // Waiting people first, then everyone in the order they joined.
        .orderBy(sql`${user.status} = 'pending' desc`, asc(user.createdAt))
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role as Role,
        status: row.status as TUserStatus,
        joinedAt: row.createdAt.toISOString()
      }))
    },

    approve: async (userId, byUserId) => {
      const [approved] = await db
        .update(user)
        .set({ status: 'active' })
        .where(
          and(
            eq(user.id, userId),
            inArray(user.status, ['pending', 'declined'])
          )
        )
        .returning({ id: user.id })
      if (!approved) throw new MemberNotFoundError()
      await db
        .update(joinRequest)
        .set({ decidedAt: new Date(), decidedById: byUserId })
        .where(eq(joinRequest.userId, userId))
    },

    decline: async (userId, byUserId) => {
      const [declined] = await db
        .update(user)
        .set({ status: 'declined' })
        .where(and(eq(user.id, userId), eq(user.status, 'pending')))
        .returning({ id: user.id })
      if (!declined) throw new MemberNotFoundError()
      await db
        .update(joinRequest)
        .set({ decidedAt: new Date(), decidedById: byUserId })
        .where(eq(joinRequest.userId, userId))
      // There shouldn't be any, but a declined person keeps no way in.
      await db.delete(session).where(eq(session.userId, userId))
    }
  }
}
