import {
  Mail01Icon,
  Note01Icon,
  SparklesIcon,
  SquareLock02Icon
} from '@hugeicons/core-free-icons'

import type { TAskScenario } from '@/components/sales/ask/ask-types'
import type { TRenewalItem } from '@/components/sales/renewal-dialog'
import type { TTableColumn, TTableRow } from '@/components/ui/table'

type TSwatch = { name: string; swatchClass: string; usage: string }

export const COLOUR_GROUPS: { title: string; swatches: TSwatch[] }[] = [
  {
    title: 'Surfaces and text',
    swatches: [
      {
        name: 'background',
        swatchClass: 'bg-background',
        usage: 'Pages and raised cards'
      },
      {
        name: 'muted',
        swatchClass: 'bg-muted',
        usage: 'Cards, tiles, fields, sidebar'
      },
      {
        name: 'foreground',
        swatchClass: 'bg-foreground',
        usage: 'Body text and icons'
      },
      {
        name: 'foreground-soft',
        swatchClass: 'bg-foreground-soft',
        usage: 'Text on tags and chips'
      },
      {
        name: 'muted-foreground',
        swatchClass: 'bg-muted-foreground',
        usage: 'Helper and meta text'
      },
      { name: 'faint', swatchClass: 'bg-faint', usage: 'Placeholders' }
    ]
  },
  {
    title: 'Buttons and lines',
    swatches: [
      {
        name: 'primary',
        swatchClass: 'bg-primary',
        usage: 'The one main button'
      },
      {
        name: 'secondary',
        swatchClass: 'bg-secondary',
        usage: 'Grey buttons and chips'
      },
      {
        name: 'border',
        swatchClass: 'bg-border',
        usage: 'Hairlines and dividers'
      },
      {
        name: 'input',
        swatchClass: 'bg-input',
        usage: 'Empty tracks, switch off'
      }
    ]
  },
  {
    title: 'Accent and status',
    swatches: [
      {
        name: 'accent',
        swatchClass: 'bg-accent',
        usage: 'Dots, counts, progress'
      },
      {
        name: 'accent-soft',
        swatchClass: 'bg-accent-soft',
        usage: 'Needs you'
      },
      { name: 'ring', swatchClass: 'bg-ring', usage: 'Keyboard focus' },
      {
        name: 'success',
        swatchClass: 'bg-success',
        usage: 'Status marks only'
      },
      {
        name: 'success-soft',
        swatchClass: 'bg-success-soft',
        usage: 'Status tag'
      },
      {
        name: 'destructive',
        swatchClass: 'bg-destructive',
        usage: 'Delete and errors'
      }
    ]
  }
]

export const SHEET_TABLE_COLUMNS: TTableColumn[] = [
  {
    key: 'name',
    label: 'Name',
    type: 'person',
    sortable: true,
    width: 'minmax(0, 2fr)'
  },
  {
    key: 'role',
    label: 'Role',
    type: 'select',
    options: ['Admin', 'Rep', 'Viewer'],
    sortable: true,
    width: 'minmax(112px, 1fr)'
  },
  { key: 'status', label: 'Status', type: 'tag', width: '130px' },
  {
    key: 'seen',
    label: 'Last active',
    type: 'muted',
    sortable: true,
    width: '120px',
    align: 'right'
  }
]

export const SHEET_TABLE_ROWS: TTableRow[] = [
  {
    id: 'priya',
    name: { text: 'Priya Shah', sub: 'Halden Capital', initials: 'PS' },
    role: 'Admin',
    status: { text: 'Active', dot: 'success' },
    seen: 'Today'
  },
  {
    id: 'dan',
    name: { text: 'Dan Okafor', sub: 'Halden Capital', initials: 'DO' },
    role: 'Rep',
    status: { text: 'Invited', dot: 'faint' },
    seen: '3 days ago'
  },
  {
    id: 'mei',
    name: { text: 'Mei Tan', sub: 'Lumen Retail', initials: 'MT' },
    role: 'Viewer',
    status: { text: 'Active', dot: 'success' },
    seen: 'Last week'
  }
]

export const SHEET_RENEWAL_ITEM: TRenewalItem = {
  account: 'Meridian Foods',
  value: 36000,
  endDate: '2026-12-05',
  owner: 'Asha Menon'
}

// Sample questions for the Ask AI panel. The answers are scripted for now.
export const SHEET_ASK_SCENARIOS: TAskScenario[] = [
  {
    id: 'catch',
    label: 'Catch me up on this deal',
    icon: SparklesIcon,
    steps: [
      'Reading this deal and its timeline',
      'Checking emails and meetings',
      'Comparing with your last call note'
    ],
    bullets: [
      {
        text: 'Their trial ends on 28 November. Dan has joined the last two meetings, so the budget holder is involved now.',
        source: 'Meetings'
      },
      {
        text: 'On your 29 October call, Priya asked for pricing for 25 seats from January.',
        source: 'Call note, 29 October'
      },
      {
        text: 'Nothing has gone out since, and your task to send pricing was due on Monday.',
        source: 'Task'
      }
    ],
    cards: [
      {
        id: 'stage',
        kind: 'stage',
        title: 'Move this deal to Proposal',
        why: 'They asked for pricing, so it has moved past the trial stage.',
        rows: [{ label: 'Stage', from: 'Trial', to: 'Proposal' }],
        doneText: 'Moved to Proposal, and logged on the timeline'
      }
    ],
    follow: ['email', 'notes']
  },
  {
    id: 'email',
    label: 'Draft the pricing email to Priya',
    icon: Mail01Icon,
    steps: ['Reading your call note', 'Reading shared pricing facts'],
    email: {
      to: 'Priya Shah',
      subject: 'Pricing for 25 seats from January',
      body: 'Hi Priya,\n\nGood to talk last week. Here is the pricing you asked for: [YOUR PRICE] a year for 25 seats, starting in January.\n\nDan asked how long setup takes, so I have added our usual onboarding plan.\n\nCould we talk on Tuesday, before your trial ends on the 28th?\n\nAsha'
    },
    follow: ['catch']
  },
  {
    id: 'notes',
    label: 'I just finished a call. Here are my notes',
    icon: Note01Icon,
    askNotes: true,
    steps: ['Reading your notes', 'Matching them to this deal'],
    intro: 'Here is what I would save. Approve what you want to keep.',
    cards: [
      {
        id: 'note',
        kind: 'note',
        title: 'Save this as the call note',
        rows: [
          {
            label: 'Note',
            to: 'Priya and Dan want 25 seats from January. Dan needs pricing by Friday for his budget review. Worried about how long setup will take.'
          }
        ],
        doneText: 'Call note saved to the timeline'
      },
      {
        id: 'task',
        kind: 'task',
        title: 'Add a task',
        rows: [
          { label: 'Task', to: 'Send Dan pricing and the onboarding plan' },
          { label: 'Due', to: 'Friday' }
        ],
        doneText: 'Task added for Friday'
      }
    ]
  },
  {
    id: 'blocked',
    label: 'How much do they use the product?',
    icon: SquareLock02Icon,
    steps: ['Checking which tools are connected'],
    blocked:
      "Product usage isn't connected yet, so I can only see what is in the pipeline. An admin can connect it in Settings.",
    follow: ['catch']
  }
]
