/*
 * Fills an empty development database with pretend sales data, so every page
 * has something to show: `bun run db:seed` in apps/server.
 *
 * It needs the admin account to exist already (create it in the app first),
 * and it only fills: a database that already has accounts is left alone.
 * Everything goes through the same services the API uses, as that admin, so
 * owners, versions, stage history and the change log are all real. Dates are
 * then moved into the past, which the services have no reason to allow.
 *
 * Every company, person and address here is made up.
 */
import type { TDeal, TSessionUser } from '@open-sales/shared'
import { asc, count, eq } from 'drizzle-orm'

import { createDatabase } from '../src/db/client'
import { runMigrations } from '../src/db/migrate'
import { company, deal, dealStageChange, lead, user } from '../src/db/schema'
import { createLeadsService } from '../src/leads/leads'
import { createProposalsService } from '../src/proposals/service'
import { createRecordsService } from '../src/records/routes'
import { createContractService } from '../src/renewals/contracts'

// The dev database from docker compose, unless .env says otherwise.
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgres://open_sales:open-sales@localhost:5433/open_sales'

const DAY_MS = 24 * 60 * 60 * 1000
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS)
// A plain date, as the server stores them: 2026-11-30.
const day = (days: number) => daysFromNow(days).toISOString().slice(0, 10)
const money = (major: number) => major * 100

type TOwnerKey = 'me' | 'mo' | 'ravi' | 'lena'

// Teammates who own some of the records. They have no password, so nobody
// can sign in as them.
const TEAMMATES = [
  { key: 'mo', id: 'seed-mo', name: 'Mo Rahman', role: 'manager' },
  { key: 'ravi', id: 'seed-ravi', name: 'Ravi Shah', role: 'member' },
  { key: 'lena', id: 'seed-lena', name: 'Lena Ortiz', role: 'member' }
] as const

type TSeedCompany = {
  key: string
  name: string
  domain: string
  industry: string
  description: string
  owner: TOwnerKey
  people: { key: string; name: string; title: string }[]
}

const COMPANIES: TSeedCompany[] = [
  {
    key: 'halden',
    name: 'Halden Capital',
    domain: 'halden.example',
    industry: 'Financial services',
    description: 'Mid-market lender. 140 people, three offices.',
    owner: 'me',
    people: [
      { key: 'dan', name: 'Dan Okafor', title: 'Head of Operations' },
      { key: 'priya', name: 'Priya Nair', title: 'Finance Director' },
      { key: 'tom', name: 'Tom Lindqvist', title: 'IT Manager' }
    ]
  },
  {
    key: 'northwind',
    name: 'Northwind Logistics',
    domain: 'northwind-logistics.example',
    industry: 'Logistics',
    description: 'Regional freight and warehousing. Outgrowing spreadsheets.',
    owner: 'me',
    people: [
      { key: 'sara', name: 'Sara Whitfield', title: 'COO' },
      { key: 'jamal', name: 'Jamal Reyes', title: 'Operations Lead' }
    ]
  },
  {
    key: 'brightside',
    name: 'Brightside Dental Group',
    domain: 'brightside-dental.example',
    industry: 'Healthcare',
    description: 'Twelve dental practices under one group.',
    owner: 'me',
    people: [
      { key: 'elena', name: 'Elena Marsh', title: 'Practice Director' },
      { key: 'owen', name: 'Owen Blake', title: 'Office Manager' }
    ]
  },
  {
    key: 'kestrel',
    name: 'Kestrel Robotics',
    domain: 'kestrel-robotics.example',
    industry: 'Manufacturing',
    description: 'Warehouse robots. Series B, hiring fast.',
    owner: 'ravi',
    people: [
      { key: 'mei', name: 'Mei Tanaka', title: 'VP Sales' },
      { key: 'felix', name: 'Felix Brandt', title: 'Revenue Operations' }
    ]
  },
  {
    key: 'lumen',
    name: 'Lumen Studio',
    domain: 'lumen-studio.example',
    industry: 'Design agency',
    description: 'Brand and product design, 35 people.',
    owner: 'ravi',
    people: [
      { key: 'nora', name: 'Nora Haddad', title: 'Managing Partner' },
      { key: 'ivo', name: 'Ivo Petrov', title: 'Studio Manager' }
    ]
  },
  {
    key: 'fernbank',
    name: 'Fernbank Foods',
    domain: 'fernbank-foods.example',
    industry: 'Food and drink',
    description: 'Wholesale bakery supplying cafés and grocers.',
    owner: 'ravi',
    people: [
      { key: 'grace', name: 'Grace Adeyemi', title: 'Commercial Director' }
    ]
  },
  {
    key: 'atlas',
    name: 'Atlas Property Partners',
    domain: 'atlas-property.example',
    industry: 'Real estate',
    description: 'Commercial lettings across four cities.',
    owner: 'lena',
    people: [
      { key: 'hugo', name: 'Hugo Castell', title: 'Partner' },
      { key: 'amara', name: 'Amara Diallo', title: 'Head of Lettings' }
    ]
  },
  {
    key: 'quill',
    name: 'Quill & Co Legal',
    domain: 'quill-legal.example',
    industry: 'Legal',
    description: 'Boutique employment law firm.',
    owner: 'lena',
    people: [
      { key: 'beatrix', name: 'Beatrix Lowe', title: 'Managing Partner' },
      { key: 'sam', name: 'Sam Kowalski', title: 'Practice Manager' }
    ]
  },
  {
    key: 'tidewater',
    name: 'Tidewater Energy',
    domain: 'tidewater-energy.example',
    industry: 'Energy',
    description: 'Solar installer for commercial rooftops.',
    owner: 'lena',
    people: [
      { key: 'rosa', name: 'Rosa Jimenez', title: 'Sales Director' },
      { key: 'kwame', name: 'Kwame Mensah', title: 'Operations Manager' }
    ]
  },
  {
    key: 'marlow',
    name: 'Marlow Education',
    domain: 'marlow-education.example',
    industry: 'Education',
    description: 'Tutoring centres and online courses.',
    owner: 'mo',
    people: [
      { key: 'isla', name: 'Isla Fraser', title: 'Chief Executive' },
      { key: 'ben', name: 'Ben Achterberg', title: 'Head of Admissions' }
    ]
  },
  {
    key: 'copperline',
    name: 'Copperline Telecom',
    domain: 'copperline.example',
    industry: 'Telecoms',
    description: 'Business broadband reseller, 60 people.',
    owner: 'mo',
    people: [{ key: 'leo', name: 'Leo Vasquez', title: 'Head of Partnerships' }]
  },
  {
    key: 'pinecrest',
    name: 'Pinecrest Outdoors',
    domain: 'pinecrest-outdoors.example',
    industry: 'Retail',
    description: 'Outdoor clothing, nine shops and a web store.',
    owner: 'me',
    people: [
      { key: 'anya', name: 'Anya Sokolova', title: 'Retail Director' },
      { key: 'chidi', name: 'Chidi Eze', title: 'E-commerce Lead' }
    ]
  }
]

type TSeedDeal = {
  key: string
  company: string
  name: string
  value: number
  // How far it got: the index of an open stage, or where it closed.
  stage: number | 'won' | 'lost'
  // For a lost deal: the last open stage it reached.
  reached?: number
  // Days ago it was created, and days it has sat where it is now.
  age: number
  idle: number
  // Days from now it should close (negative: when it did).
  closeIn: number
  nextStep?: string
  lostReason?: string
  lostNote?: string
  people: string[]
}

const DEALS: TSeedDeal[] = [
  // Open, mine.
  {
    key: 'halden-expansion',
    company: 'halden',
    name: 'Halden Capital: 25 more seats',
    value: 18_000,
    stage: 2,
    age: 34,
    idle: 3,
    closeIn: 18,
    nextStep: 'Send pricing for 25 seats by Friday',
    people: ['dan', 'priya']
  },
  {
    key: 'northwind-rollout',
    company: 'northwind',
    name: 'Northwind: warehouse rollout',
    value: 42_000,
    stage: 3,
    age: 61,
    idle: 16,
    closeIn: 9,
    nextStep: 'Chase legal on the contract redlines',
    people: ['sara', 'jamal']
  },
  {
    key: 'brightside-pilot',
    company: 'brightside',
    name: 'Brightside: three-practice pilot',
    value: 9_500,
    stage: 1,
    age: 12,
    idle: 5,
    closeIn: 40,
    nextStep: 'Demo for the practice managers on Tuesday',
    people: ['elena']
  },
  {
    key: 'pinecrest-stores',
    company: 'pinecrest',
    name: 'Pinecrest: shop staff licences',
    value: 14_400,
    stage: 0,
    age: 4,
    idle: 4,
    closeIn: 55,
    nextStep: 'Book a discovery call with Anya',
    people: ['anya']
  },
  {
    key: 'pinecrest-web',
    company: 'pinecrest',
    name: 'Pinecrest: web store add-on',
    value: 6_000,
    stage: 1,
    age: 45,
    idle: 27,
    closeIn: 30,
    nextStep: 'Waiting on Chidi for traffic numbers',
    people: ['chidi']
  },
  // Open, the team's.
  {
    key: 'kestrel-sales',
    company: 'kestrel',
    name: 'Kestrel: sales team of 40',
    value: 36_000,
    stage: 2,
    age: 29,
    idle: 12,
    closeIn: 21,
    nextStep: 'Mei to review the proposal with finance',
    people: ['mei', 'felix']
  },
  {
    key: 'lumen-studio',
    company: 'lumen',
    name: 'Lumen Studio: whole studio',
    value: 8_400,
    stage: 0,
    age: 7,
    idle: 7,
    closeIn: 45,
    nextStep: 'Send the case study Nora asked for',
    people: ['nora']
  },
  {
    key: 'fernbank-wholesale',
    company: 'fernbank',
    name: 'Fernbank: wholesale accounts team',
    value: 11_200,
    stage: 3,
    age: 52,
    idle: 4,
    closeIn: 6,
    nextStep: 'Contract out for signature',
    people: ['grace']
  },
  {
    key: 'atlas-lettings',
    company: 'atlas',
    name: 'Atlas: lettings team',
    value: 27_500,
    stage: 1,
    age: 20,
    idle: 19,
    closeIn: 35,
    nextStep: 'Second call with Amara, no reply yet',
    people: ['hugo', 'amara']
  },
  {
    key: 'tidewater-field',
    company: 'tidewater',
    name: 'Tidewater: field sales',
    value: 19_800,
    stage: 2,
    age: 26,
    idle: 2,
    closeIn: 24,
    nextStep: 'Rosa wants a quote with annual billing',
    people: ['rosa']
  },
  {
    key: 'marlow-admissions',
    company: 'marlow',
    name: 'Marlow: admissions team',
    value: 13_000,
    stage: 0,
    age: 9,
    idle: 9,
    closeIn: 60,
    nextStep: 'Intro call with Ben',
    people: ['isla', 'ben']
  },
  {
    key: 'copperline-partners',
    company: 'copperline',
    name: 'Copperline: partner channel',
    value: 31_000,
    stage: 3,
    age: 70,
    idle: 13,
    closeIn: 12,
    nextStep: 'Agree the discount for a two-year term',
    people: ['leo']
  },
  // Won.
  {
    key: 'halden-first',
    company: 'halden',
    name: 'Halden Capital: first 40 seats',
    value: 28_800,
    stage: 'won',
    age: 380,
    idle: 340,
    closeIn: -340,
    people: ['dan']
  },
  {
    key: 'northwind-office',
    company: 'northwind',
    name: 'Northwind: head office',
    value: 16_500,
    stage: 'won',
    age: 345,
    idle: 310,
    closeIn: -310,
    people: ['sara']
  },
  {
    key: 'quill-firm',
    company: 'quill',
    name: 'Quill & Co: whole firm',
    value: 12_000,
    stage: 'won',
    age: 320,
    idle: 285,
    closeIn: -285,
    people: ['beatrix', 'sam']
  },
  {
    key: 'kestrel-pilot',
    company: 'kestrel',
    name: 'Kestrel: pilot team',
    value: 7_200,
    stage: 'won',
    age: 75,
    idle: 38,
    closeIn: -38,
    people: ['mei']
  },
  {
    key: 'tidewater-office',
    company: 'tidewater',
    name: 'Tidewater: office team',
    value: 9_000,
    stage: 'won',
    age: 48,
    idle: 15,
    closeIn: -15,
    people: ['kwame']
  },
  {
    key: 'marlow-online',
    company: 'marlow',
    name: 'Marlow: online courses team',
    value: 21_000,
    stage: 'won',
    age: 40,
    idle: 6,
    closeIn: -6,
    people: ['isla']
  },
  // Lost.
  {
    key: 'lumen-freelancers',
    company: 'lumen',
    name: 'Lumen Studio: freelancer seats',
    value: 3_600,
    stage: 'lost',
    reached: 1,
    age: 66,
    idle: 31,
    closeIn: -31,
    lostReason: 'No budget',
    lostNote: 'Parked until their next financial year.',
    people: ['ivo']
  },
  {
    key: 'atlas-residential',
    company: 'atlas',
    name: 'Atlas: residential arm',
    value: 22_000,
    stage: 'lost',
    reached: 3,
    age: 90,
    idle: 22,
    closeIn: -22,
    lostReason: 'Chose a competitor',
    lostNote: 'Went with the tool their parent company already uses.',
    people: ['hugo']
  },
  {
    key: 'fernbank-drivers',
    company: 'fernbank',
    name: 'Fernbank: delivery drivers',
    value: 5_400,
    stage: 'lost',
    reached: 2,
    age: 58,
    idle: 11,
    closeIn: -11,
    lostReason: 'Price',
    lostNote: 'Wanted per-driver pricing we don’t offer.',
    people: ['grace']
  },
  {
    key: 'copperline-support',
    company: 'copperline',
    name: 'Copperline: support desk',
    value: 15_000,
    stage: 'lost',
    reached: 0,
    age: 50,
    idle: 44,
    closeIn: -44,
    lostReason: 'No decision',
    people: ['leo']
  }
]

const NOTES: { deal: string; body: string }[] = [
  {
    deal: 'halden-expansion',
    body: 'Dan wants the new seats live before their January hiring wave. Priya signs off anything over 15k, so she needs the pricing in writing.'
  },
  {
    deal: 'northwind-rollout',
    body: 'Their legal team sent redlines on liability and data retention. Sara says the board meets on the 20th and wants it signed before then.'
  },
  {
    deal: 'brightside-pilot',
    body: 'Three practices to start: the two city sites and the new one. Elena will pick a manager at each to own the rollout.'
  },
  {
    deal: 'kestrel-sales',
    body: 'Mei liked the proposal. Finance asked whether we can split billing across two entities.'
  },
  {
    deal: 'atlas-lettings',
    body: 'Amara has gone quiet since the first call. Hugo is still keen, so try him directly.'
  },
  {
    deal: 'pinecrest-web',
    body: 'Chidi promised last quarter’s traffic numbers three weeks ago. Nothing since.'
  }
]

const CALLS: {
  deal: string
  daysAgo: number
  outcome: 'connected' | 'voicemail' | 'no_answer'
  body?: string
  people: string[]
}[] = [
  {
    deal: 'halden-expansion',
    daysAgo: 3,
    outcome: 'connected',
    body: 'Dan asked for pricing on 25 seats by Friday. They also want onboarding help for the new starters. Budget is fine if it lands under 20k.',
    people: ['dan']
  },
  {
    deal: 'northwind-rollout',
    daysAgo: 16,
    outcome: 'connected',
    body: 'Walked Sara and Jamal through the rollout plan. Agreed two warehouses first, the rest in the new year.',
    people: ['sara', 'jamal']
  },
  {
    deal: 'tidewater-field',
    daysAgo: 2,
    outcome: 'connected',
    body: 'Rosa wants annual billing and a quote she can take to her director this week.',
    people: ['rosa']
  },
  {
    deal: 'atlas-lettings',
    daysAgo: 6,
    outcome: 'voicemail',
    people: ['amara']
  },
  {
    deal: 'pinecrest-web',
    daysAgo: 10,
    outcome: 'no_answer',
    people: ['chidi']
  }
]

const TASKS: {
  deal: string
  title: string
  dueIn: number
  assignee: TOwnerKey
}[] = [
  {
    deal: 'halden-expansion',
    title: 'Send pricing for 25 seats to Dan',
    dueIn: 0,
    assignee: 'me'
  },
  {
    deal: 'northwind-rollout',
    title: 'Reply to legal on the liability clause',
    dueIn: -2,
    assignee: 'me'
  },
  {
    deal: 'brightside-pilot',
    title: 'Prepare the demo for the practice managers',
    dueIn: 1,
    assignee: 'me'
  },
  {
    deal: 'pinecrest-web',
    title: 'Chase Chidi for the traffic numbers',
    dueIn: -5,
    assignee: 'me'
  },
  {
    deal: 'pinecrest-stores',
    title: 'Book a discovery call with Anya',
    dueIn: 3,
    assignee: 'me'
  },
  {
    deal: 'kestrel-sales',
    title: 'Ask finance about split billing',
    dueIn: 0,
    assignee: 'ravi'
  },
  {
    deal: 'atlas-lettings',
    title: 'Call Hugo directly',
    dueIn: -1,
    assignee: 'lena'
  },
  {
    deal: 'tidewater-field',
    title: 'Send Rosa the annual-billing quote',
    dueIn: 2,
    assignee: 'lena'
  }
]

type TSeedLead = {
  name: string
  email: string
  companyName: string
  title: string
  message: string
  // Who it's with: null waits for anyone to take it.
  owner: TOwnerKey | null
  source: 'web_form' | 'import' | 'email' | 'manual'
  daysAgo: number
  fitNote?: string
  disqualify?: string
}

const LEADS: TSeedLead[] = [
  {
    name: 'Hannah Voss',
    email: 'hannah.voss@greyfield-partners.example',
    companyName: 'Greyfield Partners',
    title: 'Operations Director',
    message:
      'We are 60 people and our sales team lives in spreadsheets. Could someone show us how this works?',
    owner: null,
    source: 'web_form',
    daysAgo: 0,
    fitNote:
      'Matches your usual customer: 60 people, professional services, no CRM today.'
  },
  {
    name: 'Marcus Bell',
    email: 'marcus@bellwether-supply.example',
    companyName: 'Bellwether Supply',
    title: 'Sales Manager',
    message: 'Looking for pricing for a team of 12. We self-host everything.',
    owner: null,
    source: 'web_form',
    daysAgo: 1,
    fitNote: 'Good fit: self-hosting is a requirement, team of 12.'
  },
  {
    name: 'Tom Lindqvist',
    email: 'tom.lindqvist@halden.example',
    companyName: 'Halden Capital',
    title: 'IT Manager',
    message:
      'Our lending team in the Leeds office wants to try it too. Who do I talk to?',
    owner: null,
    source: 'email',
    daysAgo: 1,
    fitNote:
      'Halden Capital is already an account. This looks like an expansion.'
  },
  {
    name: 'Yusuf Demir',
    email: 'yusuf@orchard-clinics.example',
    companyName: 'Orchard Clinics',
    title: 'Group Manager',
    message: 'Saw you work with dental groups. We run eight physio clinics.',
    owner: 'me',
    source: 'web_form',
    daysAgo: 2,
    fitNote: 'Similar to Brightside Dental Group: multi-site healthcare.'
  },
  {
    name: 'Claire Osei',
    email: 'claire.osei@fairmont-freight.example',
    companyName: 'Fairmont Freight',
    title: 'Commercial Lead',
    message: 'Met Sara from Northwind at a trade show. She recommended you.',
    owner: 'me',
    source: 'manual',
    daysAgo: 3,
    fitNote: 'Referral from an existing customer in the same industry.'
  },
  {
    name: 'Devon Park',
    email: 'devon@sunhaven-solar.example',
    companyName: 'Sunhaven Solar',
    title: 'Founder',
    message: 'Five-person team, growing. What does it cost to get started?',
    owner: 'ravi',
    source: 'import',
    daysAgo: 5
  },
  {
    name: 'Ingrid Aalto',
    email: 'ingrid@aalto-architects.example',
    companyName: 'Aalto Architects',
    title: 'Partner',
    message: 'We need something to track bids. Is this the right tool?',
    owner: 'lena',
    source: 'import',
    daysAgo: 6,
    fitNote: 'Unclear fit: they track bids, not a sales pipeline.'
  },
  {
    name: 'Pat Morrow',
    email: 'pat@morrow-consulting.example',
    companyName: 'Morrow Consulting',
    title: 'Consultant',
    message: 'Do you have a free plan for one person?',
    owner: 'me',
    source: 'web_form',
    daysAgo: 8,
    disqualify: 'One-person business. Not who we sell to.'
  }
]

const run = async () => {
  const { db, sql: connection } = createDatabase(DATABASE_URL)
  try {
    await runMigrations(db)

    const [admin] = await db
      .select()
      .from(user)
      .where(eq(user.role, 'admin'))
      .orderBy(asc(user.createdAt))
      .limit(1)
    if (!admin || admin.status !== 'active') {
      console.log(
        'No admin account yet. Open the app, create the admin account, then run this again.'
      )
      return
    }
    const [{ total }] = await db.select({ total: count() }).from(company)
    if (total > 0) {
      console.log(
        `This database already has ${total} accounts, so nothing was added. Seeding only fills an empty one.`
      )
      return
    }

    const me: TSessionUser = {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: 'admin'
    }
    await db
      .insert(user)
      .values(
        TEAMMATES.map(({ id, name, role }) => ({
          id,
          name,
          role,
          email: `${id}@team.example`,
          status: 'active'
        }))
      )
      .onConflictDoNothing()
    const ownerIds: Record<TOwnerKey, string> = {
      me: me.id,
      mo: 'seed-mo',
      ravi: 'seed-ravi',
      lena: 'seed-lena'
    }

    const records = createRecordsService(db)
    const { activities, tasks } = records.timeline

    // Accounts and their people.
    const companyIds = new Map<string, string>()
    const personIds = new Map<string, string>()
    for (const seed of COMPANIES) {
      const made = await records.companies.create(me, {
        name: seed.name,
        domain: seed.domain,
        industry: seed.industry,
        description: seed.description,
        ownerId: ownerIds[seed.owner]
      })
      companyIds.set(seed.key, made.id)
      for (const person of seed.people) {
        const [first, last] = person.name.toLowerCase().split(' ')
        const added = await records.people.create(me, {
          companyId: made.id,
          name: person.name,
          title: person.title,
          email: `${first}.${last}@${seed.domain}`
        })
        personIds.set(person.key, added.id)
      }
    }

    // Deals, walked through the stages one at a time so each has a history.
    const pipeline = await records.pipeline.get()
    const open = pipeline.stages.filter((stage) => stage.kind === 'open')
    const won = pipeline.stages.find((stage) => stage.kind === 'won')
    const lost = pipeline.stages.find((stage) => stage.kind === 'lost')
    if (open.length === 0 || !won || !lost) {
      throw new Error('The pipeline needs open, Won and Lost stages.')
    }
    const openStage = (index: number) => open[Math.min(index, open.length - 1)]!
    const lostReasonId = (label: string | undefined) =>
      (
        pipeline.lostReasons.find((reason) => reason.label === label) ??
        pipeline.lostReasons[0]
      )?.id

    const deals = new Map<string, TDeal>()
    for (const seed of DEALS) {
      const lastOpen =
        typeof seed.stage === 'number'
          ? seed.stage
          : seed.stage === 'won'
            ? open.length - 1
            : (seed.reached ?? 0)
      let current = await records.deals.create(me, {
        companyId: companyIds.get(seed.company)!,
        name: seed.name,
        valueMinor: money(seed.value),
        closeDate: day(seed.closeIn),
        nextStep: seed.nextStep,
        stageId: openStage(0).id,
        personIds: seed.people.map((key) => personIds.get(key)!)
      })
      for (let index = 1; index <= lastOpen; index += 1) {
        current = await records.deals.update(me, current.id, {
          stageId: openStage(index).id,
          version: current.version
        })
      }
      if (seed.stage === 'won') {
        current = await records.deals.update(me, current.id, {
          stageId: won.id,
          version: current.version
        })
      }
      if (seed.stage === 'lost') {
        current = await records.deals.update(me, current.id, {
          stageId: lost.id,
          lostReasonId: lostReasonId(seed.lostReason),
          lostNote: seed.lostNote,
          version: current.version
        })
      }

      // Move it into the past: created `age` days ago, in its current stage
      // for `idle` days, with the moves spread evenly between.
      const createdAt = daysFromNow(-seed.age)
      const enteredAt = daysFromNow(-seed.idle)
      const moves = await db
        .select({ id: dealStageChange.id })
        .from(dealStageChange)
        .where(eq(dealStageChange.dealId, current.id))
        .orderBy(asc(dealStageChange.id))
      for (const [index, move] of moves.entries()) {
        const share = moves.length > 1 ? index / (moves.length - 1) : 1
        const changedAt = new Date(
          createdAt.getTime() +
            share * (enteredAt.getTime() - createdAt.getTime())
        )
        await db
          .update(dealStageChange)
          .set({ changedAt })
          .where(eq(dealStageChange.id, move.id))
      }
      await db
        .update(deal)
        .set({
          createdAt,
          stageEnteredAt: enteredAt,
          lastActivityAt: enteredAt,
          ...(seed.stage === 'won' || seed.stage === 'lost'
            ? { closedAt: enteredAt }
            : {})
        })
        .where(eq(deal.id, current.id))
      deals.set(seed.key, current)
    }
    const dealOf = (key: string) => deals.get(key)!

    // Notes, calls and tasks on the open deals.
    for (const note of NOTES) {
      await activities.create(me, {
        type: 'note',
        on: { type: 'deal', id: dealOf(note.deal).id },
        body: note.body
      })
    }
    for (const call of CALLS) {
      await activities.create(me, {
        type: 'call',
        on: { type: 'deal', id: dealOf(call.deal).id },
        occurredAt: daysFromNow(-call.daysAgo).toISOString(),
        outcome: call.outcome,
        body: call.body,
        personIds: call.people.map((key) => personIds.get(key)!)
      })
    }
    for (const task of TASKS) {
      await tasks.create(me, {
        title: task.title,
        dueOn: day(task.dueIn),
        assigneeId: ownerIds[task.assignee],
        on: { type: 'deal', id: dealOf(task.deal).id }
      })
    }

    // Contracts on three of the won deals, renewing inside 90 days. The other
    // won deals stay without one, for "Won deals without a contract".
    const contracts = createContractService(db)
    const CONTRACTS = [
      { deal: 'halden-first', renewsIn: 25 },
      { deal: 'northwind-office', renewsIn: 55 },
      { deal: 'quill-firm', renewsIn: 80 }
    ]
    for (const contract of CONTRACTS) {
      const from = dealOf(contract.deal)
      await contracts.create(me, {
        dealId: from.id,
        startsOn: day(contract.renewsIn - 365),
        renewsOn: day(contract.renewsIn),
        valueMinor: from.valueMinor ?? 0
      })
    }

    // Leads: some for anyone to take, some already with a person.
    const leads = createLeadsService(db)
    for (const seed of LEADS) {
      const made = await leads.create(me, {
        name: seed.name,
        email: seed.email,
        companyName: seed.companyName,
        title: seed.title,
        message: seed.message,
        ownerId: seed.owner === null ? null : ownerIds[seed.owner]
      })
      // Where it came from, when, and the AI's note: nothing in the app
      // writes these yet.
      await db
        .update(lead)
        .set({
          source: seed.source,
          fitNote: seed.fitNote ?? null,
          createdAt: daysFromNow(-seed.daysAgo)
        })
        .where(eq(lead.id, made.id))
      if (seed.disqualify) {
        await leads.disqualify(me, made.id, {
          version: made.version,
          reason: seed.disqualify
        })
      }
    }

    // Proposals waiting for the admin on Today, as their AI tool would make
    // them. Deals are read again first: the proposal names the version it saw.
    const proposals = createProposalsService(db)
    const halden = await records.deals.get(me, dealOf('halden-expansion').id)
    await proposals.create(me, {
      kind: 'update',
      targetType: 'deal',
      targetId: halden.id,
      baseVersion: halden.version,
      changes: [
        { field: 'valueMinor', to: money(25_000) },
        { field: 'nextStep', to: 'Send pricing and onboarding plan by Friday' }
      ],
      title: 'Update Halden Capital: 25 more seats',
      why: 'Dan asked for pricing by Friday and wants onboarding help included.',
      sources: [
        { type: 'call', id: 'seed-call-halden', label: 'Call with Dan' }
      ],
      engine: 'claude-code'
    })
    const tidewater = await records.deals.get(me, dealOf('tidewater-field').id)
    await proposals.create(me, {
      kind: 'update',
      targetType: 'deal',
      targetId: tidewater.id,
      baseVersion: tidewater.version,
      changes: [
        { field: 'stageId', to: openStage(3).id },
        { field: 'closeDate', to: day(10) }
      ],
      title: 'Move Tidewater: field sales forward',
      why: 'Rosa has the proposal and asked for a quote to take to her director this week.',
      sources: [
        { type: 'call', id: 'seed-call-tidewater', label: 'Call with Rosa' }
      ],
      engine: 'claude-code'
    })
    const sara = await records.people.get(me, personIds.get('sara')!)
    await proposals.create(me, {
      kind: 'update',
      targetType: 'person',
      targetId: sara.id,
      baseVersion: sara.version,
      changes: [{ field: 'title', to: 'Chief Operating Officer' }],
      title: 'Update Sara Whitfield’s title',
      why: 'Her email signature now says Chief Operating Officer.',
      sources: [
        { type: 'email', id: 'seed-email-sara', label: 'Email from Sara' }
      ],
      engine: 'codex'
    })
    await proposals.create(me, {
      kind: 'create',
      targetType: 'person',
      changes: [
        { field: 'name', to: 'Leila Farouk' },
        { field: 'title', to: 'Procurement Lead' },
        { field: 'email', to: 'leila.farouk@northwind-logistics.example' },
        { field: 'companyId', to: companyIds.get('northwind')! }
      ],
      title: 'Add Leila Farouk at Northwind Logistics',
      why: 'Sara copied her on the contract thread as the person who signs purchase orders.',
      sources: [
        { type: 'email', id: 'seed-email-leila', label: 'Contract redlines' }
      ],
      engine: 'claude-code'
    })

    console.log(
      [
        `Added to ${new URL(DATABASE_URL).pathname.slice(1)}:`,
        `  ${TEAMMATES.length} teammates (they can’t sign in)`,
        `  ${COMPANIES.length} accounts and ${personIds.size} people`,
        `  ${DEALS.length} deals, with ${NOTES.length} notes, ${CALLS.length} calls and ${TASKS.length} tasks`,
        `  ${CONTRACTS.length} contracts, ${LEADS.length} leads and 4 proposals waiting for ${me.name}`
      ].join('\n')
    )
  } finally {
    await connection.end()
  }
}

await run()
