/*
 * The three roles. The server enforces these; the app only uses them to decide
 * what to show. See "Roles" in CLAUDE.md.
 */
export const ROLES = ['admin', 'manager', 'member'] as const

export type Role = (typeof ROLES)[number]

/** Members change only the companies they own; managers and admins change any. */
export const canEditCompany = (
  role: Role,
  userId: string,
  companyOwnerId: string
): boolean => role !== 'member' || userId === companyOwnerId
