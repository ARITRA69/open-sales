import type { TRecordRef } from '@open-sales/shared'
import type { AnyColumn, SQL } from 'drizzle-orm'
import { eq, sql } from 'drizzle-orm'

import { company, deal, person, workspace } from '../db/schema'
import type { TQueries } from '../records/common'
import {
  InvalidChangeError,
  isRecordId,
  RecordNotFoundError
} from '../records/common'

/** Where something on a timeline is filed: its company, and a deal or person. */
export type TFiledUnder = {
  companyId: string
  dealId: string | null
  personId: string | null
}

const NOUNS = { company: 'company', person: 'person', deal: 'deal' } as const

/**
 * The record a note, call or task was written on, as the columns it's filed
 * under. A person or a deal brings its company with it. Archived records
 * take nothing new.
 */
export const fileUnder = async (
  tx: TQueries,
  ref: TRecordRef
): Promise<TFiledUnder> => {
  const notFound = () => new RecordNotFoundError(NOUNS[ref.type])
  if (!isRecordId(ref.id)) throw notFound()

  const found = await (async () => {
    if (ref.type === 'company') {
      const [row] = await tx
        .select({ companyId: company.id, archivedAt: company.archivedAt })
        .from(company)
        .where(eq(company.id, ref.id))
      return row ? { ...row, dealId: null, personId: null } : null
    }
    if (ref.type === 'person') {
      const [row] = await tx
        .select({
          companyId: person.companyId,
          personId: person.id,
          archivedAt: person.archivedAt
        })
        .from(person)
        .where(eq(person.id, ref.id))
      return row ? { ...row, dealId: null } : null
    }
    const [row] = await tx
      .select({
        companyId: deal.companyId,
        dealId: deal.id,
        archivedAt: deal.archivedAt
      })
      .from(deal)
      .where(eq(deal.id, ref.id))
    return row ? { ...row, personId: null } : null
  })()

  if (!found) throw notFound()
  if (found.archivedAt) {
    throw new InvalidChangeError(
      `Restore this ${NOUNS[ref.type]} to add to its timeline.`
    )
  }
  return {
    companyId: found.companyId,
    dealId: found.dealId,
    personId: found.personId
  }
}

/** Today's date where the team is, "2026-11-30": what "due today" means. */
export const readToday = async (tx: TQueries, now = new Date()) => {
  const [found] = await tx
    .select({ timeZone: workspace.timeZone })
    .from(workspace)
    .limit(1)
  // en-CA writes dates as 2026-11-30.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: found?.timeZone ?? 'UTC'
  }).format(now)
}

/**
 * A moment as text that sorts, down to the microsecond Postgres keeps:
 * "2026-11-10T09:30:00.123456Z". A JavaScript date would round it, and a
 * rounded cursor skips rows.
 */
export const sortableMoment = (column: AnyColumn | SQL) =>
  sql<string>`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
