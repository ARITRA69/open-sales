import type { TContract } from '@open-sales/shared'
import { daysBetween } from '@open-sales/shared'
import { AnimatePresence, motion } from 'motion/react'

import { Link } from '@/components/shared/link'
import { Avatar } from '@/components/ui/bits'
import { Button } from '@/components/ui/button'
import { Tag } from '@/components/ui/status'
import { formatShortDate } from '@/lib/dates'
import { getInitials } from '@/lib/initials'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

// Dates, money and state keep fixed widths so rows line up; the account and
// its owner share what's left.
const COLUMNS =
  'grid grid-cols-[minmax(0,2fr)_104px_96px_minmax(0,1.2fr)_88px_196px] items-center gap-3 px-2'

const ROW_LINK =
  'rounded-sm text-foreground no-underline outline-none hover:underline keyboard-focus:shadow-(--halo-keyboard)'

const ROW_SPRING = {
  type: 'spring' as const,
  stiffness: 480,
  damping: 42,
  mass: 0.8
}

/** "In 18 days", "Tomorrow", "4 days overdue": how far off a renewal is. */
export const dueText = (days: number): string => {
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return '1 day overdue'
  return days > 0 ? `In ${days} days` : `${-days} days overdue`
}

const StateTag = ({
  contract,
  isOverdue
}: {
  contract: TContract
  isOverdue: boolean
}) => {
  switch (contract.status) {
    case 'renewing':
      return <Tag tone="accent">Renewing</Tag>
    case 'renewed':
      return <Tag tone="success">Renewed</Tag>
    case 'ended':
      return <Tag>Ended</Tag>
    default:
      return isOverdue ? (
        <Tag dot="destructive">Overdue</Tag>
      ) : (
        <Tag>Active</Tag>
      )
  }
}

type TContractListProps = {
  contracts: TContract[]
  // "2026-11-10": what "in 18 days" is counted from.
  today: string
  // The contract being reopened, while the server answers.
  reopeningId: string | null
  onStart: (contract: TContract) => void
  onWontRenew: (contract: TContract) => void
  onReopen: (contract: TContract) => void
}

/**
 * Contracts by renewal date, one per row: the account, when it renews, what
 * it's worth, who owns it and where it stands, with what can be done next.
 * Rows glide into place when one leaves the list.
 */
export const ContractList = ({
  contracts,
  today,
  reopeningId,
  onStart,
  onWontRenew,
  onReopen
}: TContractListProps) => (
  <div
    aria-label="Renewals"
    className="flex w-full flex-col text-foreground"
    role="table"
  >
    <div
      className={cn(
        COLUMNS,
        'min-h-8 text-body-sm font-semibold whitespace-nowrap text-muted-foreground'
      )}
      role="row"
    >
      <span role="columnheader">Account</span>
      <span role="columnheader">Renewal date</span>
      <span className="text-right" role="columnheader">
        Value
      </span>
      <span role="columnheader">Owner</span>
      <span role="columnheader">State</span>
      <span role="columnheader">
        <span className="sr-only">What you can do</span>
      </span>
    </div>
    <div className="relative" role="rowgroup">
      <AnimatePresence initial={false} mode="popLayout">
        {contracts.map((contract) => {
          const days = daysBetween(today, contract.renewsOn)
          const isOpen =
            contract.status === 'active' || contract.status === 'renewing'
          const isOverdue = contract.status === 'active' && days < 0
          const { renewalDeal } = contract
          // Under the name: why it ended, else the deal it came from.
          const detail =
            contract.status === 'ended'
              ? (contract.endReason ?? '')
              : (contract.deal?.name ?? '')

          return (
            <motion.div
              key={contract.id}
              animate={{ opacity: 1 }}
              className={cn(
                COLUMNS,
                'relative min-h-11 rounded-row py-1 text-sm transition-colors duration-150 hover:bg-muted',
                'before:pointer-events-none before:absolute before:inset-x-2 before:bottom-0 before:h-px before:bg-border before:transition-opacity before:duration-150',
                'last:before:opacity-0 hover:before:opacity-0'
              )}
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              layout="position"
              role="row"
              transition={{ layout: ROW_SPRING, opacity: { duration: 0.15 } }}
            >
              <span className="flex min-w-0 flex-col" role="cell">
                <Link
                  className={cn(ROW_LINK, 'truncate font-semibold')}
                  href={`#/accounts/${contract.company.id}`}
                >
                  {contract.company.name}
                </Link>
                {detail ? (
                  <span className="truncate text-body-sm text-muted-foreground">
                    {detail}
                  </span>
                ) : null}
              </span>
              <span className="flex min-w-0 flex-col" role="cell">
                <span className="truncate tabular-nums">
                  {formatShortDate(contract.renewsOn)}
                </span>
                {isOpen ? (
                  <span
                    className={cn(
                      'truncate text-body-sm',
                      isOverdue ? 'text-destructive' : 'text-muted-foreground'
                    )}
                  >
                    {dueText(days)}
                  </span>
                ) : null}
              </span>
              <span className="truncate text-right tabular-nums" role="cell">
                {formatMoney(contract.valueMinor, contract.currency)}
              </span>
              <span className="flex min-w-0 items-center gap-2" role="cell">
                <Avatar initials={getInitials(contract.owner.name)} size={24} />
                <span className="truncate">{contract.owner.name}</span>
              </span>
              <span className="flex min-w-0" role="cell">
                <StateTag contract={contract} isOverdue={isOverdue} />
              </span>
              <span className="flex min-w-0 justify-end gap-1" role="cell">
                {contract.status === 'active' && contract.canEdit ? (
                  <>
                    <Button
                      aria-label={`Start renewal for ${contract.company.name}`}
                      size="sm"
                      variant="secondary"
                      onClick={() => onStart(contract)}
                    >
                      Start renewal
                    </Button>
                    <Button
                      aria-label={`Won’t renew, ${contract.company.name}`}
                      size="sm"
                      variant="ghost"
                      onClick={() => onWontRenew(contract)}
                    >
                      Won’t renew
                    </Button>
                  </>
                ) : null}
                {contract.status !== 'active' && renewalDeal ? (
                  <Button
                    aria-label={`Open deal ${renewalDeal.name}`}
                    href={`#/deals/${renewalDeal.id}`}
                    size="sm"
                    variant={
                      contract.status === 'renewing' ? 'secondary' : 'ghost'
                    }
                  >
                    Open deal
                  </Button>
                ) : null}
                {contract.status === 'ended' && contract.canEdit ? (
                  <Button
                    aria-label={`Reopen ${contract.company.name}`}
                    loading={reopeningId === contract.id}
                    size="sm"
                    variant="ghost"
                    onClick={() => onReopen(contract)}
                  >
                    Reopen
                  </Button>
                ) : null}
              </span>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  </div>
)
