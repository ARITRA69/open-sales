import type { TProposal } from '@open-sales/shared'

import type { TProposalCard } from './use-today'

/** A pending proposal to move a deal along, for tests. */
export const makeProposal = (
  overrides: Partial<TProposal> = {}
): TProposal => ({
  id: 'p1',
  kind: 'update',
  status: 'pending',
  title: 'Move Platform to Proposal',
  why: 'Dan asked for pricing by Friday',
  target: {
    type: 'deal',
    id: 'd1',
    name: 'Platform',
    companyName: 'Halden Capital',
    currency: 'USD',
    version: 1
  },
  changes: [
    {
      field: 'stageId',
      from: 's1',
      to: 's2',
      fromLabel: 'Qualified',
      toLabel: 'Proposal',
      current: 's1',
      currentLabel: 'Qualified'
    },
    {
      field: 'valueMinor',
      from: 1_800_000,
      to: 2_500_000,
      fromLabel: null,
      toLabel: null,
      current: 1_800_000,
      currentLabel: null
    }
  ],
  sources: [],
  requestedBy: { id: 'asha', name: 'Asha Menon' },
  approver: { id: 'asha', name: 'Asha Menon' },
  engine: 'claude-code',
  decidedBy: null,
  decidedAt: null,
  declineReason: null,
  undoUntil: null,
  createdAt: '2026-11-10T09:00:00.000Z',
  canDecide: true,
  ...overrides
})

export const makeCard = (
  proposal: Partial<TProposal> = {},
  state: Partial<Omit<TProposalCard, 'proposal'>> = {}
): TProposalCard => ({
  proposal: makeProposal(proposal),
  busy: null,
  problem: null,
  noPermission: null,
  ...state
})
