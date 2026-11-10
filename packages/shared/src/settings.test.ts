import { describe, expect, it } from 'vitest'

import { canManageWorkspace } from './roles'
import {
  findRepeatedName,
  isCurrencyCode,
  isTimeZone,
  stagesSaveSchema,
  workspaceUpdateSchema
} from './settings'
import { memberUpdateSchema } from './team'

describe('canManageWorkspace', () => {
  it('is for admins only', () => {
    expect(canManageWorkspace('admin')).toBe(true)
    expect(canManageWorkspace('manager')).toBe(false)
    expect(canManageWorkspace('member')).toBe(false)
  })
})

describe('workspace settings', () => {
  it('knows real currencies and time zones from made-up ones', () => {
    expect(isCurrencyCode('EUR')).toBe(true)
    expect(isCurrencyCode('eur')).toBe(false)
    expect(isCurrencyCode('EURO')).toBe(false)
    expect(isTimeZone('Asia/Kolkata')).toBe(true)
    expect(isTimeZone('UTC')).toBe(true)
    expect(isTimeZone('Mars/Olympus')).toBe(false)
    expect(isTimeZone('')).toBe(false)
  })

  it('takes what changed, tidied, and nothing else', () => {
    expect(
      workspaceUpdateSchema.parse({ name: ' Halden ', currency: 'gbp' })
    ).toEqual({ name: 'Halden', currency: 'GBP' })
    expect(workspaceUpdateSchema.safeParse({}).success).toBe(false)
    expect(workspaceUpdateSchema.safeParse({ name: ' ' }).success).toBe(false)
  })
})

describe('saving stages', () => {
  const stage = {
    name: 'Proposal',
    winProbability: 50,
    stalledAfterDays: 10,
    goal: '',
    exitCriteria: ' Pricing sent '
  }

  it('tidies the words and treats empty as none', () => {
    const parsed = stagesSaveSchema.parse({ revision: 'r1', stages: [stage] })
    expect(parsed.stages[0]).toMatchObject({
      goal: null,
      exitCriteria: 'Pricing sent'
    })
    expect(parsed.removed).toEqual([])
  })

  it('says what’s wrong in plain words', () => {
    const problem = (changes: object) =>
      stagesSaveSchema.safeParse({
        revision: 'r1',
        stages: [{ ...stage, ...changes }]
      }).error?.issues[0].message
    expect(problem({ name: ' ' })).toBe('Give the stage a name')
    expect(problem({ winProbability: 101 })).toBe(
      'Win probability can’t be above 100'
    )
    expect(problem({ stalledAfterDays: 0 })).toBe(
      'Stalled after at least 1 day, or leave it empty'
    )
    expect(
      stagesSaveSchema.safeParse({ revision: 'r1', stages: [] }).error
        ?.issues[0].message
    ).toBe('Keep at least one stage before Won and Lost')
  })
})

describe('findRepeatedName', () => {
  it('ignores case and spaces around', () => {
    expect(findRepeatedName(['Won', 'Lost', ' won '])).toBe('won')
    expect(findRepeatedName(['Won', 'Lost'])).toBeNull()
  })
})

describe('changing a teammate', () => {
  it('needs a role or a status, and only ones an admin may set', () => {
    expect(memberUpdateSchema.safeParse({}).success).toBe(false)
    expect(memberUpdateSchema.safeParse({ status: 'pending' }).success).toBe(
      false
    )
    expect(memberUpdateSchema.parse({ role: 'manager' })).toEqual({
      role: 'manager'
    })
  })
})
