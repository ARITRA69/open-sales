import { useState } from 'react'

import type { Role, TMember, TMemberUpdate } from '@open-sales/shared'
import { ROLES } from '@open-sales/shared'

import { Avatar } from '@/components/ui/bits'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { PickPill } from '@/components/ui/pick-pill'
import { Tag } from '@/components/ui/status'
import { getInitials } from '@/lib/initials'

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  manager: 'Manager',
  member: 'Member'
}

// Least to most, as the pill lists them.
const ROLE_OPTIONS = [...ROLES].reverse().map((role) => ({
  value: role,
  label: ROLE_LABELS[role]
}))

type TTeamListProps = {
  // Everyone who has joined or been declined; waiting people are listed apart.
  members: TMember[]
  // The signed-in admin.
  meId: string
  // The member being saved, if any: their row waits.
  busyId?: string | null
  onUpdate: (member: TMember, changes: TMemberUpdate) => void
  // Lets in someone who was declined earlier.
  onApprove: (memberId: string) => void
}

/**
 * Everyone in the workspace with their role and whether they can sign in.
 * An admin changes roles, deactivates and reactivates here. The server
 * keeps one active admin and stops admins deactivating themselves; this
 * list doesn't offer either.
 */
export const TeamList = ({
  members,
  meId,
  busyId = null,
  onUpdate,
  onApprove
}: TTeamListProps) => {
  // Who the dialog asks about. They stay after it closes, so it still says
  // their name while it fades out.
  const [deactivating, setDeactivating] = useState<TMember | null>(null)
  const [isAsking, setIsAsking] = useState(false)
  const activeAdmins = members.filter(
    (member) => member.role === 'admin' && member.status === 'active'
  )

  return (
    <>
      <ul
        aria-label="People"
        className="m-0 flex list-none flex-col rounded-card bg-muted px-3 py-0.5"
      >
        {members.map((member) => {
          const isMe = member.id === meId
          const isOnlyAdmin =
            activeAdmins.length === 1 && activeAdmins[0].id === member.id
          const hasJoined =
            member.status === 'active' || member.status === 'deactivated'
          const isBusy = busyId === member.id

          return (
            <li
              key={member.id}
              aria-label={member.name}
              className="flex min-h-11 items-center gap-2.5 border-b border-border py-1.5 last:border-b-0"
            >
              <Avatar
                initials={getInitials(member.name)}
                size={24}
                tone={member.status === 'active' ? 'soft' : 'muted'}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-sm font-semibold">
                    {member.name}
                  </span>
                  {isMe ? (
                    <span className="flex-none text-body-sm text-muted-foreground">
                      You
                    </span>
                  ) : null}
                </span>
                <span className="truncate text-body-sm text-muted-foreground">
                  {member.email}
                </span>
              </span>
              {member.status === 'declined' ? <Tag>Declined</Tag> : null}
              {member.status === 'deactivated' ? <Tag>Deactivated</Tag> : null}
              <span className="flex w-28 flex-none justify-end">
                {hasJoined && !isOnlyAdmin ? (
                  <PickPill
                    align="end"
                    label={`Role of ${member.name}`}
                    options={ROLE_OPTIONS}
                    value={member.role}
                    onChange={(role) => {
                      if (role !== member.role) {
                        onUpdate(member, { role: role as Role })
                      }
                    }}
                  />
                ) : (
                  <span
                    className="pr-2.5 text-body-sm text-muted-foreground"
                    title={
                      isOnlyAdmin
                        ? 'The workspace needs at least one admin. Make someone else an admin to change this.'
                        : undefined
                    }
                  >
                    {isOnlyAdmin ? 'Only admin' : ROLE_LABELS[member.role]}
                  </span>
                )}
              </span>
              <span className="flex w-24 flex-none justify-end">
                {member.status === 'declined' ? (
                  <Button
                    loading={isBusy}
                    size="sm"
                    variant="ghost"
                    onClick={() => onApprove(member.id)}
                  >
                    Approve
                  </Button>
                ) : member.status === 'deactivated' ? (
                  <Button
                    loading={isBusy}
                    size="sm"
                    variant="ghost"
                    onClick={() => onUpdate(member, { status: 'active' })}
                  >
                    Reactivate
                  </Button>
                ) : isMe || isOnlyAdmin ? null : (
                  <Button
                    loading={isBusy}
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDeactivating(member)
                      setIsAsking(true)
                    }}
                  >
                    Deactivate
                  </Button>
                )}
              </span>
            </li>
          )
        })}
      </ul>
      <ConfirmDialog
        body="They’re signed out everywhere and can’t sign in until you reactivate them. Their accounts and deals stay theirs until a manager gives them to someone else."
        confirmLabel="Deactivate"
        // It can be undone: Reactivate brings them back.
        danger={false}
        open={isAsking}
        title={`Deactivate ${deactivating?.name ?? ''}?`}
        onConfirm={() => {
          if (deactivating) onUpdate(deactivating, { status: 'deactivated' })
          setIsAsking(false)
        }}
        onOpenChange={setIsAsking}
      />
    </>
  )
}
