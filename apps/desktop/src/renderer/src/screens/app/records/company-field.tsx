import { Field } from '@/components/ui/field'
import type { TRecordsBridge } from '@/hooks/use-records'
import { useRecordList } from '@/hooks/use-records'

// Enough for a small team's own accounts; a search box filters them.
const COMPANY_CHOICES = 200

type TCompanyFieldProps = {
  bridge: TRecordsBridge
  value: string
  // The current company, so it shows before the list loads.
  current: { id: string; name: string } | null
  onChange: (companyId: string) => void
  label?: string
}

/**
 * Which account something belongs to. Lists the accounts this person may
 * change, since only those can take new people and deals.
 */
export const CompanyField = ({
  bridge,
  value,
  current,
  onChange,
  label = 'Account'
}: TCompanyFieldProps) => {
  const companies = useRecordList(bridge, 'companies', {
    limit: COMPANY_CHOICES
  })
  const options = companies.items
    .filter((company) => company.canEdit)
    .map((company) => ({ label: company.name, value: company.id }))
  if (current && !options.some((option) => option.value === current.id)) {
    options.unshift({ label: current.name, value: current.id })
  }

  return (
    <Field
      searchable
      kind="select"
      label={label}
      options={options}
      placeholder={
        companies.state === 'loading'
          ? 'Loading accounts…'
          : 'Choose an account'
      }
      value={value}
      onValueChange={onChange}
    />
  )
}
