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

/**
 * Notes, calls and tasks can be added to any record the person can read,
 * which is every record: writing down what happened isn't changing the
 * account.
 */
export const canAddToTimeline = (_role: Role): boolean => true

/** A note or call is changed by whoever wrote it, a manager or an admin. */
export const canEditActivity = (
  role: Role,
  userId: string,
  authorId: string | null
): boolean => canChangeAnything(role) || userId === authorId

/** A task is changed by whoever it's for, whoever made it, a manager or an admin. */
export const canEditTask = (
  role: Role,
  userId: string,
  task: { assigneeId: string; createdById: string }
): boolean =>
  canChangeAnything(role) ||
  userId === task.assigneeId ||
  userId === task.createdById

/*
 * Leads. Everyone reads every lead. A lead has no owner until someone is
 * given it, takes it, or converts it.
 */

/**
 * Working a lead is qualifying, disqualifying, reopening or converting it.
 * Managers and admins work any lead. A member works their own leads and
 * leads nobody has yet, never a teammate's.
 */
export const canWorkLead = (
  role: Role,
  userId: string,
  leadOwnerId: string | null
): boolean =>
  canChangeAnything(role) || leadOwnerId === null || leadOwnerId === userId

/**
 * Managers and admins give a lead to anyone, or back to nobody. A member may
 * only take a lead nobody has yet, for themselves.
 */
export const canAssignLead = (
  role: Role,
  userId: string,
  leadOwnerId: string | null,
  toUserId: string | null
): boolean =>
  canChangeAnything(role) || (leadOwnerId === null && toUserId === userId)

/**
 * Converting a lead whose company is already an account adds the lead's
 * person to that account whoever owns it, and the owner keeps it: the one
 * exception to "members change only the companies they own". Pass the
 * account's owner, or null when converting makes a new account.
 */
export const canConvertLeadInto = (
  role: Role,
  userId: string,
  leadOwnerId: string | null,
  _companyOwnerId: string | null
): boolean => canWorkLead(role, userId, leadOwnerId)

/**
 * The exception stops at the person. A deal added while converting follows
 * the usual rule: on a new account, or one the person may change.
 */
export const canAddDealOnConvert = (
  role: Role,
  userId: string,
  companyOwnerId: string | null
): boolean =>
  companyOwnerId === null || canEditCompany(role, userId, companyOwnerId)

/**
 * A contract belongs to its company: whoever may change the company may add
 * its contracts, start their renewals and end them.
 */
export const canEditContract = canEditCompany

/** The forecast report is for managers and admins. */
export const canSeeForecast = canChangeAnything

/** Managers and admins write, publish and archive playbooks. */
export const canWritePlaybooks = canChangeAnything

/**
 * Everyone sees published playbooks. A draft is for whoever wrote it, and
 * for managers and admins.
 */
export const canSeePlaybook = (
  role: Role,
  userId: string,
  playbook: { authorId: string | null; isPublished: boolean }
): boolean =>
  playbook.isPublished ||
  canWritePlaybooks(role) ||
  userId === playbook.authorId
