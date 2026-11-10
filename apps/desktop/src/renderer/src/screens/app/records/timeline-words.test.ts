import type { TTimelineItem } from '@open-sales/shared'
import { describe, expect, it } from 'vitest'

import {
  describeActor,
  describeChangeItem,
  describeStageItem,
  joinNames
} from './timeline-words'
import { formatDue, formatWhen, isOverdue, toMoment } from './when'

type TChange = Extract<TTimelineItem, { kind: 'change' }>

const change = (fields: Partial<TChange>): TChange => ({
  kind: 'change',
  id: '1',
  at: '2026-11-01T09:00:00.000Z',
  upcoming: false,
  actor: { id: 'u1', name: 'Asha Menon' },
  via: 'app',
  action: 'update',
  changes: [],
  ...fields
})

describe('describeChangeItem', () => {
  it('says what was added, archived and restored', () => {
    expect(describeChangeItem(change({ action: 'create' }), 'company')).toBe(
      'added this account'
    )
    expect(describeChangeItem(change({ action: 'archive' }), 'person')).toBe(
      'archived this person'
    )
    expect(describeChangeItem(change({ action: 'restore' }), 'deal')).toBe(
      'restored this deal'
    )
  })

  it('spells out each field that changed', () => {
    expect(
      describeChangeItem(
        change({
          changes: [
            { field: 'ownerId', from: 'Ravi Shah', to: 'Lena Ortiz' },
            { field: 'industry', from: null, to: 'Finance' },
            { field: 'domain', from: 'old.com', to: null }
          ]
        }),
        'company'
      )
    ).toBe(
      'changed the owner from Ravi Shah to Lena Ortiz, set the industry to Finance and cleared the website (was old.com)'
    )
  })

  it('shows money and days as people read them, and keeps long text short', () => {
    const said = describeChangeItem(
      change({
        changes: [
          { field: 'valueMinor', from: 1_800_000, to: 2_500_000 },
          { field: 'description', from: 'Old words', to: 'New words' }
        ]
      }),
      'deal',
      'USD'
    )
    expect(said).toContain('changed the value from')
    expect(said).toContain('18,000')
    expect(said).toContain('25,000')
    expect(said).toContain('updated the description')
    expect(said).not.toContain('New words')
  })
})

describe('describeStageItem', () => {
  const move: Extract<TTimelineItem, { kind: 'stage' }> = {
    kind: 'stage',
    id: '1',
    at: '2026-11-01T09:00:00.000Z',
    upcoming: false,
    actor: null,
    deal: { id: 'd1', name: 'Platform rollout' },
    from: { id: 's1', name: 'Discovery' },
    to: { id: 's2', name: 'Proposal' }
  }

  it('names the deal on an account, and not on the deal itself', () => {
    expect(describeStageItem(move, false)).toBe(
      'moved Platform rollout from Discovery to Proposal'
    )
    expect(describeStageItem(move, true)).toBe(
      'moved this deal from Discovery to Proposal'
    )
    expect(describeStageItem({ ...move, from: null }, true)).toBe(
      'added this deal in Proposal'
    )
  })
})

describe('describeActor', () => {
  it('tells AI changes from people’s', () => {
    expect(describeActor({ name: 'Asha Menon' })).toBe('Asha Menon')
    expect(describeActor({ name: 'Asha Menon' }, 'ai_proposal')).toBe(
      'AI, approved by Asha Menon'
    )
    expect(describeActor(null)).toBe('The system')
  })
})

describe('joinNames', () => {
  it('reads like a sentence', () => {
    expect(joinNames([{ name: 'Priya' }])).toBe('Priya')
    expect(joinNames([{ name: 'Priya' }, { name: 'Tom' }])).toBe(
      'Priya and Tom'
    )
    expect(
      joinNames([{ name: 'Priya' }, { name: 'Tom' }, { name: 'Mei' }])
    ).toBe('Priya, Tom and Mei')
  })
})

describe('dates on a timeline', () => {
  const now = new Date(2026, 10, 10, 14, 0)

  it('says today, tomorrow and yesterday for due days', () => {
    expect(formatDue('2026-11-10', now)).toBe('today')
    expect(formatDue('2026-11-11', now)).toBe('tomorrow')
    expect(formatDue('2026-11-09', now)).toBe('yesterday')
    expect(formatDue('2026-11-20', now)).toContain('20')
  })

  it('counts a task as overdue only once its day has passed', () => {
    expect(isOverdue('2026-11-09', now)).toBe(true)
    expect(isOverdue('2026-11-10', now)).toBe(false)
    expect(isOverdue('2026-11-11', now)).toBe(false)
  })

  it('names the day for moments close to now', () => {
    expect(formatWhen(new Date(2026, 10, 10, 9, 5).toISOString(), now)).toMatch(
      /^Today, /
    )
    expect(formatWhen(new Date(2026, 10, 9, 18, 0).toISOString(), now)).toMatch(
      /^Yesterday, /
    )
    expect(
      formatWhen(new Date(2026, 10, 2, 18, 0).toISOString(), now)
    ).not.toMatch(/Today|Yesterday/)
  })

  it('turns a day and a time into a moment', () => {
    expect(toMoment('2026-11-10', '14:30')).toBe(
      new Date(2026, 10, 10, 14, 30).toISOString()
    )
    expect(toMoment('nonsense', '14:30')).toBeNull()
  })
})
