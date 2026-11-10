import { describe, expect, it } from 'vitest'

import {
  isWaitingProposal,
  PROPOSAL_FIELDS,
  proposalApproveSchema,
  proposalCreateSchema,
  proposalDeclineSchema,
  proposalListQuerySchema
} from './proposals'

describe('proposals', () => {
  it('still wait for a person while pending or out of date', () => {
    expect(isWaitingProposal('pending')).toBe(true)
    expect(isWaitingProposal('out_of_date')).toBe(true)
    expect(isWaitingProposal('approved')).toBe(false)
    expect(isWaitingProposal('declined')).toBe(false)
    expect(isWaitingProposal('undone')).toBe(false)
  })

  it('never let AI propose a new owner', () => {
    for (const fields of Object.values(PROPOSAL_FIELDS)) {
      expect(fields).not.toContain('ownerId')
    }
  })

  it('need a title and an AI tool, and tidy the reason', () => {
    const base = {
      kind: 'update',
      targetType: 'deal',
      targetId: 'd1',
      changes: [{ field: 'nextStep', to: 'Send pricing' }],
      title: ' Add a next step ',
      why: '  ',
      engine: 'claude-code'
    }
    expect(proposalCreateSchema.parse(base)).toMatchObject({
      title: 'Add a next step',
      why: null,
      sources: []
    })
    expect(
      proposalCreateSchema.safeParse({ ...base, title: ' ' }).success
    ).toBe(false)
    expect(
      proposalCreateSchema.safeParse({ ...base, engine: 'other' }).success
    ).toBe(false)
    expect(
      proposalCreateSchema.safeParse({
        ...base,
        changes: [{ field: 'nextStep', to: { nested: true } }]
      }).success
    ).toBe(false)
  })

  it('take an approval as it is, with edits, or with the version seen', () => {
    expect(proposalApproveSchema.parse({})).toEqual({})
    expect(
      proposalApproveSchema.parse({
        changes: [{ field: 'valueMinor', to: 2_200_000 }],
        version: 3
      })
    ).toEqual({ changes: [{ field: 'valueMinor', to: 2_200_000 }], version: 3 })
    expect(proposalApproveSchema.safeParse({ version: 0 }).success).toBe(false)
  })

  it('treat an empty decline reason as none', () => {
    expect(proposalDeclineSchema.parse({ reason: '  ' })).toEqual({
      reason: null
    })
    expect(proposalDeclineSchema.parse({ reason: ' Wrong deal ' })).toEqual({
      reason: 'Wrong deal'
    })
  })

  it('page the list fifty at a time unless asked', () => {
    expect(proposalListQuerySchema.parse({})).toEqual({ limit: 50 })
    expect(proposalListQuerySchema.parse({ limit: '10' }).limit).toBe(10)
  })
})
