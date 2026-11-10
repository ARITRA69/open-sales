import type { TLead, TLeadMatch, TOwner } from '@open-sales/shared'
import { companyDomainOfEmail, isOpenLead } from '@open-sales/shared'

import type {
  TApiResult,
  TOpenSalesBridge
} from '../../../preload/bridge-types'

/*
 * Pretend leads for the browser preview (`?preview=signed-in#/leads`). It
 * keeps changes in memory, checks versions like the server, and treats the
 * preview person as an admin. Converting adds the account, person and deal
 * to the pretend records (`preview-records.ts`) when that bridge is there,
 * so they show up on Accounts, People and Pipeline.
 */

type TRecordsBridge = TOpenSalesBridge['records']

const ME: TOwner = { id: 'preview', name: 'Asha Menon' }
const DAN: TOwner = { id: 'dan', name: 'Dan Okafor' }
const LENA: TOwner = { id: 'lena', name: 'Lena Ortiz' }
const TEAM = [ME, DAN, LENA]

const hoursAgo = (hours: number) =>
  new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

const lead = (
  id: string,
  hours: number,
  fields: Partial<TLead> & Pick<TLead, 'name'>
): TLead => ({
  id,
  email: null,
  phone: null,
  companyName: null,
  title: null,
  message: null,
  source: 'web_form',
  status: 'new',
  owner: null,
  fitNote: null,
  disqualifiedReason: null,
  convertedCompanyId: null,
  convertedPersonId: null,
  convertedDealId: null,
  version: 1,
  createdAt: hoursAgo(hours),
  updatedAt: hoursAgo(hours),
  canWork: true,
  canAssign: true,
  canTake: fields.owner == null,
  ...fields
})

const LEADS: TLead[] = [
  lead('lead-dana', 2, {
    name: 'Dana Whitfield',
    email: 'dana@brightwell.co',
    phone: '+442079460123',
    companyName: 'Brightwell Logistics',
    title: 'Operations Director',
    message:
      'We run 140 vans across the north of England and our tracking contract ends in March. Could someone show us what a rollout looks like?',
    fitNote:
      'Matches your usual customer: about 120 people, logistics, and a contract ending in March.'
  }),
  // Their company is already an account, and Dan owns it.
  lead('lead-marcus', 5, {
    name: 'Marcus Lee',
    email: 'marcus@lumenretail.com',
    companyName: 'Lumen Retail',
    title: 'Head of Stores',
    source: 'email',
    message:
      'Mei suggested I get in touch. We’re opening six stores next year and I’d like pricing for those on top of the pilot.'
  }),
  lead('lead-ines', 26, {
    name: 'Ines Calderón',
    email: 'ines@halden.com',
    companyName: 'Halden Capital',
    title: 'Procurement Lead',
    owner: ME,
    message: 'Please send your security questionnaire and a sample contract.'
  }),
  lead('lead-tomas', 50, {
    name: 'Tomás Ferreira',
    email: 'tomas.ferreira@gmail.com',
    companyName: 'Ferreira & Sons',
    title: 'Owner',
    source: 'manual',
    status: 'qualified',
    owner: LENA,
    message: 'Met at the Porto trade fair. Wants a call after the 20th.'
  }),
  // Already in People, at Halden Capital.
  lead('lead-priya', 74, {
    name: 'Priya Nair',
    email: 'priya@halden.com',
    companyName: 'Halden',
    source: 'import'
  }),
  lead('lead-wen', 98, {
    name: 'Wen Zhao',
    companyName: 'Pinecrest Schools',
    title: 'IT Coordinator',
    source: 'import'
  }),
  lead('lead-jordan', 150, {
    name: 'Jordan Blake',
    email: 'jblake@gmail.com',
    status: 'disqualified',
    owner: DAN,
    disqualifiedReason: 'A student project, with no budget.',
    message:
      'I’m writing a dissertation on sales software. Is there a free plan?'
  }),
  lead('lead-rosa', 220, {
    name: 'Rosa Diaz',
    email: 'rosa@orbithealth.co',
    companyName: 'Orbit Health',
    title: 'IT Lead',
    status: 'converted',
    owner: ME,
    convertedCompanyId: 'orbit',
    convertedPersonId: 'rosa',
    convertedDealId: 'd5'
  })
]

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

const NOT_FOUND = () => problem('That lead doesn’t exist.', 'not_found')
const STALE = () =>
  problem(
    'Someone changed this while you were editing. Your change wasn’t saved; look again and redo it.',
    'changed_since'
  )

const newId = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}`

/** The pretend leads bridge, or null outside the preview. */
export const createPreviewLeads = (
  search: string,
  records: TRecordsBridge | null = null
): TOpenSalesBridge['leads'] | null => {
  if (!new URLSearchParams(search).has('preview')) return null

  const store = structuredClone(LEADS)
  const find = (id: string) => store.find((item) => item.id === id)

  const touch = (item: TLead, changes: Partial<TLead>) =>
    Object.assign(item, changes, {
      version: item.version + 1,
      updatedAt: new Date().toISOString(),
      canTake:
        (changes.owner === undefined ? item.owner : changes.owner) === null
    })

  /** One change to a lead, after the same version check the server makes. */
  const change = (
    id: string,
    version: number,
    decide: (item: TLead) => Partial<TLead> | string
  ) => {
    const item = find(id)
    if (!item) return NOT_FOUND()
    if (item.version !== version) return STALE()
    const changes = decide(item)
    if (typeof changes === 'string') return problem(changes, 'invalid_change')
    return ok(touch(item, changes))
  }

  const ownerOf = async (userId: string): Promise<TOwner | null> => {
    const users = records ? await records.listUsers() : null
    const team = users?.ok ? users.data : TEAM
    return team.find((user) => user.id === userId) ?? null
  }

  /** The same search the server makes: their email, its domain, the name. */
  const matchOf = async (
    item: TLead,
    companyName?: string
  ): Promise<TLeadMatch> => {
    const none: TLeadMatch = { company: null, person: null, canAddDeal: true }
    if (!records) return none
    const [companies, people] = await Promise.all([
      records.list('companies', { limit: 200 }),
      records.list('people', { limit: 200 })
    ])
    if (!companies.ok || !people.ok) return none

    const known = item.email
      ? people.data.items.find((person) => person.email === item.email)
      : undefined
    const domain = companyDomainOfEmail(item.email)
    const name = (companyName ?? item.companyName ?? '').trim().toLowerCase()
    const found = known
      ? {
          matchedBy: 'person' as const,
          company: companies.data.items.find((c) => c.id === known.company.id)
        }
      : domain && companies.data.items.some((c) => c.domain === domain)
        ? {
            matchedBy: 'domain' as const,
            company: companies.data.items.find((c) => c.domain === domain)
          }
        : {
            matchedBy: 'name' as const,
            company: name
              ? companies.data.items.find((c) => c.name.toLowerCase() === name)
              : undefined
          }
    if (!found.company) return none
    return {
      company: {
        id: found.company.id,
        name: found.company.name,
        owner: found.company.owner,
        matchedBy: found.matchedBy
      },
      person: known ? { id: known.id, name: known.name } : null,
      canAddDeal: true
    }
  }

  return {
    list: (query = {}) => {
      const q = query.q?.trim().toLowerCase() ?? ''
      const status = query.status ?? 'open'
      const items = store
        .filter((item) =>
          status === 'any'
            ? true
            : status === 'open'
              ? isOpenLead(item.status)
              : item.status === status
        )
        .filter((item) =>
          query.owner === 'me'
            ? item.owner?.id === ME.id
            : query.owner === 'none'
              ? item.owner === null
              : true
        )
        .filter((item) =>
          `${item.name} ${item.email ?? ''} ${item.companyName ?? ''}`
            .toLowerCase()
            .includes(q)
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return ok({ items, nextCursor: null })
    },

    get: (id) => {
      const item = find(id)
      return item ? ok(item) : NOT_FOUND()
    },

    create: async (input) => {
      const owner =
        input.ownerId === undefined
          ? ME
          : input.ownerId === null
            ? null
            : await ownerOf(input.ownerId)
      const item = lead(newId('lead'), 0, {
        name: input.name.trim(),
        email: input.email?.trim().toLowerCase() || null,
        phone: input.phone || null,
        companyName: input.companyName?.trim() || null,
        title: input.title?.trim() || null,
        message: input.message?.trim() || null,
        source: 'manual',
        owner
      })
      store.push(item)
      return ok(item)
    },

    assign: async (id, { version, ownerId }) => {
      const owner = ownerId ? await ownerOf(ownerId) : null
      return change(id, version, (item) =>
        item.status === 'converted'
          ? 'This lead was converted. Its account has an owner now.'
          : { owner }
      )
    },

    qualify: (id, version) =>
      change(id, version, (item) =>
        item.status === 'new' || item.status === 'qualified'
          ? { status: 'qualified' }
          : 'Reopen this lead to qualify it.'
      ),

    disqualify: (id, { version, reason }) =>
      change(id, version, (item) =>
        item.status === 'converted'
          ? 'This lead was already converted.'
          : { status: 'disqualified', disqualifiedReason: reason.trim() }
      ),

    reopen: (id, version) =>
      change(id, version, (item) =>
        item.status === 'converted'
          ? 'This lead was already converted.'
          : { status: 'new', disqualifiedReason: null }
      ),

    match: async (id, companyName) => {
      const item = find(id)
      return item ? ok(await matchOf(item, companyName)) : NOT_FOUND()
    },

    convert: async (id, input) => {
      const item = find(id)
      if (!item) return NOT_FOUND()
      if (item.version !== input.version) return STALE()
      if (!isOpenLead(item.status)) {
        return problem('This lead was already converted.', 'invalid_change')
      }
      const match = await matchOf(item, input.companyName)
      if ((match.company?.id ?? null) !== input.companyId) {
        return problem(
          'The accounts changed while you were deciding. Look at what this lead matches now, then convert.',
          'match_changed'
        )
      }

      let company = match.company
        ? {
            id: match.company.id,
            name: match.company.name,
            owner: match.company.owner,
            isNew: false
          }
        : null
      if (!company) {
        const name = input.companyName?.trim() || item.companyName
        if (!name) {
          return problem('Say which company they work at.', 'invalid_change')
        }
        const made = await records?.create('companies', {
          name,
          domain: companyDomainOfEmail(item.email) ?? undefined
        })
        if (made && !made.ok) return made
        company = {
          id: made?.data.id ?? newId('company'),
          name,
          owner: ME,
          isNew: true
        }
      }

      let person = match.person ? { ...match.person, isNew: false } : null
      if (!person) {
        const made = await records?.create('people', {
          companyId: company.id,
          name: item.name,
          title: item.title,
          email: item.email,
          phone: item.phone
        })
        if (made && !made.ok) return made
        person = {
          id: made?.data.id ?? newId('person'),
          name: item.name,
          isNew: true
        }
      }

      let deal: { id: string; name: string } | null = null
      if (input.deal) {
        const made = await records?.create('deals', {
          companyId: company.id,
          name: input.deal.name,
          valueMinor: input.deal.valueMinor
        })
        if (made && !made.ok) return made
        deal = { id: made?.data.id ?? newId('deal'), name: input.deal.name }
      }

      touch(item, {
        status: 'converted',
        owner: item.owner ?? ME,
        convertedCompanyId: company.id,
        convertedPersonId: person.id,
        convertedDealId: deal?.id ?? null
      })
      return ok({ lead: item, company, person, deal })
    }
  }
}
