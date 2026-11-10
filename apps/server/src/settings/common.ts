import { canManageWorkspace } from '@open-sales/shared'

import type { TActor } from '../records/common'
import { NotAllowedError } from '../records/common'

/** Settings that belong to the whole workspace are an admin's to change. */
export const assertAdmin = (me: TActor) => {
  if (!canManageWorkspace(me.role)) {
    throw new NotAllowedError('Only admins can change this.')
  }
}
