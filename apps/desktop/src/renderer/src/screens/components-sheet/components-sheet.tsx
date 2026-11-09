import { useState, type ReactNode } from 'react'

import {
  Add01Icon,
  ArrowRight01Icon,
  Delete02Icon,
  Download04Icon,
  PencilEdit02Icon,
  SparklesIcon
} from '@hugeicons/core-free-icons'

import { AppShell, PageBody } from '@/components/sales/app-shell'
import { AskPanel } from '@/components/sales/ask/ask-panel'
import { useAskSession } from '@/components/sales/ask/use-ask-session'
import { DealStatus } from '@/components/sales/deal-status'
import {
  DEAL_STATUS_NONE,
  type TDealStatus
} from '@/components/sales/deal-status-config'
import { RenewalDialog } from '@/components/sales/renewal-dialog'
import {
  SalesSidebar,
  type TSidebarAccount
} from '@/components/sales/sales-sidebar'
import { Avatar, DividerLabel, Key } from '@/components/ui/bits'
import { Button } from '@/components/ui/button'
import {
  Checkbox,
  Chip,
  Radio,
  RadioGroup,
  Switch
} from '@/components/ui/controls'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { FilterToolbar, type TFilter } from '@/components/ui/filter-menu'
import { FloatBar } from '@/components/ui/float-bar'
import { Banner, StatTile } from '@/components/ui/kit'
import { Menu, type TMenuItem } from '@/components/ui/menu'
import { PageHeader } from '@/components/ui/page-header'
import { PickPill } from '@/components/ui/pick-pill'
import { SearchPill } from '@/components/ui/search-pill'
import { SectionHeader } from '@/components/ui/section-header'
import { StatePanel } from '@/components/ui/state-panel'
import {
  Dot,
  NumberBadge,
  ProgressRing,
  ProgressTrack,
  StatusDot,
  StatusPill,
  Tag
} from '@/components/ui/status'
import { Table } from '@/components/ui/table'
import { Tabs } from '@/components/ui/tabs'
import { ViewToggle, type TViewMode } from '@/components/ui/view-toggle'

import {
  COLOUR_GROUPS,
  SHEET_ASK_SCENARIOS,
  SHEET_RENEWAL_ITEM,
  SHEET_TABLE_COLUMNS,
  SHEET_TABLE_ROWS
} from './sheet-data'

const SHEET_MENU_ITEMS: TMenuItem[] = [
  { label: 'Open deal', hint: '⌘O' },
  { label: 'Rename', icon: PencilEdit02Icon },
  { label: 'Export', icon: Download04Icon },
  { line: true },
  { label: 'Delete', icon: Delete02Icon, danger: true }
]

const TABLE_MENU_ITEMS: TMenuItem[] = [
  { label: 'Rename', icon: PencilEdit02Icon },
  { line: true },
  { label: 'Remove', icon: Delete02Icon, danger: true }
]

const TAB_ITEMS = ['Timeline', 'Tasks', 'People', 'Files']
const FILTER_TABS = [
  { label: 'All', count: 24 },
  { label: 'Mine', count: 9 },
  { label: 'Going quiet', count: 3 }
]
const STAGE_OPTIONS = ['Contacted', 'Demo booked', 'Trial', 'Proposal']
const OWNER_OPTIONS = ['Asha Menon', 'Dan Okafor', 'Mei Tan']
const SHEET_FILTERS: TFilter[] = [
  {
    key: 'stage',
    name: 'Stage',
    options: [
      { label: 'Contacted', count: 8 },
      { label: 'Trial', count: 5 },
      { label: 'Proposal', count: 3 }
    ]
  },
  {
    key: 'owner',
    name: 'Owner',
    options: OWNER_OPTIONS.map((owner) => ({ label: owner }))
  }
]
const WAITING_ITEMS = [
  'Send pricing to Halden Capital',
  'Reply to Lumen Retail about the trial',
  'Confirm the renewal with Meridian Foods'
]

type TSheetSectionProps = { title: string; children: ReactNode }

const SheetSection = ({ title, children }: TSheetSectionProps) => (
  <section className="flex flex-col gap-3">
    <h2 className="m-0 text-base font-semibold">{title}</h2>
    {children}
  </section>
)

const PaletteSection = () => (
  <SheetSection title="Colours">
    <div className="grid grid-cols-3 gap-4">
      {COLOUR_GROUPS.map((group) => (
        <div
          key={group.title}
          className="flex flex-col gap-2 rounded-card bg-muted p-3"
        >
          <h3 className="m-0 text-body-sm font-semibold text-muted-foreground">
            {group.title}
          </h3>
          {group.swatches.map((swatch) => (
            <div key={swatch.name} className="flex items-center gap-3">
              <span
                className={`${swatch.swatchClass} size-7 flex-none rounded-sm shadow-(--shadow-swatch)`}
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold">
                  {swatch.name}
                </span>
                <span className="truncate text-body-sm text-muted-foreground">
                  {swatch.usage}
                </span>
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  </SheetSection>
)

const TypeSection = () => (
  <SheetSection title="Type">
    <div className="flex flex-col gap-2">
      <p className="m-0 text-display font-bold">Display, 28</p>
      <p className="m-0 text-title-xl font-bold">Page title, 20</p>
      <p className="m-0 text-heading font-bold">Dialog title, 17</p>
      <p className="m-0 text-base">Body, 14. Notes and AI answers.</p>
      <p className="m-0 text-body-lg">Text, 13. Lists, fields and buttons.</p>
      <p className="m-0 text-sm font-semibold">Label, 13. Buttons and chips.</p>
      <p className="m-0 text-body-sm text-muted-foreground">
        Meta, 12. Hints and dates.
      </p>
    </div>
  </SheetSection>
)

// Who the sidebar shows when no one is signed in (browser preview, tests).
const SAMPLE_ACCOUNT: TSidebarAccount = {
  name: 'Asha Menon',
  email: 'asha@example.com',
  initials: 'AM',
  roleLabel: 'Member'
}

type TComponentsSheetProps = {
  account?: TSidebarAccount
  onSignOut?: () => void
}

export const ComponentsSheet = ({
  account = SAMPLE_ACCOUNT,
  onSignOut
}: TComponentsSheetProps) => {
  const [viewMode, setViewMode] = useState<TViewMode>('list')
  const [activeTab, setActiveTab] = useState(0)
  const [activeFilter, setActiveFilter] = useState(0)
  const [isSwitchOn, setIsSwitchOn] = useState(true)
  const [isTicked, setIsTicked] = useState(true)
  const [chips, setChips] = useState(['Rep'])
  const [plan, setPlan] = useState('monthly')
  const [stage, setStage] = useState('Trial')
  const [owner, setOwner] = useState('Asha Menon')
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Record<string, string[]>>({})
  const [isWaitingOpen, setIsWaitingOpen] = useState(true)
  const [isAskOpen, setIsAskOpen] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [renewalMode, setRenewalMode] = useState<'start' | 'wont' | null>(null)
  const [demoStatus, setDemoStatus] = useState<TDealStatus>(DEAL_STATUS_NONE)
  const [noteStatus, setNoteStatus] = useState<TDealStatus>({
    status: 'Done',
    note: 'Dan joined late, but they want pricing.',
    files: [{ name: 'Demo notes.pdf', bytes: 182000 }]
  })

  const askSession = useAskSession({
    scenarios: SHEET_ASK_SCENARIOS,
    liveStage: 'Trial'
  })

  const pickedCount = Object.values(picked).flat().length
  const toggleChip = (chip: string) =>
    setChips(
      chips.includes(chip)
        ? chips.filter((other) => other !== chip)
        : [...chips, chip]
    )

  return (
    <AppShell
      aside={
        isAskOpen ? (
          <AskPanel
            context="Looking at Halden Capital"
            session={askSession}
            onClose={() => setIsAskOpen(false)}
          />
        ) : null
      }
      sidebar={
        <SalesSidebar
          account={account}
          active="today"
          waiting={3}
          onSignOut={onSignOut}
        />
      }
      title="Components"
    >
      <PageBody>
        <PageHeader
          actions={
            <>
              <Button
                leadIcon={SparklesIcon}
                size="lg"
                variant="secondary"
                onClick={() => setIsAskOpen(true)}
              >
                Ask AI
              </Button>
              <Button leadIcon={Add01Icon} size="lg">
                New deal
              </Button>
            </>
          }
          search={<SearchPill />}
          subtitle="The palette and every component in the app."
          title="Components"
        />

        <PaletteSection />
        <TypeSection />

        <SheetSection title="Buttons">
          <div className="flex flex-wrap items-center gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="white">White</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Delete</Button>
            <Button variant="link">Link</Button>
            <Button disabled>Disabled</Button>
            <Button loading>Saving</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">Small, 28</Button>
            <Button>Medium, 32</Button>
            <Button size="lg" trailIcon={ArrowRight01Icon}>
              Large, 36
            </Button>
            <Button aria-label="Add" leadIcon={Add01Icon} variant="secondary" />
            <Button aria-label="Add" leadIcon={Add01Icon} size="lg" />
          </div>
        </SheetSection>

        <SheetSection title="Fields">
          <div className="grid grid-cols-3 gap-4">
            <Field label="Account" placeholder="Halden Capital" />
            <Field
              kind="select"
              label="Stage"
              options={STAGE_OPTIONS}
              value={stage}
              onValueChange={setStage}
            />
            <Field
              defaultValue="36,000 GBP"
              error="Enter the value in dollars."
              label="Value"
            />
            <Field
              searchable
              hint="Type to find someone."
              kind="select"
              label="Owner"
              options={OWNER_OPTIONS}
              value={owner}
              onValueChange={setOwner}
            />
            <Field readOnly label="Created by" value="Asha Menon" />
            <div className="flex flex-col justify-end">
              <Field kind="search" placeholder="Search accounts" shortcut="/" />
            </div>
          </div>
          <Field
            hint="Only your team can see this."
            kind="textarea"
            label="Note"
            placeholder="What happened on the call?"
            rows={3}
          />
        </SheetSection>

        <SheetSection title="Choices">
          <div className="flex flex-wrap items-start gap-8">
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-body-lg">
                <Checkbox
                  checked={isTicked}
                  onCheckedChange={(checked) => setIsTicked(checked === true)}
                />
                Remind me before it closes
              </label>
              <label className="flex items-center gap-2 text-body-lg">
                <Switch checked={isSwitchOn} onCheckedChange={setIsSwitchOn} />
                Send me a daily summary
              </label>
            </div>
            <RadioGroup
              aria-label="Billing"
              value={plan}
              onValueChange={setPlan}
            >
              <label className="flex items-center gap-2 text-body-lg">
                <Radio value="monthly" />
                Billed monthly
              </label>
              <label className="flex items-center gap-2 text-body-lg">
                <Radio value="yearly" />
                Billed yearly
              </label>
            </RadioGroup>
            <div className="flex flex-wrap items-center gap-2">
              {['Rep', 'Manager', 'Admin'].map((chip) => (
                <Chip
                  key={chip}
                  active={chips.includes(chip)}
                  onClick={() => toggleChip(chip)}
                >
                  {chip}
                </Chip>
              ))}
              <Chip active count={12}>
                Open
              </Chip>
              <Chip count={4}>Closed</Chip>
            </div>
          </div>
        </SheetSection>

        <SheetSection title="Status and people">
          <div className="flex flex-wrap items-center gap-3">
            <Tag>Trial</Tag>
            <Tag tone="accent">Needs you</Tag>
            <Tag tone="success">Won</Tag>
            <Tag dot="success">Active</Tag>
            <Tag dot="faint">Invited</Tag>
            <StatusDot tone="success">Connected</StatusDot>
            <StatusDot tone="faint">Not sent</StatusDot>
            <StatusDot tone="destructive">Overdue</StatusDot>
            <StatusPill>Drafting the email</StatusPill>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Dot />3 unread
            </span>
            <span className="flex items-center gap-2 text-sm font-medium">
              Inbox <NumberBadge>12</NumberBadge>
            </span>
            <ProgressTrack
              inProgress
              className="w-40"
              done={2}
              label="Onboarding"
            />
            <span className="flex items-center gap-2 text-sm font-medium">
              <ProgressRing label="Quota" value={0.68} />
              68% of quota
            </span>
            <span className="flex items-center gap-2">
              <Avatar initials="PS" />
              <Avatar initials="DO" size={28} tone="muted" />
              <Avatar initials="MT" size={24} tone="foreground" />
            </span>
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              Search with <Key>⌘K</Key>
            </span>
          </div>
        </SheetSection>

        <SheetSection title="Deal status">
          <div className="grid max-w-160 grid-cols-2 gap-4">
            <DealStatus
              account="Lumen Retail"
              stage="Demo booked"
              value={demoStatus}
              onChange={setDemoStatus}
            />
            <DealStatus
              account="Halden Capital"
              stage="Demo booked"
              value={noteStatus}
              onChange={setNoteStatus}
            />
          </div>
        </SheetSection>

        <SheetSection title="Tabs, filters and views">
          <Tabs active={activeTab} items={TAB_ITEMS} onChange={setActiveTab} />
          <div className="flex flex-wrap items-center gap-4">
            <Tabs
              active={activeFilter}
              items={FILTER_TABS}
              variant="segmented"
              onChange={setActiveFilter}
            />
            <PickPill
              label="Owner"
              options={OWNER_OPTIONS}
              size="lg"
              value={owner}
              onChange={setOwner}
            />
            <ViewToggle value={viewMode} onChange={setViewMode} />
          </div>
          <FilterToolbar
            countLabel={pickedCount > 0 || query ? '5 of 24 deals' : '24 deals'}
            filters={SHEET_FILTERS}
            label="Filter deals"
            picked={picked}
            query={query}
            searchPlaceholder="Search deals"
            onClear={() => {
              setQuery('')
              setPicked({})
            }}
            onPickedChange={(key, next) =>
              setPicked({ ...picked, [key]: next })
            }
            onQueryChange={setQuery}
          />
        </SheetSection>

        <SheetSection title="Sections, banners and numbers">
          <div className="flex flex-col gap-2">
            <SectionHeader
              count={WAITING_ITEMS.length}
              open={isWaitingOpen}
              title="Waiting on you"
              onClick={() => setIsWaitingOpen(!isWaitingOpen)}
            />
            {isWaitingOpen ? (
              <ul className="m-0 flex list-none flex-col gap-1 p-0 pl-4">
                {WAITING_ITEMS.map((item) => (
                  <li
                    key={item}
                    className="flex min-h-8 items-center gap-2 text-body-lg"
                  >
                    <Dot size="sm" />
                    {item}
                  </li>
                ))}
              </ul>
            ) : null}
            <SectionHeader
              count={8}
              open={false}
              title="Later this week"
              tone="muted"
            />
          </div>
          <Banner>Most notes on a page sit in a banner like this one.</Banner>
          <Banner tone="accent">
            <Dot />3 proposals are waiting for you.
          </Banner>
          <div className="grid grid-cols-3 gap-4">
            <StatTile label="Open deals" value="24" />
            <StatTile label="Won this quarter" value="$182,000" />
            <StatTile label="Renewals in 90 days" value="6" />
          </div>
          <DividerLabel>or</DividerLabel>
        </SheetSection>

        <SheetSection title="Table">
          <Table
            resizable
            selectable
            barActions={[{ label: 'Change owner' }, { label: 'Export' }]}
            columns={SHEET_TABLE_COLUMNS}
            label="People"
            menuItems={TABLE_MENU_ITEMS}
            rows={SHEET_TABLE_ROWS}
            sortBy="name"
            onRowClick={() => setIsDialogOpen(true)}
          />
        </SheetSection>

        <SheetSection title="Menu, float bar and dialogs">
          <div className="flex flex-wrap items-center gap-2">
            <Menu
              items={SHEET_MENU_ITEMS}
              label="Deal"
              trigger={<Button variant="secondary">Open menu</Button>}
            />
            <Button variant="secondary" onClick={() => setIsDialogOpen(true)}>
              Dialog
            </Button>
            <Button variant="secondary" onClick={() => setIsConfirmOpen(true)}>
              Confirm dialog
            </Button>
            <Button variant="secondary" onClick={() => setRenewalMode('start')}>
              Start renewal
            </Button>
            <Button variant="secondary" onClick={() => setRenewalMode('wont')}>
              Won&apos;t renew
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <FloatBar text="Moved to Proposal" />
            <FloatBar
              actions={[{ label: 'Change owner' }]}
              count={3}
              kind="select"
            />
          </div>
        </SheetSection>

        <SheetSection title="Empty, error and loading">
          <div className="grid grid-cols-2 gap-4">
            <StatePanel kind="first" title="No deals yet" />
            <StatePanel kind="none" />
            <StatePanel kind="error" />
            <StatePanel kind="noaccess" />
          </div>
          <StatePanel kind="loading" />
        </SheetSection>
      </PageBody>

      <Dialog
        description="Changes are saved to the account and shown on its timeline."
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setIsDialogOpen(false)}>Save</Button>
          </>
        }
        open={isDialogOpen}
        title="Edit Priya Shah"
        onOpenChange={setIsDialogOpen}
      >
        <div className="grid grid-cols-2 gap-4">
          <Field defaultValue="Priya Shah" label="Name" />
          <Field defaultValue="Head of Operations" label="Job title" />
        </div>
      </Dialog>

      <ConfirmDialog
        danger
        body="They go to Recently deleted for 30 days, then they're gone for good."
        confirmLabel="Delete"
        open={isConfirmOpen}
        title="Delete 3 deals?"
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={() => setIsConfirmOpen(false)}
        onOpenChange={setIsConfirmOpen}
      />

      {renewalMode ? (
        <RenewalDialog
          item={SHEET_RENEWAL_ITEM}
          mode={renewalMode}
          onClose={() => setRenewalMode(null)}
          onDone={() => setRenewalMode(null)}
        />
      ) : null}
    </AppShell>
  )
}
