import { ArrowDown01Icon } from '@hugeicons/core-free-icons'

import { FieldWrap, useFieldIds } from '@/components/ui/field'
import { Icon } from '@/components/ui/icon'
import { fieldControlClass } from '@/components/ui/input'
import { Menu } from '@/components/ui/menu'
import type { TRecordsBridge } from '@/hooks/use-records'
import { useRecordList } from '@/hooks/use-records'
import { cn } from '@/lib/utils'

// The people list has no "at this company" filter yet, so this reads the
// first page and keeps the company's own.
const PEOPLE_CHOICES = 200

type TPeopleFieldProps = {
  bridge: TRecordsBridge
  // Whose people to offer. Empty until an account is chosen.
  companyId: string
  // Ids of the people picked.
  value: string[]
  onChange: (personIds: string[]) => void
}

/** The people at an account who are part of a deal: tick any number. */
export const PeopleField = ({
  bridge,
  companyId,
  value,
  onChange
}: TPeopleFieldProps) => {
  const { controlId, messageId } = useFieldIds()
  const people = useRecordList(bridge, 'people', { limit: PEOPLE_CHOICES })
  const atCompany = people.items.filter(
    (person) => person.company.id === companyId
  )
  const picked = atCompany.filter((person) => value.includes(person.id))

  const waitingFor = !companyId
    ? 'Choose the account first'
    : people.state === 'loading'
      ? 'Loading people…'
      : atCompany.length === 0
        ? 'No people at this account yet'
        : null

  const toggle = (personId: string) =>
    onChange(
      value.includes(personId)
        ? value.filter((id) => id !== personId)
        : [...value, personId]
    )

  return (
    <FieldWrap controlId={controlId} label="People" messageId={messageId}>
      <Menu
        items={atCompany.map((person) => ({
          label: person.name,
          description: person.title ?? undefined,
          checked: value.includes(person.id),
          onSelect: () => toggle(person.id)
        }))}
        label="People on this deal"
        trigger={
          <button
            className={cn(
              fieldControlClass({}),
              'flex h-8 items-center gap-2 pr-2.5 pl-3 text-left focus:bg-muted focus:shadow-none keyboard-focus:bg-background keyboard-focus:shadow-(--halo-field)',
              picked.length === 0 && 'text-faint'
            )}
            disabled={waitingFor !== null}
            id={controlId}
            type="button"
          >
            <span className="min-w-0 flex-1 truncate">
              {waitingFor ??
                (picked.length === 0
                  ? 'Choose people'
                  : picked.map((person) => person.name).join(', '))}
            </span>
            <span className="flex flex-none text-muted-foreground">
              <Icon icon={ArrowDown01Icon} size={14} />
            </span>
          </button>
        }
      />
    </FieldWrap>
  )
}
