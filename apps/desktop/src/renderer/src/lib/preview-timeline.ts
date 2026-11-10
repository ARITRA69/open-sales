import type {
  TActivity,
  TCompany,
  TDeal,
  TPerson,
  TTask,
  TTimelineItem
} from '@open-sales/shared'

import type {
  TApiResult,
  TOpenSalesBridge,
  TTimelineBridge,
  TTimelineRecord
} from '../../../preload/bridge-types'

/*
 * Pretend timelines, notes, calls and tasks for the browser preview
 * (`?preview=signed-in#/accounts/halden`). It reads companies, people and
 * deals from the pretend records, keeps what's added in memory, and checks
 * task versions like the server.
 */

const ME = { id: 'preview', name: 'Asha Menon' }
const DAN = { id: 'dan', name: 'Dan Okafor' }

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

const hoursAgo = (hours: number) =>
  new Date(Date.now() - hours * HOUR_MS).toISOString()
const daysAgo = (days: number) => hoursAgo(days * 24)

const pad = (value: number) => String(value).padStart(2, '0')
/** A local day as "2026-11-30", some days from today. */
const dayFromNow = (days: number) => {
  const date = new Date(Date.now() + days * DAY_MS)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const HALDEN = { id: 'halden', name: 'Halden Capital' }
const LUMEN = { id: 'lumen', name: 'Lumen Retail' }
const ROLLOUT = { id: 'd1', name: 'Platform rollout' }
const PRIYA = { id: 'priya', name: 'Priya Nair' }
const TOM = { id: 'tom', name: 'Tom Becker' }
const MEI = { id: 'mei', name: 'Mei Lin' }

// Who's linked to which deal. Linking people is the Pipeline page's job.
const DEAL_PEOPLE: Record<string, string[]> = { d1: ['priya', 'tom'] }

let nextId = 1
const newId = (prefix: string) => `${prefix}-${nextId++}`

const activity = (
  fields: Pick<TActivity, 'type' | 'occurredAt' | 'company'> &
    Partial<TActivity>
): TActivity => ({
  id: newId('a'),
  endsAt: null,
  deal: null,
  author: ME,
  source: 'manual',
  title: null,
  body: null,
  outcome: null,
  people: [],
  createdAt: fields.occurredAt,
  updatedAt: fields.occurredAt,
  archivedAt: null,
  canEdit: true,
  ...fields
})

const task = (
  fields: Pick<TTask, 'title' | 'dueOn' | 'company'> & Partial<TTask>
): TTask => ({
  id: newId('t'),
  notes: null,
  assignee: ME,
  createdBy: ME,
  deal: null,
  person: null,
  completedAt: null,
  source: 'manual',
  version: 1,
  createdAt: daysAgo(3),
  updatedAt: daysAgo(3),
  archivedAt: null,
  canEdit: true,
  ...fields
})

const seedActivities = (): TActivity[] => [
  activity({
    type: 'call',
    occurredAt: hoursAgo(20),
    company: HALDEN,
    deal: ROLLOUT,
    outcome: 'connected',
    people: [PRIYA, TOM],
    body: 'Walked Priya and Tom through the rollout plan. Tom wants pricing for 25 seats before the board meets on the 20th. Priya will line up their IT lead for a security review.'
  }),
  activity({
    type: 'note',
    occurredAt: daysAgo(4),
    company: HALDEN,
    body: 'Their current tool renews in January, so a decision has to land before Christmas.'
  }),
  activity({
    type: 'call',
    occurredAt: daysAgo(9),
    company: HALDEN,
    outcome: 'voicemail',
    people: [PRIYA],
    body: null
  }),
  activity({
    type: 'note',
    occurredAt: daysAgo(15),
    company: HALDEN,
    people: [TOM],
    author: DAN,
    canEdit: true,
    body: 'Met Tom at the fintech meetup. He signs off anything over $20k himself.'
  }),
  activity({
    type: 'call',
    occurredAt: daysAgo(6),
    company: LUMEN,
    author: DAN,
    outcome: 'connected',
    people: [MEI],
    body: 'Mei wants to pilot in three stores first.'
  })
]

const seedTasks = (): TTask[] => [
  task({
    title: 'Send pricing for 25 seats to Tom',
    dueOn: dayFromNow(-1),
    company: HALDEN,
    deal: ROLLOUT
  }),
  task({
    title: 'Book the security review with their IT lead',
    dueOn: dayFromNow(3),
    company: HALDEN,
    person: PRIYA
  }),
  task({
    title: 'Ask Priya who else should see the demo',
    dueOn: null,
    company: HALDEN,
    person: PRIYA
  }),
  task({
    title: 'Share the case study from Northwind',
    dueOn: dayFromNow(-6),
    company: HALDEN,
    completedAt: daysAgo(5)
  }),
  task({
    title: 'Send Mei the pilot plan',
    dueOn: dayFromNow(0),
    company: LUMEN,
    assignee: DAN,
    createdBy: DAN
  })
]

const pause = () => new Promise((resolve) => setTimeout(resolve, 250))

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

const NOT_FOUND = () =>
  problem('That doesn’t exist, or was deleted.', 'not_found')
const CHANGED = () =>
  problem(
    'Someone changed this while you were editing. Your change wasn’t saved; look again and redo it.',
    'changed_since'
  )

/** The pretend timeline bridge, or null outside the preview. */
export const createPreviewTimeline = (
  search: string,
  records: TOpenSalesBridge['records'] | null
): TTimelineBridge | null => {
  if (!records || !new URLSearchParams(search).has('preview')) return null

  const activities = seedActivities()
  const tasks = seedTasks()

  const getCompany = async (id: string) => {
    const found = await records.get('companies', id)
    return found.ok ? found.data : null
  }
  const getPerson = async (id: string) => {
    const found = await records.get('people', id)
    return found.ok ? found.data : null
  }
  const getDeal = async (id: string) => {
    const found = await records.get('deals', id)
    return found.ok ? found.data : null
  }
  const named = ({ id, name }: { id: string; name: string }) => ({ id, name })

  /** Where something written on a record is filed, as the server does it. */
  const fileUnder = async ({ type, id }: TTimelineRecord) => {
    if (type === 'company') {
      const company = await getCompany(id)
      return company
        ? { company: named(company), deal: null, person: null }
        : null
    }
    if (type === 'person') {
      const person = await getPerson(id)
      return person
        ? { company: person.company, deal: null, person: named(person) }
        : null
    }
    const deal = await getDeal(id)
    return deal
      ? { company: deal.company, deal: named(deal), person: null }
      : null
  }

  const namesOf = async (personIds: string[]) => {
    const people = await Promise.all(personIds.map(getPerson))
    return people
      .filter((person): person is TPerson => person !== null)
      .map(named)
  }

  /** A deal's way through the stages, as far as the pretend data knows. */
  const stageMoves = async (deals: TDeal[]): Promise<TTimelineItem[]> => {
    const pipeline = await records.getPipeline()
    const stages = pipeline.ok ? pipeline.data.stages : []
    const first = stages[0]
    if (!first) return []
    return deals.flatMap((deal) => {
      const current = stages.find((stage) => stage.id === deal.stageId)
      const created: TTimelineItem = {
        kind: 'stage',
        id: `${deal.id}-created`,
        at: deal.createdAt,
        upcoming: false,
        actor: deal.owner,
        deal: named(deal),
        from: null,
        to: named(first)
      }
      if (!current || current.id === first.id) return [created]
      const previous = stages[stages.indexOf(current) - 1] ?? first
      const createdAt = new Date(deal.createdAt).getTime()
      // The pretend deals enter their stage the moment they're made.
      const movedAt =
        deal.stageEnteredAt === deal.createdAt
          ? new Date((createdAt + Date.now()) / 2).toISOString()
          : deal.stageEnteredAt
      return [
        created,
        {
          kind: 'stage',
          id: `${deal.id}-moved`,
          at: movedAt,
          upcoming: false,
          actor: deal.owner,
          deal: named(deal),
          from: named(previous),
          to: named(current)
        }
      ]
    })
  }

  const createdItem = (
    record: TCompany | TPerson | TDeal,
    actor: { id: string; name: string },
    fields: string[]
  ): TTimelineItem => ({
    kind: 'change',
    id: `${record.id}-created`,
    at: record.createdAt,
    upcoming: false,
    actor,
    via: 'app',
    action: 'create',
    changes: fields.map((field) => ({ field, from: null, to: null }))
  })

  /** Field changes and stage moves: what the server reads from its logs. */
  const logOf = async ({
    type,
    id
  }: TTimelineRecord): Promise<TTimelineItem[] | null> => {
    if (type === 'company') {
      const company = await getCompany(id)
      if (!company) return null
      const deals = await records.list('deals', { companyId: id })
      const ofCompany = deals.ok
        ? deals.data.items.filter((deal) => deal.company.id === id)
        : []
      const extra: TTimelineItem[] =
        id === HALDEN.id
          ? [
              {
                kind: 'change',
                id: 'halden-industry',
                at: daysAgo(12),
                upcoming: false,
                actor: ME,
                via: 'app',
                action: 'update',
                changes: [
                  {
                    field: 'industry',
                    from: 'Banking',
                    to: 'Financial services'
                  }
                ]
              }
            ]
          : []
      return [
        createdItem(company, company.owner, ['name', 'ownerId']),
        ...extra,
        ...(await stageMoves(ofCompany))
      ]
    }
    if (type === 'person') {
      const person = await getPerson(id)
      if (!person) return null
      return [createdItem(person, ME, ['name', 'companyId'])]
    }
    const deal = await getDeal(id)
    return deal ? stageMoves([deal]) : null
  }

  const isOn = (
    { type, id }: TTimelineRecord,
    item: {
      company: { id: string } | null
      deal: { id: string } | null
    }
  ) => (type === 'company' ? item.company?.id === id : item.deal?.id === id)

  const today = () => dayFromNow(0)

  return {
    read: async (record, query = {}) => {
      const log = await logOf(record)
      if (!log) return NOT_FOUND()

      const shownActivities = activities.filter(
        (one) =>
          !one.archivedAt &&
          (record.type === 'person'
            ? one.people.some((person) => person.id === record.id)
            : isOn(record, one))
      )
      const shownTasks = tasks.filter(
        (one) =>
          !one.archivedAt &&
          (record.type === 'person'
            ? one.person?.id === record.id
            : isOn(record, one))
      )
      const now = new Date().toISOString()

      const upcoming: TTimelineItem[] = [
        ...shownTasks
          .filter((one) => !one.completedAt)
          .map(
            (one): TTimelineItem => ({
              kind: 'task',
              id: one.id,
              at: one.dueOn,
              upcoming: true,
              task: one
            })
          ),
        ...shownActivities
          .filter((one) => one.occurredAt > now)
          .map(
            (one): TTimelineItem => ({
              kind: 'activity',
              id: one.id,
              at: one.occurredAt,
              upcoming: true,
              activity: one
            })
          )
      ].sort((a, b) => {
        if (a.at === b.at) return 0
        if (a.at === null) return 1
        if (b.at === null) return -1
        return a.at < b.at ? -1 : 1
      })

      const history: TTimelineItem[] = [
        ...shownActivities
          .filter((one) => one.occurredAt <= now)
          .map(
            (one): TTimelineItem => ({
              kind: 'activity',
              id: one.id,
              at: one.occurredAt,
              upcoming: false,
              activity: one
            })
          ),
        ...shownTasks
          .filter((one) => one.completedAt)
          .map(
            (one): TTimelineItem => ({
              kind: 'task',
              id: one.id,
              at: one.completedAt,
              upcoming: false,
              task: one
            })
          ),
        ...log
      ].sort((a, b) => ((a.at ?? '') < (b.at ?? '') ? 1 : -1))

      // The cursor is just how far in we are.
      const start = Number(query.cursor ?? 0) || 0
      const limit = Number(query.limit ?? 30)
      const page = history.slice(start, start + limit)
      return ok({
        items: start === 0 ? [...upcoming, ...page] : page,
        nextCursor:
          start + limit < history.length ? String(start + limit) : null
      })
    },

    createActivity: async (input) => {
      const filed = await fileUnder(input.on)
      if (!filed) return NOT_FOUND()
      if (input.type === 'note' && !input.body.trim()) {
        return problem('Write the note first')
      }
      const occurredAt =
        input.type === 'call' && input.occurredAt
          ? input.occurredAt
          : new Date().toISOString()
      const created = activity({
        type: input.type,
        occurredAt,
        company: filed.company,
        deal: filed.deal,
        body: input.body?.trim() || null,
        outcome: input.type === 'call' ? (input.outcome ?? 'connected') : null,
        people: await namesOf([
          ...(filed.person ? [filed.person.id] : []),
          ...(input.type === 'call' ? (input.personIds ?? []) : [])
        ])
      })
      activities.push(created)
      return ok(created)
    },

    updateActivity: async (id, input) => {
      const found = activities.find((one) => one.id === id)
      if (!found) return NOT_FOUND()
      if (input.body !== undefined) found.body = input.body?.trim() || null
      if (input.occurredAt) found.occurredAt = input.occurredAt
      if (input.outcome) found.outcome = input.outcome
      if (input.personIds) found.people = await namesOf(input.personIds)
      found.updatedAt = new Date().toISOString()
      return ok(found)
    },

    archiveActivity: (id) => {
      const found = activities.find((one) => one.id === id)
      if (!found) return NOT_FOUND()
      found.archivedAt = new Date().toISOString()
      return ok(found)
    },

    listTasks: (query = {}) => {
      const wantsDone = query.status === 'done'
      const items = tasks
        .filter((one) => !one.archivedAt)
        .filter((one) => Boolean(one.completedAt) === wantsDone)
        .filter(
          (one) => query.assignee === 'anyone' || one.assignee.id === ME.id
        )
        .filter(
          (one) =>
            query.due !== 'today' ||
            (one.dueOn !== null && one.dueOn <= today())
        )
        .sort((a, b) => {
          if (a.dueOn === b.dueOn) return 0
          if (a.dueOn === null) return 1
          if (b.dueOn === null) return -1
          return a.dueOn < b.dueOn ? -1 : 1
        })
      return ok({ items, nextCursor: null })
    },

    createTask: async (input) => {
      const filed = input.on
        ? await fileUnder(input.on)
        : { company: null, deal: null, person: null }
      if (!filed) return NOT_FOUND()
      if (!input.title.trim()) return problem('Say what needs doing')
      const users = await records.listUsers()
      const assignee =
        (users.ok ? users.data : []).find(
          (user) => user.id === input.assigneeId
        ) ?? ME
      const now = new Date().toISOString()
      const created = task({
        title: input.title.trim(),
        notes: input.notes?.trim() || null,
        dueOn: input.dueOn ?? null,
        assignee,
        ...filed,
        createdAt: now,
        updatedAt: now
      })
      tasks.push(created)
      return ok(created)
    },

    updateTask: async (id, input) => {
      const found = tasks.find((one) => one.id === id)
      if (!found) return NOT_FOUND()
      if (found.version !== input.version) return CHANGED()
      if (input.title !== undefined) found.title = input.title.trim()
      if (input.notes !== undefined) found.notes = input.notes?.trim() || null
      if (input.dueOn !== undefined) found.dueOn = input.dueOn
      if (input.assigneeId) {
        const users = await records.listUsers()
        found.assignee =
          (users.ok ? users.data : []).find(
            (user) => user.id === input.assigneeId
          ) ?? found.assignee
      }
      found.version += 1
      found.updatedAt = new Date().toISOString()
      return ok(found)
    },

    setTaskDone: (id, done, version) => {
      const found = tasks.find((one) => one.id === id)
      if (!found) return NOT_FOUND()
      if (Boolean(found.completedAt) === done) return ok(found)
      if (found.version !== version) return CHANGED()
      found.completedAt = done ? new Date().toISOString() : null
      found.version += 1
      return ok(found)
    },

    archiveTask: (id, version) => {
      const found = tasks.find((one) => one.id === id)
      if (!found) return NOT_FOUND()
      if (found.version !== version) return CHANGED()
      found.archivedAt = new Date().toISOString()
      found.version += 1
      return ok(found)
    },

    listPeople: async ({ type, id }) => {
      const everyone = await records.list('people', { limit: 200 })
      if (!everyone.ok) return everyone
      const linked = DEAL_PEOPLE[id] ?? []
      return ok(
        everyone.data.items.filter((person) =>
          type === 'company'
            ? person.company.id === id
            : linked.includes(person.id)
        )
      )
    }
  }
}
