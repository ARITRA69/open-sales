import type { TLead, TLeadMatch, TSessionUser } from '@open-sales/shared'
import { vi } from 'vitest'

import type { TOpenSalesBridge } from '../../../../../preload/bridge-types'
import type { TLeadsBridge } from './use-leads'

export const ASHA: TSessionUser = {
  id: 'u-asha',
  name: 'Asha Menon',
  email: 'asha@halden.com',
  role: 'manager'
}

export const RAVI: TSessionUser = {
  id: 'u-ravi',
  name: 'Ravi Shah',
  email: 'ravi@halden.com',
  role: 'member'
}

const LENA = { id: 'u-lena', name: 'Lena Ortiz' }

export const makeLead = (fields: Partial<TLead> = {}): TLead => ({
  id: 'lead-dana',
  name: 'Dana Whitfield',
  email: 'dana@brightwell.co',
  phone: null,
  companyName: 'Brightwell Logistics',
  title: 'Operations Director',
  message: 'Our tracking contract ends in March.',
  source: 'web_form',
  status: 'new',
  owner: null,
  fitNote: null,
  disqualifiedReason: null,
  convertedCompanyId: null,
  convertedPersonId: null,
  convertedDealId: null,
  version: 1,
  createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  updatedAt: new Date().toISOString(),
  canWork: true,
  canAssign: true,
  canTake: true,
  ...fields
})

export const NO_MATCH: TLeadMatch = {
  company: null,
  person: null,
  canAddDeal: true
}

const ok = <TData>(data: TData) => ({ ok: true as const, data })

/** A leads bridge over a fixed list; every call is a spy. */
export const makeLeadsBridge = (
  leads: TLead[],
  overrides: Partial<TLeadsBridge> = {}
): TLeadsBridge => {
  const find = (id: string) => leads.find((lead) => lead.id === id) ?? leads[0]
  return {
    list: vi.fn(async () => ok({ items: leads, nextCursor: null })),
    get: vi.fn(async (id) => ok(find(id))),
    create: vi.fn(async (input) =>
      ok(makeLead({ id: 'new', name: input.name }))
    ),
    assign: vi.fn(async (id, { ownerId }) =>
      ok({
        ...find(id),
        owner: ownerId ? { id: ownerId, name: 'Someone' } : null
      })
    ),
    qualify: vi.fn(async (id) => ok({ ...find(id), status: 'qualified' })),
    disqualify: vi.fn(async (id, { reason }) =>
      ok({ ...find(id), status: 'disqualified', disqualifiedReason: reason })
    ),
    reopen: vi.fn(async (id) => ok({ ...find(id), status: 'new' })),
    match: vi.fn(async () => ok(NO_MATCH)),
    convert: vi.fn(async (id) =>
      ok({
        lead: { ...find(id), status: 'converted' },
        company: {
          id: 'c-new',
          name: 'Brightwell Logistics',
          owner: { id: ASHA.id, name: ASHA.name },
          isNew: true
        },
        person: { id: 'p-new', name: 'Dana Whitfield', isNew: true },
        deal: { id: 'd-new', name: 'Brightwell Logistics' }
      })
    ),
    ...overrides
  } as TLeadsBridge
}

/** Just what the Leads page asks the records bridge for. */
export const makeRecordsBridge = () =>
  ({
    listUsers: vi.fn(async () =>
      ok([
        { id: ASHA.id, name: ASHA.name },
        LENA,
        { id: RAVI.id, name: RAVI.name }
      ])
    ),
    getPipeline: vi.fn(async () =>
      ok({
        id: 'sales',
        name: 'Sales',
        currency: 'USD',
        stages: [],
        lostReasons: []
      })
    )
  }) as unknown as TOpenSalesBridge['records']
