import type { TWorkspaceSettings, TWorkspaceUpdate } from '@open-sales/shared'
import { workspaceUpdateSchema } from '@open-sales/shared'
import { eq } from 'drizzle-orm'

import type { TDatabase } from '../db/client'
import { workspace } from '../db/schema'
import type { TActor, TQueries } from '../records/common'
import { diffFields, logChanges, RecordNotFoundError } from '../records/common'
import { assertAdmin } from './common'

const columns = {
  id: workspace.id,
  name: workspace.name,
  currency: workspace.currency,
  timeZone: workspace.timeZone
}

/** The workspace's name, currency and time zone. */
export const createWorkspaceSettingsService = (db: TDatabase) => {
  const get = async (queries: TQueries = db): Promise<TWorkspaceSettings> => {
    const [found] = await queries.select(columns).from(workspace).limit(1)
    if (!found) throw new RecordNotFoundError('workspace')
    return {
      name: found.name,
      currency: found.currency,
      timeZone: found.timeZone
    }
  }

  return {
    /** Everyone signed in can read it: dates and money are shown with it. */
    get: () => get(),

    /** Changes what's sent. The currency is for new deals; old ones keep theirs. */
    update: async (
      me: TActor,
      input: TWorkspaceUpdate
    ): Promise<TWorkspaceSettings> => {
      assertAdmin(me)
      const data = workspaceUpdateSchema.parse(input)
      return db.transaction(async (tx) => {
        const [found] = await tx
          .select(columns)
          .from(workspace)
          .limit(1)
          .for('update')
        if (!found) throw new RecordNotFoundError('workspace')
        const changes = diffFields(found, data)
        if (changes.length > 0) {
          await tx.update(workspace).set(data).where(eq(workspace.id, found.id))
          await logChanges(tx, me, [
            {
              recordType: 'workspace',
              recordId: found.id,
              action: 'update',
              changes
            }
          ])
        }
        return get(tx)
      })
    }
  }
}
