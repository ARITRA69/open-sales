import { useState, type ReactNode } from 'react'

import { SparklesIcon } from '@hugeicons/core-free-icons'
import type { TLead, TOwner } from '@open-sales/shared'
import { formatPhone, isOpenLead } from '@open-sales/shared'

import { Link } from '@/components/shared/link'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Icon } from '@/components/ui/icon'
import { Banner } from '@/components/ui/kit'
import { Tag } from '@/components/ui/status'

import type { TApiResult } from '../../../../../preload/bridge-types'
import { askAboutLead } from './ask-ai'
import { formatArrived, roleLine, sourceLabel, statusCell } from './lead-labels'
import { NOBODY } from './new-lead-dialog'
import type { TLeadsBridge } from './use-leads'

const QUIET_LINK =
  'rounded-sm text-foreground underline decoration-faint underline-offset-4 outline-none transition-colors duration-150 hover:decoration-current keyboard-focus:shadow-(--halo-keyboard)'

type TDetailProps = { label: string; children: ReactNode }

/** One labelled fact about the lead. */
const Detail = ({ label, children }: TDetailProps) => (
  <div className="flex min-w-0 flex-col gap-0.5">
    <dt className="text-body-sm text-muted-foreground">{label}</dt>
    <dd className="m-0 truncate text-sm">{children}</dd>
  </div>
)

type TLeadDialogProps = {
  bridge: TLeadsBridge
  lead: TLead
  // The signed-in person, for taking a lead nobody has.
  meId: string
  // Everyone a manager or admin could give it to.
  users: TOwner[]
  // After assigning, qualifying or reopening, with the lead as it now is.
  onChanged: (lead: TLead) => void
  onConvert: () => void
  onDisqualify: () => void
  onClose: () => void
}

/**
 * One lead: who they are, what they wrote, the AI's note on fit when there
 * is one, and what to do with them. People who can't work it see the same
 * details without the buttons.
 */
export const LeadDialog = ({
  bridge,
  lead,
  meId,
  users,
  onChanged,
  onConvert,
  onDisqualify,
  onClose
}: TLeadDialogProps) => {
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState<'owner' | 'status' | null>(null)

  const isOpen = isOpenLead(lead.status)
  const status = statusCell(lead.status)
  const role = roleLine(lead)

  /** Runs a change; a stale copy is replaced by the latest one. */
  const settle = async (
    action: 'owner' | 'status',
    call: () => Promise<TApiResult<TLead>>
  ) => {
    setBusy(action)
    const answer = await call()
    setBusy(null)
    if (answer.ok) {
      setProblem(null)
      onChanged(answer.data)
      return
    }
    setProblem(answer.message)
    if (answer.code === 'changed_since') {
      const latest = await bridge.get(lead.id)
      if (latest.ok) onChanged(latest.data)
    }
  }

  const assign = (ownerId: string | null) =>
    settle('owner', () =>
      bridge.assign(lead.id, { version: lead.version, ownerId })
    )

  return (
    <Dialog
      open
      wide
      description={role || undefined}
      footer={
        <>
          <div className="mr-auto flex gap-2">
            {isOpen && lead.canWork ? (
              <Button variant="ghost" onClick={onDisqualify}>
                Disqualify
              </Button>
            ) : null}
            <Button
              leadIcon={SparklesIcon}
              variant="ghost"
              onClick={() => askAboutLead(lead)}
            >
              Ask AI
            </Button>
          </div>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {lead.status === 'new' && lead.canWork ? (
            <Button
              loading={busy === 'status'}
              variant="secondary"
              onClick={() =>
                settle('status', () => bridge.qualify(lead.id, lead.version))
              }
            >
              Mark qualified
            </Button>
          ) : null}
          {lead.status === 'disqualified' && lead.canWork ? (
            <Button
              loading={busy === 'status'}
              onClick={() =>
                settle('status', () => bridge.reopen(lead.id, lead.version))
              }
            >
              Reopen
            </Button>
          ) : null}
          {isOpen && lead.canWork ? (
            <Button onClick={onConvert}>Convert</Button>
          ) : null}
          {lead.status === 'converted' && lead.convertedCompanyId ? (
            <Button href={`#/accounts/${lead.convertedCompanyId}`}>
              Open account
            </Button>
          ) : null}
        </>
      }
      title={lead.name}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-body-sm text-muted-foreground">
          <Tag dot={status.dot} tone={status.soft}>
            {status.text}
          </Tag>
          <span>{sourceLabel(lead.source)}</span>
          <span aria-hidden>·</span>
          <span>{`Arrived ${formatArrived(lead.createdAt).toLowerCase()}`}</span>
        </div>

        {lead.canWork ? null : (
          <Banner>
            {`This lead is with ${lead.owner?.name ?? 'a teammate'}. Only they, a manager or an admin can work it.`}
          </Banner>
        )}

        <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3">
          <Detail label="Email">
            {lead.email ? (
              <Link className={QUIET_LINK} href={`mailto:${lead.email}`}>
                {lead.email}
              </Link>
            ) : (
              <span className="text-faint">None</span>
            )}
          </Detail>
          <Detail label="Phone">
            {lead.phone ? (
              formatPhone(lead.phone)
            ) : (
              <span className="text-faint">None</span>
            )}
          </Detail>
        </dl>

        {lead.message ? (
          <section className="flex flex-col gap-1.5">
            <h3 className="m-0 text-body-sm font-semibold">What they wrote</h3>
            <p className="m-0 rounded-card bg-muted px-3 py-2 text-sm whitespace-pre-wrap">
              {lead.message}
            </p>
          </section>
        ) : null}

        {lead.fitNote ? (
          <section className="flex flex-col gap-1.5">
            <h3 className="m-0 text-body-sm font-semibold">AI’s note on fit</h3>
            <Banner className="items-start" tone="accent">
              <Icon className="mt-0.5 flex-none" icon={SparklesIcon} />
              <span>{lead.fitNote}</span>
            </Banner>
          </section>
        ) : null}

        {lead.status === 'disqualified' ? (
          <Banner>
            <span>
              <span className="font-semibold">Disqualified: </span>
              {lead.disqualifiedReason ?? 'no reason given'}
            </span>
          </Banner>
        ) : null}

        {lead.status === 'converted' ? (
          <Banner className="flex-wrap">
            <span className="font-semibold">Converted.</span>
            {lead.convertedPersonId ? (
              <Link
                className={QUIET_LINK}
                href={`#/people/${lead.convertedPersonId}`}
              >
                Open the person
              </Link>
            ) : null}
            {lead.convertedDealId ? (
              <Link
                className={QUIET_LINK}
                href={`#/deals/${lead.convertedDealId}`}
              >
                Open the deal
              </Link>
            ) : null}
          </Banner>
        ) : null}

        {lead.canAssign && users.length > 0 && lead.status !== 'converted' ? (
          <Field
            searchable
            hint={busy === 'owner' ? 'Saving…' : undefined}
            kind="select"
            label="Owner"
            options={[
              { label: 'Unassigned', value: NOBODY },
              ...users.map((user) => ({ label: user.name, value: user.id }))
            ]}
            value={lead.owner?.id ?? NOBODY}
            onValueChange={(value) => {
              const ownerId = value === NOBODY ? null : value
              if (ownerId !== (lead.owner?.id ?? null)) void assign(ownerId)
            }}
          />
        ) : (
          <div className="flex items-end gap-3">
            <Field
              readOnly
              label="Owner"
              value={lead.owner?.name ?? 'Unassigned'}
            />
            {lead.canTake && isOpen ? (
              <Button
                className="flex-none"
                loading={busy === 'owner'}
                variant="secondary"
                onClick={() => void assign(meId)}
              >
                Take it
              </Button>
            ) : null}
          </div>
        )}

        {problem ? (
          <p className="m-0 text-sm text-destructive" role="alert">
            {problem}
          </p>
        ) : null}
      </div>
    </Dialog>
  )
}
