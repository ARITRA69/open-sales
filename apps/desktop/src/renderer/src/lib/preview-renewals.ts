import type {
  TContract,
  TContractCandidate,
  TDeal,
  TOwner
} from '@open-sales/shared'
import { addDaysToDay, addMonthsToDay, termMonths } from '@open-sales/shared'

import type {
  TApiResult,
  TOpenSalesBridge
} from '../../../preload/bridge-types'
import { toIsoDay } from './dates'

/*
 * Pretend contracts for the browser preview (`?preview=signed-in#/renewals`).
 * It keeps changes in memory, checks versions like the server, and treats
 * the preview person as an admin. Given the preview's records, a renewal it
 * starts is a real pretend deal on the Pipeline page, and deals won there
 * turn up under "Won deals without a contract".
 */

type TRecordsBridge = TOpenSalesBridge['records']

const ME: TOwner = { id: 'preview', name: 'Asha Menon' }
const DAN: TOwner = { id: 'dan', name: 'Dan Okafor' }
const LENA: TOwner = { id: 'lena', name: 'Lena Ortiz' }

const pause = () => new Promise((resolve) => setTimeout(resolve, 300))

const ok = async <TData>(data: TData): Promise<TApiResult<TData>> => {
  await pause()
  return { ok: true, data: structuredClone(data) }
}

const problem = async (
  message: string,
  code?: string
): Promise<{ ok: false; message: string; code?: string }> => {
  await pause()
  return { ok: false, message, code }
}

const CHANGED_SINCE =
  'Someone changed this while you were editing. Your change wasn’t saved; look again and redo it.'

/** The pretend renewals bridge, or null outside the preview. */
export const createPreviewRenewals = (
  search: string,
  records: TRecordsBridge | null = null
): TOpenSalesBridge['renewals'] | null => {
  if (!new URLSearchParams(search).has('preview')) return null

  const today = toIsoDay(new Date())
  const now = new Date().toISOString()
  let nextId = 1

  const contract = (
    company: { id: string; name: string },
    owner: TOwner,
    dealName: string,
    valueMinor: number,
    renewsInDays: number,
    more: Partial<TContract> = {}
  ): TContract => {
    const renewsOn = addDaysToDay(today, renewsInDays)
    return {
      id: `contract-${nextId++}`,
      version: 1,
      company,
      owner,
      deal: { id: `won-${nextId}`, name: dealName },
      renewalDeal: null,
      valueMinor,
      currency: 'USD',
      startsOn: addMonthsToDay(renewsOn, -12),
      renewsOn,
      status: 'active',
      endReason: null,
      createdAt: now,
      updatedAt: now,
      canEdit: true,
      ...more
    }
  }

  const contracts: TContract[] = [
    contract(
      { id: 'orbit', name: 'Orbit Health' },
      ME,
      'Clinic scheduling',
      3_600_000,
      -4
    ),
    contract(
      { id: 'halden', name: 'Halden Capital' },
      ME,
      'Platform rollout',
      4_800_000,
      18
    ),
    contract(
      { id: 'lumen', name: 'Lumen Retail' },
      DAN,
      'Store pilot',
      2_500_000,
      41,
      {
        status: 'renewing',
        version: 2,
        renewalDeal: {
          id: 'd3',
          name: 'Lumen Retail renewal',
          status: 'open'
        }
      }
    ),
    contract(
      { id: 'northwind', name: 'Northwind Freight' },
      LENA,
      'Fleet tracking',
      9_000_000,
      74
    ),
    contract(
      { id: 'northwind', name: 'Northwind Freight' },
      LENA,
      'Driver app',
      1_450_000,
      -40,
      { status: 'ended', version: 2, endReason: 'Chose another tool' }
    ),
    contract(
      { id: 'pinecrest', name: 'Pinecrest Schools' },
      DAN,
      'District licence',
      1_800_000,
      -75,
      {
        status: 'renewed',
        version: 3,
        renewalDeal: {
          id: 'renewal-pinecrest',
          name: 'Pinecrest Schools renewal',
          status: 'won'
        }
      }
    )
  ]

  const candidate = (
    id: string,
    name: string,
    company: { id: string; name: string },
    owner: TOwner,
    valueMinor: number | null,
    closedDaysAgo: number
  ): TContractCandidate => {
    const closeDate = addDaysToDay(today, -closedDaysAgo)
    return {
      deal: { id, name },
      company,
      owner,
      valueMinor,
      currency: 'USD',
      closeDate,
      suggestedStartsOn: closeDate,
      suggestedRenewsOn: addMonthsToDay(closeDate, 12),
      canEdit: true
    }
  }

  let candidates: TContractCandidate[] = [
    candidate(
      'renewal-pinecrest',
      'Pinecrest Schools renewal',
      { id: 'pinecrest', name: 'Pinecrest Schools' },
      DAN,
      1_950_000,
      70
    ),
    candidate(
      'won-orbit',
      'Reporting add-on',
      { id: 'orbit', name: 'Orbit Health' },
      ME,
      600_000,
      9
    ),
    candidate(
      'won-halden',
      'Analytics seats',
      { id: 'halden', name: 'Halden Capital' },
      ME,
      null,
      3
    )
  ]
  // Pinecrest's won renewal carries on from the contract it renewed.
  candidates[0].suggestedStartsOn = contracts[5].renewsOn
  candidates[0].suggestedRenewsOn = addMonthsToDay(contracts[5].renewsOn, 12)

  const touch = (found: TContract, changes: Partial<TContract>) =>
    Object.assign(found, changes, {
      version: found.version + 1,
      updatedAt: new Date().toISOString()
    })

  /** The preview's own deals, when the records bridge is there to ask. */
  const previewDeals = async (): Promise<TDeal[]> => {
    const answer = await records?.list('deals', { limit: 200 })
    return answer?.ok ? answer.data.items : []
  }

  /** Like the server: a renewal deal that closed moves its contract on. */
  const settle = async () => {
    const deals = await previewDeals()
    for (const found of contracts) {
      if (found.status !== 'renewing' || !found.renewalDeal) continue
      const renewal = deals.find((deal) => deal.id === found.renewalDeal?.id)
      if (!renewal || renewal.status === 'open') continue
      found.renewalDeal.status = renewal.status
      touch(
        found,
        renewal.status === 'won'
          ? { status: 'renewed' }
          : { status: 'ended', endReason: 'The renewal was lost' }
      )
    }
  }

  /** Deals won on the preview's Pipeline page, without a contract yet. */
  const wonInPreview = async (): Promise<TContractCandidate[]> =>
    (await previewDeals())
      .filter((deal) => deal.status === 'won' && !deal.archivedAt)
      .filter(
        (deal) =>
          !contracts.some((found) => found.deal?.id === deal.id) &&
          !candidates.some((found) => found.deal.id === deal.id)
      )
      .map((deal) => {
        const renewed = contracts.find(
          (found) => found.renewalDeal?.id === deal.id
        )
        const startsOn = renewed?.renewsOn ?? deal.closeDate ?? today
        const months = renewed
          ? (termMonths(renewed.startsOn, renewed.renewsOn) ?? 12)
          : 12
        return {
          deal: { id: deal.id, name: deal.name },
          company: deal.company,
          owner: deal.owner,
          valueMinor: deal.valueMinor,
          currency: deal.currency,
          closeDate: deal.closeDate,
          suggestedStartsOn: startsOn,
          suggestedRenewsOn: addMonthsToDay(startsOn, months),
          canEdit: true
        }
      })

  const find = (contractId: string, version: number) => {
    const found = contracts.find((each) => each.id === contractId)
    if (!found) {
      return {
        found: null,
        refusal: problem(
          'That contract doesn’t exist, or was deleted.',
          'not_found'
        )
      }
    }
    if (found.version !== version) {
      return { found: null, refusal: problem(CHANGED_SINCE, 'changed_since') }
    }
    return { found, refusal: null }
  }

  return {
    list: async (query = {}) => {
      await settle()
      const isClosed = query.view === 'closed'
      const horizon = addDaysToDay(today, Number(query.window ?? 90))
      const items = contracts
        .filter((found) =>
          isClosed
            ? found.status === 'renewed' || found.status === 'ended'
            : (found.status === 'active' || found.status === 'renewing') &&
              found.renewsOn <= horizon
        )
        .filter((found) => query.owner !== 'me' || found.owner.id === ME.id)
        .sort(
          (a, b) => a.renewsOn.localeCompare(b.renewsOn) * (isClosed ? -1 : 1)
        )
      return ok({ items, nextCursor: null })
    },

    listCandidates: async (query = {}) => {
      const items = [...(await wonInPreview()), ...candidates].filter(
        (found) => query.owner !== 'me' || found.owner.id === ME.id
      )
      return ok({ items, nextCursor: null })
    },

    createContract: async (input) => {
      const from = [...candidates, ...(await wonInPreview())].find(
        (found) => found.deal.id === input.dealId
      )
      if (!from) {
        return problem('Choose a deal that’s still in use.', 'invalid_change')
      }
      if (input.renewsOn <= input.startsOn) {
        return problem(
          'The renewal date must be after the start date',
          'invalid_request'
        )
      }
      const made: TContract = {
        id: `contract-${nextId++}`,
        version: 1,
        company: from.company,
        owner: from.owner,
        deal: from.deal,
        renewalDeal: null,
        valueMinor: input.valueMinor,
        currency: input.currency ?? from.currency,
        startsOn: input.startsOn,
        renewsOn: input.renewsOn,
        status: 'active',
        endReason: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        canEdit: true
      }
      contracts.push(made)
      candidates = candidates.filter((found) => found.deal.id !== input.dealId)
      return ok(made)
    },

    startRenewal: async (contractId, input) => {
      const { found, refusal } = find(contractId, input.version)
      if (!found) return refusal
      if (found.status !== 'active') {
        return problem(
          'This renewal has already been started.',
          'invalid_change'
        )
      }
      const name = `${found.company.name} renewal ${found.renewsOn.slice(0, 4)}`
      // A real pretend deal where the preview has records; a stand-in if not.
      const made = await records?.create('deals', {
        companyId: found.company.id,
        name,
        stageId: input.stageId,
        valueMinor:
          input.valueMinor === undefined ? found.valueMinor : input.valueMinor,
        closeDate:
          input.closeDate === undefined ? found.renewsOn : input.closeDate
      })
      touch(found, {
        status: 'renewing',
        renewalDeal: {
          id: made?.ok ? made.data.id : `renewal-${found.id}`,
          name,
          status: 'open'
        }
      })
      return ok(found)
    },

    endContract: (contractId, input) => {
      const { found, refusal } = find(contractId, input.version)
      if (!found) return refusal
      if (found.status !== 'active') {
        return problem('This contract has already finished.', 'invalid_change')
      }
      touch(found, { status: 'ended', endReason: input.reason.trim() })
      return ok(found)
    },

    reopenContract: (contractId, version) => {
      const { found, refusal } = find(contractId, version)
      if (!found) return refusal
      if (found.status !== 'ended') {
        return problem(
          'Only an ended contract can be reopened.',
          'invalid_change'
        )
      }
      touch(found, { status: 'active', endReason: null })
      return ok(found)
    }
  }
}
