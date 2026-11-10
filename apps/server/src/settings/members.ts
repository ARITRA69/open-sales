import type {
  Role,
  TMember,
  TMemberUpdate,
  TUserStatus
} from '@open-sales/shared'
import { memberUpdateSchema } from '@open-sales/shared'
import { and, count, eq, ne, sql } from 'drizzle-orm'

import type { TDatabase } from '../db/client'
import { session, user } from '../db/schema'
import type { TActor } from '../records/common'
import {
  diffFields,
  InvalidChangeError,
  logChanges,
  NotAllowedError,
  RecordNotFoundError
} from '../records/common'
import { assertAdmin } from './common'

// Any fixed number; every server copy takes the same lock to change who's an
// admin or who can sign in, so two changes can't both pass the last-admin
// check. (Setup and the join link use 7_020_301 and 7_020_302.)
const TEAM_LOCK_ID = 7_020_303

/** Roles, and turning accounts off and on. The join link is in team.ts. */
export const createMemberService = (db: TDatabase) => ({
  /**
   * Changes someone's role, or whether they can sign in. The workspace
   * always keeps one active admin, and nobody turns off their own account.
   * Someone turned off is signed out everywhere at once.
   */
  update: async (
    me: TActor,
    memberId: string,
    input: TMemberUpdate
  ): Promise<TMember> => {
    assertAdmin(me)
    const data = memberUpdateSchema.parse(input)
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${TEAM_LOCK_ID})`)

      // Their role may have changed since this request's session was read.
      const [actor] = await tx
        .select({ role: user.role, status: user.status })
        .from(user)
        .where(eq(user.id, me.id))
      if (actor?.role !== 'admin' || actor.status !== 'active') {
        throw new NotAllowedError('Only admins can change this.')
      }

      const [found] = await tx
        .select()
        .from(user)
        .where(eq(user.id, memberId))
        .for('update')
      if (!found) throw new RecordNotFoundError('person')
      if (found.status === 'pending' || found.status === 'declined') {
        throw new InvalidChangeError(
          'They haven’t joined yet. Approve them first.'
        )
      }
      if (data.status === 'deactivated' && found.id === me.id) {
        throw new InvalidChangeError(
          'You can’t deactivate your own account. Ask another admin.'
        )
      }

      const after = {
        role: data.role ?? found.role,
        status: data.status ?? found.status
      }
      const wasActiveAdmin = found.role === 'admin' && found.status === 'active'
      const isActiveAdmin = after.role === 'admin' && after.status === 'active'
      if (wasActiveAdmin && !isActiveAdmin) {
        const [{ others }] = await tx
          .select({ others: count() })
          .from(user)
          .where(
            and(
              eq(user.role, 'admin'),
              eq(user.status, 'active'),
              ne(user.id, found.id)
            )
          )
        if (others === 0) {
          throw new InvalidChangeError(
            'The workspace needs at least one admin. Make someone else an admin first.'
          )
        }
      }

      const changes = diffFields(found, after)
      if (changes.length > 0) {
        await tx.update(user).set(after).where(eq(user.id, found.id))
        if (after.status === 'deactivated') {
          // Their sessions stop working now, not when they next expire. The
          // session.create hook in auth.ts refuses new ones.
          await tx.delete(session).where(eq(session.userId, found.id))
        }
        await logChanges(tx, me, [
          { recordType: 'user', recordId: found.id, action: 'update', changes }
        ])
      }

      return {
        id: found.id,
        name: found.name,
        email: found.email,
        role: after.role as Role,
        status: after.status as TUserStatus,
        joinedAt: found.createdAt.toISOString()
      }
    })
  }
})
