import type { TOwner } from '@open-sales/shared'

import { Field } from '@/components/ui/field'

type TOwnerFieldProps = {
  value: string
  // The current owner's name, for when the list hasn't loaded.
  ownerName: string
  users: TOwner[]
  // Only managers and admins give records to someone else.
  canChoose: boolean
  onChange: (userId: string) => void
}

/** Who owns a record: a choice for managers and admins, plain text otherwise. */
export const OwnerField = ({
  value,
  ownerName,
  users,
  canChoose,
  onChange
}: TOwnerFieldProps) =>
  canChoose && users.length > 0 ? (
    <Field
      searchable
      kind="select"
      label="Owner"
      options={users.map((user) => ({ label: user.name, value: user.id }))}
      value={value}
      onValueChange={onChange}
    />
  ) : (
    <Field readOnly label="Owner" value={ownerName} />
  )
