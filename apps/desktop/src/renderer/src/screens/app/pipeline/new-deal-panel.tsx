import { useRef, useState, type FormEvent } from 'react'

import type {
  TCompany,
  TDeal,
  TDealCreateWithPeople,
  TOwner,
  TPipeline,
  TSessionUser
} from '@open-sales/shared'
import { canReassign } from '@open-sales/shared'

import { Button } from '@/components/ui/button'
import { DateField } from '@/components/ui/date-field'
import { Field } from '@/components/ui/field'
import type { TRecordsBridge } from '@/hooks/use-records'
import { parseMoney } from '@/lib/money'

import type { TApiResult } from '../../../../../preload/bridge-types'
import { CompanyField } from '../records/company-field'
import { OwnerField } from '../records/owner-field'
import { PeopleField } from './people-field'
import { SidePanel } from './side-panel'

/** What the panel opens with. A new object each time asks it to start again there. */
export type TNewDealStart = {
  // The stage column whose "+" opened it.
  stageId?: string
  // The account it's being added to, from that account's own page.
  company?: Pick<TCompany, 'id' | 'name' | 'owner' | 'canEdit'>
}

type TNewDealForm = {
  name: string
  companyId: string
  stageId: string
  value: string
  closeDate: string
  ownerId: string
  personIds: string[]
}

type TNewDealPanelProps = {
  bridge: TRecordsBridge
  // Saves the deal with the people on it. Without it the deal is saved
  // through `bridge`, which leaves the people out.
  createDeal?:
    | ((input: TDealCreateWithPeople) => Promise<TApiResult<TDeal>>)
    | null
  me: TSessionUser
  pipeline: TPipeline
  users: TOwner[]
  start: TNewDealStart
  // After each deal is saved; "Save and add another" keeps the panel open.
  onSaved: (deal: TDeal) => void
  onClose: () => void
}

/**
 * Adding a deal from the Pipeline, in a panel that leaves the board in
 * view: name, account, stage, value, close date, owner and people.
 */
export const NewDealPanel = ({
  bridge,
  createDeal = null,
  me,
  pipeline,
  users,
  start,
  onSaved,
  onClose
}: TNewDealPanelProps) => {
  const openStages = pipeline.stages.filter((stage) => stage.kind === 'open')
  const firstStageId = openStages[0]?.id ?? ''
  const nameRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<TNewDealForm>({
    name: '',
    companyId: start.company?.id ?? '',
    stageId: start.stageId ?? firstStageId,
    value: '',
    closeDate: '',
    ownerId: me.id,
    personIds: []
  })
  const [problem, setProblem] = useState<string | null>(null)
  // The server said this person can't add deals here: a fact, not a mistake.
  const [refusal, setRefusal] = useState<string | null>(null)
  const [busy, setBusy] = useState<'save' | 'another' | null>(null)
  const [added, setAdded] = useState<string | null>(null)

  // Opened again from another column or account: start there, keep the rest.
  const [seenStart, setSeenStart] = useState(start)
  if (seenStart !== start) {
    setSeenStart(start)
    setForm((previous) => ({
      ...previous,
      stageId: start.stageId ?? previous.stageId,
      ...(start.company && start.company.id !== previous.companyId
        ? { companyId: start.company.id, personIds: [] }
        : {})
    }))
  }

  const set =
    <TField extends keyof TNewDealForm>(field: TField) =>
    (value: TNewDealForm[TField]) =>
      setForm((previous) => ({ ...previous, [field]: value }))

  // Only managers and admins give a deal to someone else.
  const mayChooseOwner = canReassign(me.role)
  const lockedCompany =
    start.company && !start.company.canEdit ? start.company : null

  const readForm = () => {
    if (!form.name.trim()) {
      return { ok: false as const, problem: 'Name the deal.' }
    }
    if (!form.companyId) {
      return { ok: false as const, problem: 'Choose the account.' }
    }
    const valueMinor = parseMoney(form.value)
    if (valueMinor === undefined) {
      return { ok: false as const, problem: 'Enter an amount like 12,500.' }
    }
    return {
      ok: true as const,
      input: {
        companyId: form.companyId,
        name: form.name,
        ...(form.stageId ? { stageId: form.stageId } : {}),
        valueMinor,
        closeDate: form.closeDate || null,
        ...(mayChooseOwner && form.ownerId ? { ownerId: form.ownerId } : {})
      }
    }
  }

  const save = async (another: boolean) => {
    if (busy) return
    const read = readForm()
    if (!read.ok) {
      setProblem(read.problem)
      return
    }
    setBusy(another ? 'another' : 'save')
    const answer = createDeal
      ? await createDeal({ ...read.input, personIds: form.personIds })
      : await bridge.create('deals', read.input)
    setBusy(null)
    if (!answer.ok) {
      const isRefusal = answer.code === 'forbidden'
      setRefusal(isRefusal ? answer.message : null)
      setProblem(isRefusal ? null : answer.message)
      return
    }
    setProblem(null)
    setRefusal(null)
    onSaved(answer.data)
    if (!another) {
      onClose()
      return
    }
    // The next deal is most often for the same account, in the same stage.
    setAdded(answer.data.name)
    setForm((previous) => ({
      ...previous,
      name: '',
      value: '',
      closeDate: '',
      personIds: []
    }))
    nameRef.current?.focus()
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    void save(false)
  }

  return (
    <SidePanel
      footer={
        lockedCompany ? (
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button
              disabled={busy === 'save'}
              loading={busy === 'another'}
              variant="secondary"
              onClick={() => void save(true)}
            >
              Save and add another
            </Button>
            <Button
              disabled={busy === 'another'}
              form="new-deal-form"
              loading={busy === 'save'}
              type="submit"
            >
              Save
            </Button>
          </>
        )
      }
      title="New deal"
      onClose={onClose}
    >
      <form
        noValidate
        className="flex flex-col gap-3"
        id="new-deal-form"
        onSubmit={handleSubmit}
      >
        {lockedCompany ? (
          <p className="m-0 text-sm text-muted-foreground">
            {`Owned by ${lockedCompany.owner.name}. Only they, a manager or an admin can add deals to ${lockedCompany.name}.`}
          </p>
        ) : null}
        <fieldset
          className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0"
          disabled={Boolean(lockedCompany)}
        >
          <Field
            ref={nameRef}
            autoFocus
            label="Deal"
            placeholder="Platform rollout"
            value={form.name}
            onChange={(event) => set('name')(event.target.value)}
          />
          <CompanyField
            bridge={bridge}
            current={start.company ?? null}
            value={form.companyId}
            onChange={(companyId) =>
              setForm((previous) => ({
                ...previous,
                companyId,
                personIds:
                  companyId === previous.companyId ? previous.personIds : []
              }))
            }
          />
          <Field
            kind="select"
            label="Stage"
            options={openStages.map((stage) => ({
              label: stage.name,
              value: stage.id
            }))}
            value={form.stageId}
            onValueChange={set('stageId')}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              inputMode="decimal"
              label={`Value (${pipeline.currency})`}
              placeholder="12,500"
              value={form.value}
              onChange={(event) => set('value')(event.target.value)}
            />
            <DateField
              label="Expected close"
              value={form.closeDate}
              onChange={set('closeDate')}
            />
          </div>
          <OwnerField
            canChoose={mayChooseOwner}
            ownerName={me.name}
            users={users}
            value={form.ownerId}
            onChange={set('ownerId')}
          />
          <PeopleField
            bridge={bridge}
            companyId={form.companyId}
            value={form.personIds}
            onChange={set('personIds')}
          />
        </fieldset>
        {problem ? (
          <p className="m-0 text-sm text-destructive" role="alert">
            {problem}
          </p>
        ) : null}
        {refusal ? (
          <p className="m-0 text-sm text-muted-foreground" role="status">
            {refusal}
          </p>
        ) : null}
        {added && !problem && !refusal ? (
          <p className="m-0 text-sm text-muted-foreground" role="status">
            {`Added ${added}. Add the next one.`}
          </p>
        ) : null}
      </form>
    </SidePanel>
  )
}
