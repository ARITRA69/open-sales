/*
 * The three roles. The server enforces these; the app only uses them to decide
 * what to show. See "Roles" in CLAUDE.md.
 */
export const ROLES = ['admin', 'manager', 'member'] as const

export type Role = (typeof ROLES)[number]

/** Managers and admins see and change everything. */
export const canChangeAnything = (role: Role): boolean => role !== 'member'

/** Members change only the companies they own; managers and admins change any. */
export const canEditCompany = (
  role: Role,
  userId: string,
  companyOwnerId: string
): boolean => canChangeAnything(role) || userId === companyOwnerId

/**
 * A person belongs to their company: whoever may change the company may
 * change its people, and add new ones to it.
 */
export const canEditPerson = canEditCompany

/** A deal's owner may change it, and so may whoever may change its company. */
export const canEditDeal = (
  role: Role,
  userId: string,
  deal: { ownerId: string; companyOwnerId: string }
): boolean =>
  userId === deal.ownerId || canEditCompany(role, userId, deal.companyOwnerId)

/** Only managers and admins give a company, or a deal, to someone else. */
export const canReassign = canChangeAnything
