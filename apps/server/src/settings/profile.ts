import type { TProfileUpdate, TSessionUser } from '@open-sales/shared'
import { profileUpdateSchema } from '@open-sales/shared'
import { eq } from 'drizzle-orm'

import type { TDatabase } from '../db/client'
import { user } from '../db/schema'
import type { TActor } from '../records/common'
import { logChanges, RecordNotFoundError } from '../records/common'

/** What each person may change about themselves: for now, their name. */
export const createProfileService = (db: TDatabase) => ({
  update: async (me: TActor, input: TProfileUpdate): Promise<TSessionUser> => {
    const { name } = profileUpdateSchema.parse(input)
    return db.transaction(async (tx) => {
      const [found] = await tx
        .select({ name: user.name, email: user.email, role: user.role })
        .from(user)
        .where(eq(user.id, me.id))
        .for('update')
      if (!found) throw new RecordNotFoundError('account')
      if (found.name !== name) {
        await tx.update(user).set({ name }).where(eq(user.id, me.id))
        await logChanges(tx, me, [
          {
            recordType: 'user',
            recordId: me.id,
            action: 'update',
            changes: [{ field: 'name', from: found.name, to: name }]
          }
        ])
      }
      return { id: me.id, name, email: found.email, role: me.role }
    })
  }
})
