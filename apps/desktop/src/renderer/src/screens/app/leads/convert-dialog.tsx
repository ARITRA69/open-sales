import { useEffect, useId, useState, type FormEvent } from 'react'

import { CheckmarkCircle02Icon } from '@hugeicons/core-free-icons'
import type {
  TLead,
  TLeadConverted,
  TLeadMatch,
  TSessionUser
} from '@open-sales/shared'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/controls'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Icon } from '@/components/ui/icon'
import { Banner } from '@/components/ui/kit'
import { useSettled } from '@/hooks/use-records'
import { parseMoney } from '@/lib/money'

import type { TLeadsBridge } from './use-leads'

// The server's codes that mean "what you were shown has changed".
const LOOK_AGAIN = ['match_changed', 'domain_taken', 'email_taken']

const MATCHED_BY: Record<
  NonNullable<TLeadMatch['company']>['matchedBy'],
  string
> = {
  person: 'the same email address',
  domain: 'their email’s domain',
  name: 'its name'
}

/** What the person is told about the account before they confirm. */
const describeMatch = (
  match: TLeadMatch,
  lead: TLead,
  me: TSessionUser,
  newName: string
): { title: string; body: string } => {
  const { company, person } = match
  if (!company) {
    return {
      title: newName ? `${newName} will be a new account` : 'A new account',
      body: `You’ll own it, and ${lead.name} will be its first person.`
    }
  }
  const isMine = company.owner.id === me.id
  const whose = isMine ? 'yours' : `${company.owner.name}’s`
  if (person) {
    return {
      title: `${person.name} is already in People, at ${company.name}`,
      body: `Found by ${MATCHED_BY.person}. This lead will be linked to them, so nobody is added twice. The account stays ${whose}.`
    }
  }
  return {
    title: `${company.name} is already an account`,
    body: isMine
      ? `Found by ${MATCHED_BY[company.matchedBy]}. ${lead.name} will be added to it. It stays yours.`
      : `Found by ${MATCHED_BY[company.matchedBy]}. ${lead.name} will be added to it, and it stays ${whose}: converting doesn’t take an account over.`
  }
}

type TConvertDialogProps = {
  bridge: TLeadsBridge
  lead: TLead
  me: TSessionUser
  // The workspace's currency, for the deal's value. Null until it's known.
  currency: string | null
  // Once converted, so the inbox can catch up behind the dialog.
  onConverted: (result: TLeadConverted) => void
  // The lead changed under the dialog: the latest copy.
  onStale: (lead: TLead) => void
  onClose: () => void
}

/**
 * Turning a lead into an account, a person and, if wanted, a deal. It shows
 * the account the server spotted before anything is made, and afterwards
 * links to what it made.
 */
export const ConvertDialog = ({
  bridge,
  lead,
  me,
  currency,
  onConverted,
  onStale,
  onClose
}: TConvertDialogProps) => {
  const dealToggleId = useId()
  const [companyName, setCompanyName] = useState(lead.companyName ?? '')
  const settledName = useSettled(companyName.trim(), 350)
  const [match, setMatch] = useState<TLeadMatch | null>(null)
  const [looks, setLooks] = useState(0)
  const [wantsDeal, setWantsDeal] = useState(true)
  const [dealName, setDealName] = useState<string | null>(null)
  const [value, setValue] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [result, setResult] = useState<TLeadConverted | null>(null)

  // Ask the server what this lead matches, again whenever the name settles.
  useEffect(() => {
    let isCurrent = true
    void bridge.match(lead.id, settledName || undefined).then((answer) => {
      if (!isCurrent) return
      if (answer.ok) setMatch(answer.data)
      else setProblem(answer.message)
    })
    return () => {
      isCurrent = false
    }
  }, [bridge, lead.id, settledName, looks])

  if (result) {
    return <ConvertedDialog me={me} result={result} onClose={onClose} />
  }

  // An account found from the email doesn't depend on the name typed here.
  const isNameFixed =
    match?.company?.matchedBy === 'person' ||
    match?.company?.matchedBy === 'domain'
  const isSettled = settledName === companyName.trim()
  const accountName = match?.company?.name ?? companyName.trim()
  const canAddDeal = match?.canAddDeal ?? true
  const addsDeal = wantsDeal && canAddDeal
  const shownDealName = dealName ?? accountName
  const told = match ? describeMatch(match, lead, me, companyName.trim()) : null

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!match || !isSettled) return
    if (!match.company && !companyName.trim()) {
      setProblem('Say which company they work at.')
      return
    }
    const valueMinor = parseMoney(value)
    if (addsDeal && !shownDealName.trim()) {
      setProblem('Name the deal.')
      return
    }
    if (addsDeal && valueMinor === undefined) {
      setProblem('Enter an amount like 12,500.')
      return
    }

    setIsSaving(true)
    const answer = await bridge.convert(lead.id, {
      version: lead.version,
      companyId: match.company?.id ?? null,
      companyName: match.company ? undefined : companyName.trim(),
      deal: addsDeal ? { name: shownDealName, valueMinor } : null
    })
    setIsSaving(false)

    if (answer.ok) {
      setResult(answer.data)
      onConverted(answer.data)
      return
    }
    setProblem(answer.message)
    if (answer.code && LOOK_AGAIN.includes(answer.code)) {
      setLooks((count) => count + 1)
    }
    if (answer.code === 'changed_since') {
      const latest = await bridge.get(lead.id)
      if (latest.ok) onStale(latest.data)
    }
  }

  return (
    <Dialog
      open
      description="Makes the account, the person and the deal in one step."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!match || !isSettled}
            form="convert-form"
            loading={isSaving}
            type="submit"
          >
            Convert
          </Button>
        </>
      }
      title={`Convert ${lead.name}`}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <form
        noValidate
        className="flex flex-col gap-3"
        id="convert-form"
        onSubmit={handleSubmit}
      >
        {isNameFixed ? null : (
          <Field
            autoFocus={!lead.companyName}
            label="Company"
            placeholder="Brightwell Logistics"
            value={companyName}
            onChange={(event) => {
              setCompanyName(event.target.value)
              setProblem(null)
            }}
          />
        )}

        {told ? (
          <Banner
            aria-live="polite"
            className="flex-col items-start gap-0.5"
            data-testid="convert-match"
            tone={match?.company ? 'accent' : 'muted'}
          >
            <span className="font-semibold">{told.title}</span>
            <span className="font-normal text-muted-foreground">
              {told.body}
            </span>
          </Banner>
        ) : (
          <Banner>
            <span className="text-muted-foreground">
              Checking your accounts…
            </span>
          </Banner>
        )}

        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={addsDeal}
              disabled={!canAddDeal}
              id={dealToggleId}
              onCheckedChange={(checked) => setWantsDeal(checked === true)}
            />
            <label className="text-sm font-medium" htmlFor={dealToggleId}>
              Add a deal
            </label>
          </div>
          {canAddDeal ? null : (
            <p className="m-0 text-body-sm text-muted-foreground">
              {`Only ${match?.company?.owner.name ?? 'its owner'}, a manager or an admin can add deals to ${match?.company?.name ?? 'that account'}.`}
            </p>
          )}
        </div>

        {addsDeal ? (
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Deal"
              placeholder="Platform rollout"
              value={shownDealName}
              onChange={(event) => setDealName(event.target.value)}
            />
            <Field
              inputMode="decimal"
              label={currency ? `Value (${currency})` : 'Value'}
              placeholder="12,500"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </div>
        ) : null}

        {problem ? (
          <p className="m-0 text-sm text-destructive" role="alert">
            {problem}
          </p>
        ) : null}
      </form>
    </Dialog>
  )
}

type TConvertedDialogProps = {
  result: TLeadConverted
  me: TSessionUser
  onClose: () => void
}

/** What converting made, with links to it. */
const ConvertedDialog = ({ result, me, onClose }: TConvertedDialogProps) => {
  const { company, person, deal } = result
  const isSomeoneElses = !company.isNew && company.owner.id !== me.id

  const lines = [
    company.isNew
      ? `${company.name} is a new account, and it’s yours.`
      : `${company.name} was already an account, so it stays ${isSomeoneElses ? `${company.owner.name}’s` : 'yours'}.`,
    person.isNew
      ? `${person.name} was added to it.`
      : `${person.name} was already there, and this lead is linked to them.`,
    ...(deal ? [`The deal “${deal.name}” is in the pipeline.`] : [])
  ]

  return (
    <Dialog
      open
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
          {deal ? (
            <Button href={`#/deals/${deal.id}`} variant="secondary">
              Open deal
            </Button>
          ) : null}
          <Button href={`#/accounts/${company.id}`}>Open account</Button>
        </>
      }
      title={`${result.lead.name} is converted`}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {lines.map((line) => (
          <li key={line} className="flex items-start gap-2 text-sm">
            <span className="mt-0.5 flex flex-none text-foreground-soft">
              <Icon icon={CheckmarkCircle02Icon} />
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
      {isSomeoneElses ? (
        <Banner>
          {`Let ${company.owner.name} know there’s someone new on their account.`}
        </Banner>
      ) : null}
    </Dialog>
  )
}
