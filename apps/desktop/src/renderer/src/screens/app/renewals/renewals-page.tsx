import { useEffect, useState } from 'react'

import { RefreshIcon } from '@hugeicons/core-free-icons'
import type {
  TContract,
  TContractCandidate,
  TContractCandidateQueryInput,
  TContractCreate,
  TContractListQueryInput,
  TRenewalWindow
} from '@open-sales/shared'
import { RENEWAL_WINDOWS, termMonths } from '@open-sales/shared'
import { AnimatePresence } from 'motion/react'

import { PageBody } from '@/components/sales/app-shell'
import {
  RenewalDialog,
  type TRenewalResult
} from '@/components/sales/renewal-dialog'
import { Link } from '@/components/shared/link'
import { Button } from '@/components/ui/button'
import { FloatBar } from '@/components/ui/float-bar'
import { PageHeader } from '@/components/ui/page-header'
import { PickPill } from '@/components/ui/pick-pill'
import { StatePanel } from '@/components/ui/state-panel'
import { Tabs } from '@/components/ui/tabs'
import { useCall } from '@/hooks/use-records'
import { formatFieldDate, formatShortDate, toIsoDay } from '@/lib/dates'
import { formatMoney, parseMoney } from '@/lib/money'

import type { TApiResult } from '../../../../../preload/bridge-types'
import { EmptyPage } from '../empty-page'
import { AddContractDialog } from './add-contract-dialog'
import { ContractList } from './contract-list'
import {
  findRenewalsBridge,
  type TRecordsBridge,
  type TRenewalsBridge
} from './renewals-bridge'
import { usePages } from './use-pages'

// Everyone's, mine, and the ones that are finished.
type TView = 0 | 1 | 2

const VIEWS = ['All renewals', 'My renewals', 'Closed']

const WINDOW_OPTIONS = RENEWAL_WINDOWS.map((days) => ({
  label: `Next ${days} days`,
  value: String(days)
}))

// How long "Renewal started" stays up.
const NOTICE_MS = 8000

type TOpenDialog =
  | { kind: 'start' | 'wont'; contract: TContract }
  | { kind: 'add'; candidate: TContractCandidate }

// Something that just happened, with the deal it made if there is one.
type TNotice = { text: string; dealId?: string }

/** "12 months" or "2 years": a contract's length, when it's a whole one. */
const termText = (contract: TContract) => {
  const months = termMonths(contract.startsOn, contract.renewsOn)
  const dates = `${formatFieldDate(contract.startsOn)} to ${formatFieldDate(contract.renewsOn)}`
  if (!months) return dates
  const length =
    months % 12 === 0
      ? `${months / 12} ${months === 12 ? 'year' : 'years'}`
      : `${months} ${months === 1 ? 'month' : 'months'}`
  return `${dates} (${length})`
}

type TRenewalsProps = {
  bridge: TRenewalsBridge
  recordsBridge: TRecordsBridge | null
  today: string
}

const Renewals = ({ bridge, recordsBridge, today }: TRenewalsProps) => {
  const [view, setView] = useState<TView>(0)
  const [windowDays, setWindowDays] = useState<TRenewalWindow>(90)
  const [open, setOpen] = useState<TOpenDialog | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [reopeningId, setReopeningId] = useState<string | null>(null)
  const [notice, setNotice] = useState<TNotice | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const isClosedView = view === 2
  const owner = view === 1 ? ('me' as const) : ('anyone' as const)
  const contracts = usePages<TContractListQueryInput, TContract>(bridge.list, {
    view: isClosedView ? ('closed' as const) : ('upcoming' as const),
    window: windowDays,
    owner
  })
  const candidates = usePages<TContractCandidateQueryInput, TContractCandidate>(
    bridge.listCandidates,
    { owner }
  )
  // The stages a renewal can start in. Without records, the server picks.
  const pipeline = useCall(recordsBridge?.getPipeline ?? null)
  const stages = (pipeline.data?.stages ?? [])
    .filter((stage) => stage.kind === 'open')
    .map((stage) => ({ label: stage.name, value: stage.id }))

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  const reloadAll = () => {
    contracts.reload()
    candidates.reload()
  }

  const closeDialog = () => {
    setOpen(null)
    setProblem(null)
  }

  const openDialog = (next: TOpenDialog) => {
    setProblem(null)
    setOpen(next)
  }

  /** Runs a dialog's call; on success closes it, else shows why not. */
  const settle = async (
    call: () => Promise<TApiResult<TContract>>,
    noticeFor: (saved: TContract) => TNotice
  ) => {
    setIsBusy(true)
    const answer = await call()
    setIsBusy(false)
    if (!answer.ok) {
      setProblem(answer.message)
      // Someone else got there first: show what's true now.
      if (answer.code === 'changed_since') reloadAll()
      return
    }
    closeDialog()
    setNotice(noticeFor(answer.data))
    reloadAll()
  }

  // The dialog's contract as the list now has it, so a second try after
  // "someone changed this" goes out with the new version.
  const openContract =
    open && open.kind !== 'add'
      ? (contracts.items.find((each) => each.id === open.contract.id) ??
        open.contract)
      : null

  const handleRenewalDone = (contract: TContract, result: TRenewalResult) => {
    if (result.mode === 'wont') {
      void settle(
        () =>
          bridge.endContract(contract.id, {
            version: contract.version,
            reason: result.reason
          }),
        (saved) => ({ text: `${saved.company.name} won’t renew` })
      )
      return
    }
    const valueMinor = parseMoney(result.value)
    if (valueMinor === undefined) {
      setProblem('Enter an amount like 12,500.')
      return
    }
    void settle(
      () =>
        bridge.startRenewal(contract.id, {
          version: contract.version,
          valueMinor,
          closeDate: result.closeDate || null,
          stageId: result.stage || undefined
        }),
      (saved) => ({
        text: `Renewal started for ${saved.company.name}`,
        dealId: saved.renewalDeal?.id
      })
    )
  }

  const handleAdd = (input: TContractCreate) =>
    void settle(
      () => bridge.createContract(input),
      (saved) => ({ text: `Contract added for ${saved.company.name}` })
    )

  const handleReopen = async (contract: TContract) => {
    setReopeningId(contract.id)
    const answer = await bridge.reopenContract(contract.id, contract.version)
    setReopeningId(null)
    setNotice({
      text: answer.ok
        ? `${contract.company.name} is active again`
        : answer.message
    })
    reloadAll()
  }

  return (
    <PageBody>
      <PageHeader subtitle="Contracts that renew soon." title="Renewals" />
      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          active={view}
          items={VIEWS}
          label="Which renewals"
          variant="segmented"
          onChange={(index) => setView(index as TView)}
        />
        {isClosedView ? null : (
          <PickPill
            label="Renewing in"
            options={WINDOW_OPTIONS}
            size="md"
            value={String(windowDays)}
            onChange={(days) => setWindowDays(Number(days) as TRenewalWindow)}
          />
        )}
      </div>

      {contracts.state === 'loading' ? (
        <StatePanel kind="loading" />
      ) : contracts.state === 'error' ? (
        <StatePanel
          body={contracts.problem ?? undefined}
          kind="error"
          onAction={contracts.reload}
        />
      ) : contracts.items.length === 0 ? (
        <StatePanel
          action=""
          body={
            isClosedView
              ? 'Contracts that were renewed, or that ended, will show here.'
              : `Contracts renewing in the next ${windowDays} days will show here.`
          }
          icon={RefreshIcon}
          title={isClosedView ? 'Nothing closed yet' : 'No renewals coming up'}
        />
      ) : (
        <ContractList
          contracts={contracts.items}
          reopeningId={reopeningId}
          today={today}
          onReopen={handleReopen}
          onStart={(contract) => openDialog({ kind: 'start', contract })}
          onWontRenew={(contract) => openDialog({ kind: 'wont', contract })}
        />
      )}
      {contracts.hasMore ? (
        <Button
          className="self-center"
          loading={isLoadingMore}
          variant="secondary"
          onClick={async () => {
            setIsLoadingMore(true)
            await contracts.loadMore()
            setIsLoadingMore(false)
          }}
        >
          Load more
        </Button>
      ) : null}

      {!isClosedView && candidates.items.length > 0 ? (
        <section className="mt-2 flex flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <h2 className="m-0 text-sm font-semibold">
              Won deals without a contract
            </h2>
            <p className="m-0 text-body-sm text-muted-foreground">
              Add a contract to a won deal, and its renewal shows above when the
              date gets close.
            </p>
          </div>
          <ul className="m-0 flex list-none flex-col rounded-card bg-muted px-3 py-0.5">
            {candidates.items.map((candidate) => (
              <li
                key={candidate.deal.id}
                className="flex min-h-11 items-center gap-3 border-b border-border py-1.5 last:border-b-0"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <Link
                    className="self-start truncate rounded-sm text-sm font-semibold text-foreground no-underline outline-none hover:underline keyboard-focus:shadow-(--halo-keyboard)"
                    href={`#/deals/${candidate.deal.id}`}
                  >
                    {candidate.deal.name}
                  </Link>
                  <span className="truncate text-body-sm text-muted-foreground">
                    {candidate.closeDate
                      ? `${candidate.company.name} · Won ${formatShortDate(candidate.closeDate)}`
                      : candidate.company.name}
                  </span>
                </span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {formatMoney(candidate.valueMinor, candidate.currency)}
                </span>
                {candidate.canEdit ? (
                  <Button
                    aria-label={`Add contract for ${candidate.deal.name}`}
                    size="sm"
                    variant="white"
                    onClick={() => openDialog({ kind: 'add', candidate })}
                  >
                    Add contract
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {candidates.hasMore ? (
            <Button
              className="self-start"
              size="sm"
              variant="ghost"
              onClick={() => void candidates.loadMore()}
            >
              Show more
            </Button>
          ) : null}
        </section>
      ) : null}

      {open && open.kind !== 'add' && openContract ? (
        <RenewalDialog
          key={`${open.kind}-${openContract.id}`}
          busy={isBusy}
          item={{
            account: openContract.company.name,
            value: openContract.valueMinor / 100,
            endDate: openContract.renewsOn,
            owner: openContract.owner.name,
            currency: openContract.currency,
            term: termText(openContract)
          }}
          mode={open.kind}
          problem={problem}
          stages={stages}
          onClose={closeDialog}
          onDone={(result) => handleRenewalDone(openContract, result)}
        />
      ) : null}
      {open?.kind === 'add' ? (
        <AddContractDialog
          key={open.candidate.deal.id}
          busy={isBusy}
          candidate={open.candidate}
          problem={problem}
          onClose={closeDialog}
          onSubmit={handleAdd}
        />
      ) : null}

      <AnimatePresence>
        {notice ? (
          <div
            key="notice"
            className="pointer-events-none sticky bottom-4 z-30 mt-3 flex justify-center"
          >
            <FloatBar
              actions={
                notice.dealId
                  ? [
                      {
                        label: 'Open deal',
                        onClick: () => {
                          window.location.hash = `#/deals/${notice.dealId}`
                        }
                      }
                    ]
                  : []
              }
              text={notice.text}
              onClose={() => setNotice(null)}
            />
          </div>
        ) : null}
      </AnimatePresence>
    </PageBody>
  )
}

type TRenewalsPageProps = {
  // Left out, the page finds its own: the app's, or the preview's pretend one.
  bridge?: TRenewalsBridge | null
  // For the pipeline's stages in the renewal dialog.
  recordsBridge?: TRecordsBridge | null
  // "2026-11-10". Passed in so tests can pick the day.
  today?: string
}

/**
 * Contracts by renewal date, with Start renewal and Won't renew on each,
 * and under them the won deals that still need a contract.
 */
export const RenewalsPage = ({
  bridge,
  recordsBridge = null,
  today
}: TRenewalsPageProps) => {
  const found =
    bridge === undefined ? findRenewalsBridge(recordsBridge) : bridge

  return found ? (
    <Renewals
      bridge={found}
      recordsBridge={recordsBridge}
      today={today ?? toIsoDay(new Date())}
    />
  ) : (
    <EmptyPage page="renewals" />
  )
}
