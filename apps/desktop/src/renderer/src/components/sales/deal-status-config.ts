import {
  Calendar03Icon,
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  CircleIcon,
  Clock01Icon,
  MailRemove01Icon,
  MailReply01Icon,
  PencilEdit02Icon,
  PlayCircleIcon,
  SentIcon,
  UserRemove01Icon,
  ViewIcon
} from '@hugeicons/core-free-icons'

import type { TIcon } from '@/components/ui/icon'

export type TStatusFile = { name: string; bytes: number }

export type TDealStatus = {
  status: string
  note: string
  files: TStatusFile[]
}

export type TStatusTone = 'idle' | 'now' | 'ok' | 'bad'

type TStatusLook = { icon: TIcon; tone: TStatusTone; prompt: string }

export const NOT_STARTED = 'Not started'
export const MAX_STATUS_FILES = 5

export const DEAL_STATUS_NONE: TDealStatus = {
  status: NOT_STARTED,
  note: '',
  files: []
}

// Note: Not started is the default in every stage and needs no note. These lists
// are a starting point; teams will be able to change them in Settings.
export const STATUSES_BY_STAGE: Record<string, string[]> = {
  Contacted: [
    NOT_STARTED,
    'Reached out',
    'Replied',
    'No reply',
    'Wrong contact'
  ],
  'Demo booked': [
    NOT_STARTED,
    'Started',
    'Done',
    'Not appeared',
    'Rescheduled',
    'Cancelled'
  ],
  Trial: [NOT_STARTED, 'Started', 'Extended', 'Finished', 'Cancelled'],
  Proposal: [
    NOT_STARTED,
    'Sent',
    'In review',
    'Changes asked',
    'Accepted',
    'Declined'
  ],
  Won: [NOT_STARTED, 'Setup started', 'Setup done'],
  Lost: [NOT_STARTED, 'Check back later', 'Closed for good']
}

export const STATUS_LOOKS: Record<string, TStatusLook> = {
  [NOT_STARTED]: { icon: CircleIcon, tone: 'idle', prompt: 'Add a note' },
  'Reached out': {
    icon: SentIcon,
    tone: 'now',
    prompt: 'How did you reach them?'
  },
  Replied: {
    icon: MailReply01Icon,
    tone: 'ok',
    prompt: 'What did they say?'
  },
  'No reply': {
    icon: MailRemove01Icon,
    tone: 'bad',
    prompt: 'When will you try again?'
  },
  'Wrong contact': {
    icon: UserRemove01Icon,
    tone: 'bad',
    prompt: 'Who should you speak to instead?'
  },
  Started: {
    icon: PlayCircleIcon,
    tone: 'now',
    prompt: 'Who is there, and what is the plan?'
  },
  Done: {
    icon: CheckmarkCircle02Icon,
    tone: 'ok',
    prompt: 'How did it go?'
  },
  'Not appeared': {
    icon: UserRemove01Icon,
    tone: 'bad',
    prompt: 'What happened, and did you follow up?'
  },
  Rescheduled: {
    icon: Calendar03Icon,
    tone: 'now',
    prompt: 'What is the new date, and why did it move?'
  },
  Cancelled: {
    icon: CancelCircleIcon,
    tone: 'bad',
    prompt: 'Why was it cancelled?'
  },
  Extended: {
    icon: Clock01Icon,
    tone: 'now',
    prompt: 'Until when, and why?'
  },
  Finished: {
    icon: CheckmarkCircle02Icon,
    tone: 'ok',
    prompt: 'How did it go?'
  },
  Sent: {
    icon: SentIcon,
    tone: 'now',
    prompt: 'What did you send, and to whom?'
  },
  'In review': {
    icon: ViewIcon,
    tone: 'now',
    prompt: 'Who is reviewing it?'
  },
  'Changes asked': {
    icon: PencilEdit02Icon,
    tone: 'now',
    prompt: 'What do they want changed?'
  },
  Accepted: {
    icon: CheckmarkCircle02Icon,
    tone: 'ok',
    prompt: 'Anything to remember?'
  },
  Declined: {
    icon: CancelCircleIcon,
    tone: 'bad',
    prompt: 'Why did they say no?'
  },
  'Setup started': {
    icon: PlayCircleIcon,
    tone: 'now',
    prompt: 'What is left to set up?'
  },
  'Setup done': {
    icon: CheckmarkCircle02Icon,
    tone: 'ok',
    prompt: 'Anything to remember?'
  },
  'Check back later': {
    icon: Clock01Icon,
    tone: 'now',
    prompt: 'When should someone check back?'
  },
  'Closed for good': {
    icon: CancelCircleIcon,
    tone: 'bad',
    prompt: 'Why is this closed for good?'
  }
}

export const STATUS_TONE_CLASS: Record<TStatusTone, string> = {
  idle: 'text-muted-foreground',
  now: 'text-foreground-soft',
  ok: 'text-success',
  bad: 'text-destructive'
}

export const statusLookFor = (status: string): TStatusLook =>
  STATUS_LOOKS[status] ?? STATUS_LOOKS[NOT_STARTED]

export const formatFileSize = (bytes: number) =>
  bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
