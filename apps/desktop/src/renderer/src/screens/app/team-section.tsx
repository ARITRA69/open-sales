import { useState, type FormEvent } from 'react'

import type { Role, TMember } from '@open-sales/shared'
import { joinLinkSettingsSchema } from '@open-sales/shared'

import { Avatar } from '@/components/ui/bits'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Tag } from '@/components/ui/status'
import type { TTeamControls } from '@/hooks/use-team'
import { getInitials } from '@/lib/initials'

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  manager: 'Manager',
  member: 'Member'
}

/** A waiting person, with Approve and Decline. Used on Today and in Settings. */
export const PendingPersonRow = ({
  member,
  onDecide
}: {
  member: TMember
  onDecide: (memberId: string, decision: 'approve' | 'decline') => void
}) => (
  <li className="flex min-h-11 items-center gap-2.5 border-b border-border py-1.5 last:border-b-0">
    <Avatar initials={getInitials(member.name)} size={24} />
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate text-sm font-semibold">{member.name}</span>
      <span className="truncate text-body-sm text-muted-foreground">
        {member.email}
      </span>
    </span>
    <Button size="sm" onClick={() => onDecide(member.id, 'approve')}>
      Approve
    </Button>
    <Button
      size="sm"
      variant="ghost"
      onClick={() => onDecide(member.id, 'decline')}
    >
      Decline
    </Button>
  </li>
)

/** Settings › Join link and Team: who can join, and who has. Admins only. */
export const TeamSection = ({ team }: { team: TTeamControls }) => (
  <>
    <JoinLinkCard team={team} />
    <section className="flex flex-col gap-2">
      <h2 className="m-0 text-sm font-semibold">Team</h2>
      {team.members ? (
        <ul className="m-0 flex list-none flex-col rounded-card bg-muted px-3 py-0.5">
          {team.members.map((member) =>
            member.status === 'pending' ? (
              <PendingPersonRow
                key={member.id}
                member={member}
                onDecide={team.decide}
              />
            ) : (
              <MemberRow key={member.id} member={member} />
            )
          )}
        </ul>
      ) : (
        <p className="m-0 text-sm text-muted-foreground">Loading…</p>
      )}
    </section>
  </>
)

const MemberRow = ({ member }: { member: TMember }) => (
  <li className="flex min-h-11 items-center gap-2.5 border-b border-border py-1.5 last:border-b-0">
    <Avatar initials={getInitials(member.name)} size={24} />
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate text-sm font-semibold">{member.name}</span>
      <span className="truncate text-body-sm text-muted-foreground">
        {member.email}
      </span>
    </span>
    {member.status === 'declined' ? <Tag>Declined</Tag> : null}
    {member.status === 'deactivated' ? <Tag>Turned off</Tag> : null}
    <span className="w-20 flex-none text-right text-body-sm text-muted-foreground">
      {ROLE_LABELS[member.role]}
    </span>
  </li>
)

const JoinLinkCard = ({ team }: { team: TTeamControls }) => {
  const { joinLink } = team
  const [domain, setDomain] = useState<string | null>(null)
  const [domainError, setDomainError] = useState<string | undefined>()
  const [isCopied, setIsCopied] = useState(false)

  // What's typed, else what's saved.
  const shownDomain = domain ?? joinLink?.allowedDomain ?? ''

  const readDomain = () => {
    const parsed = joinLinkSettingsSchema.shape.allowedDomain.safeParse(
      shownDomain.trim() ? shownDomain.trim().replace(/^@/, '') : null
    )
    if (!parsed.success) {
      setDomainError(parsed.error.issues[0].message)
      return undefined
    }
    setDomainError(undefined)
    return parsed.data
  }

  const handleSaveDomain = async (event: FormEvent) => {
    event.preventDefault()
    const allowedDomain = readDomain()
    if (allowedDomain === undefined) return
    if (await team.setTrustedDomain(allowedDomain)) setDomain(null)
  }

  const handleCopy = async () => {
    if (!joinLink) return
    await navigator.clipboard.writeText(joinLink.url)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col">
        <h2 className="m-0 text-sm font-semibold">Join link</h2>
        <p className="m-0 text-body-sm text-muted-foreground">
          Post it where your team talks. People open it, pick a password and
          they’re in.
        </p>
      </div>
      <div className="flex flex-col gap-3 rounded-card bg-background p-3 shadow-(--shadow-tile)">
        {joinLink === undefined ? (
          <p className="m-0 text-sm text-muted-foreground">Loading…</p>
        ) : joinLink ? (
          <>
            <div className="flex items-end gap-2">
              <Field
                readOnly
                className="flex-1"
                label="Link"
                value={joinLink.url}
                onFocus={(event) => event.target.select()}
              />
              <Button variant="primary" onClick={handleCopy}>
                {isCopied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <form
              noValidate
              className="flex items-start gap-2"
              onSubmit={handleSaveDomain}
            >
              <Field
                autoCapitalize="off"
                className="flex-1"
                error={domainError}
                hint="People with an email here join straight away. Everyone else waits for your approval. Leave it empty to approve everyone."
                label="Trusted email domain"
                placeholder="acme.com"
                spellCheck={false}
                value={shownDomain}
                onChange={(event) => setDomain(event.target.value)}
              />
              <Button className="mt-5.5" type="submit" variant="secondary">
                Save
              </Button>
            </form>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  void team.resetJoinLink(joinLink.allowedDomain ?? null)
                }
              >
                Reset link
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void team.turnOffJoinLink()}
              >
                Turn off
              </Button>
            </div>
            <p className="m-0 text-body-sm text-muted-foreground">
              Reset makes a new link and stops the old one. New people join as
              Members.
            </p>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <p className="m-0 flex-1 text-sm text-muted-foreground">
              Off. Nobody can join with a link.
            </p>
            <Button onClick={() => void team.resetJoinLink(null)}>
              Turn on join link
            </Button>
          </div>
        )}
        {team.problem ? (
          <p className="m-0 text-sm text-destructive" role="alert">
            {team.problem}
          </p>
        ) : null}
      </div>
    </section>
  )
}
