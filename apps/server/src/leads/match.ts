import type { TLeadMatch } from '@open-sales/shared'
import { companyDomainOfEmail } from '@open-sales/shared'
import { and, asc, eq, ilike, isNull } from 'drizzle-orm'

import { company, person, user } from '../db/schema'
import type { lead } from '../db/schema'
import type { TQueries } from '../records/common'

type TLeadRow = typeof lead.$inferSelect

/** What `ilike` needs to match the whole text, whatever its case. */
const exactly = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`)

const companyRef = {
  id: company.id,
  name: company.name,
  ownerId: company.ownerId,
  ownerName: user.name
}

/** The account and person a lead already has in the records, if any. */
export type TFoundMatch = Pick<TLeadMatch, 'company' | 'person'>

/**
 * Looks for the lead in what's already there, so converting never makes a
 * second copy: first someone with the lead's email, then a company with the
 * email's domain, then one with the same name. Archived records don't count.
 * `companyName` replaces the lead's own when the person converting typed a
 * different one.
 */
export const findLeadMatch = async (
  tx: TQueries,
  row: Pick<TLeadRow, 'email' | 'companyName'>,
  companyName?: string
): Promise<TFoundMatch> => {
  if (row.email) {
    const [known] = await tx
      .select({
        personId: person.id,
        personName: person.name,
        ...companyRef
      })
      .from(person)
      .innerJoin(company, eq(company.id, person.companyId))
      .innerJoin(user, eq(user.id, company.ownerId))
      .where(
        and(
          eq(person.email, row.email),
          isNull(person.archivedAt),
          isNull(company.archivedAt)
        )
      )
    if (known) {
      return {
        company: {
          id: known.id,
          name: known.name,
          owner: { id: known.ownerId, name: known.ownerName },
          matchedBy: 'person'
        },
        person: { id: known.personId, name: known.personName }
      }
    }
  }

  const selectCompanies = () =>
    tx
      .select(companyRef)
      .from(company)
      .innerJoin(user, eq(user.id, company.ownerId))

  const domain = companyDomainOfEmail(row.email)
  if (domain) {
    const [byDomain] = await selectCompanies().where(
      and(eq(company.domain, domain), isNull(company.archivedAt))
    )
    if (byDomain) {
      return {
        company: {
          id: byDomain.id,
          name: byDomain.name,
          owner: { id: byDomain.ownerId, name: byDomain.ownerName },
          matchedBy: 'domain'
        },
        person: null
      }
    }
  }

  const name = (companyName ?? row.companyName ?? '').trim()
  if (name) {
    // The oldest, if two accounts share a name.
    const [byName] = await selectCompanies()
      .where(
        and(ilike(company.name, exactly(name)), isNull(company.archivedAt))
      )
      .orderBy(asc(company.id))
      .limit(1)
    if (byName) {
      return {
        company: {
          id: byName.id,
          name: byName.name,
          owner: { id: byName.ownerId, name: byName.ownerName },
          matchedBy: 'name'
        },
        person: null
      }
    }
  }

  return { company: null, person: null }
}
