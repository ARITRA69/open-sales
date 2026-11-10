// @vitest-environment happy-dom
import type {
  Role,
  TForecastReport,
  TPipelineReport,
  TReportDeal,
  TWonLostReport
} from '@open-sales/shared'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TRecordsBridge } from '@/hooks/use-records'

import { ASK_EVENT, type TAskDetail } from './ask-about'
import type { TReportsBridge } from './reports-bridge'
import { ReportsPage } from './reports-page'

const RANGE = { from: '2026-10-01', to: '2026-12-31' }

const deal = (id: string, changes: Partial<TReportDeal> = {}): TReportDeal => ({
  id,
  name: `Deal ${id}`,
  companyName: 'Halden Capital',
  ownerName: 'Ravi Shah',
  stage: { id: 'proposal', name: 'Proposal', winProbability: 50 },
  status: 'open',
  valueMinor: 500_000,
  currency: 'USD',
  closeDate: '2026-11-20',
  closedAt: null,
  lostReasonId: null,
  ...changes
})

const usd = (valueMinor: number) => ({ currency: 'USD', valueMinor })

const PIPELINE: TPipelineReport = {
  range: RANGE,
  currency: 'USD',
  deals: [
    deal('d1'),
    deal('d2', {
      name: 'Analytics add-on',
      stage: { id: 'qualified', name: 'Qualified', winProbability: 10 },
      valueMinor: 100_000
    })
  ],
  dealsTruncated: false,
  stages: [
    {
      stageId: 'qualified',
      name: 'Qualified',
      winProbability: 10,
      openCount: 1,
      openTotals: [usd(100_000)],
      entered: 3,
      movedOn: 1,
      conversion: 1 / 3
    },
    {
      stageId: 'proposal',
      name: 'Proposal',
      winProbability: 50,
      openCount: 1,
      openTotals: [usd(500_000)],
      entered: 0,
      movedOn: 0,
      conversion: null
    }
  ]
}

const WON_LOST: TWonLostReport = {
  range: RANGE,
  currency: 'USD',
  deals: [
    deal('w1', {
      name: 'Headquarters rollout',
      status: 'won',
      stage: { id: 'won', name: 'Won', winProbability: 100 },
      valueMinor: 1_000_000,
      closedAt: '2026-10-25T10:00:00.000Z'
    }),
    deal('l1', {
      name: 'Loyalty app',
      status: 'lost',
      stage: { id: 'lost', name: 'Lost', winProbability: 0 },
      valueMinor: 400_000,
      closedAt: '2026-10-09T10:00:00.000Z',
      lostReasonId: 'price'
    })
  ],
  dealsTruncated: false,
  won: { count: 1, totals: [usd(1_000_000)] },
  lost: { count: 1, totals: [usd(400_000)] },
  winRate: 0.5,
  reasons: [
    { reasonId: 'price', label: 'Price', count: 1, totals: [usd(400_000)] }
  ]
}

const NOTHING_CLOSED: TWonLostReport = {
  ...WON_LOST,
  deals: [],
  won: { count: 0, totals: [] },
  lost: { count: 0, totals: [] },
  winRate: null,
  reasons: []
}

const FORECAST: TForecastReport = {
  range: { from: '2026-11-10', to: '2027-01-31' },
  currency: 'USD',
  deals: [deal('d1'), deal('d9', { name: 'No date yet', closeDate: null })],
  dealsTruncated: false,
  months: [
    {
      month: '2026-11',
      count: 1,
      totals: [{ ...usd(500_000), weightedMinor: 250_000 }]
    },
    { month: '2026-12', count: 0, totals: [] },
    { month: '2027-01', count: 0, totals: [] }
  ],
  overdue: { count: 0, totals: [] },
  undated: {
    count: 1,
    totals: [{ ...usd(500_000), weightedMinor: 250_000 }]
  }
}

const ok = <TData,>(data: TData) => ({ ok: true as const, data })

const makeBridge = (overrides: Partial<TReportsBridge> = {}) =>
  ({
    getPipeline: vi.fn(async () => ok(PIPELINE)),
    getWonLost: vi.fn(async () => ok(WON_LOST)),
    getForecast: vi.fn(async () => ok(FORECAST)),
    ...overrides
  }) satisfies TReportsBridge

const person = (role: Role) => ({
  id: 'u-me',
  name: 'Asha Menon',
  email: 'asha@halden.com',
  role
})

// Only the owner filter reads it, for the list of people.
const RECORDS = {
  listUsers: async () =>
    ok([
      { id: 'u-me', name: 'Asha Menon' },
      { id: 'u-ravi', name: 'Ravi Shah' }
    ])
} as unknown as TRecordsBridge

const open = async (hash: string, role: Role, bridge = makeBridge()) => {
  window.location.hash = hash
  render(
    <ReportsPage bridge={bridge} me={person(role)} recordsBridge={RECORDS} />
  )
  // Lets the first report and the list of people load.
  await act(async () => {})
  return bridge
}

/** Picks a choice from one of the filter pills. */
const pick = async (pill: RegExp, choice: string) => {
  fireEvent.keyDown(screen.getByRole('button', { name: pill }), {
    key: 'Enter'
  })
  fireEvent.click(await screen.findByRole('menuitemradio', { name: choice }))
  await act(async () => {})
}

/** The reports the picker offers, by the names assistive tech hears. */
const shownReports = () =>
  ['Pipeline by stage', 'Won and lost', 'Forecast', 'Activity'].filter(
    (name) => screen.queryByRole('tab', { name }) !== null
  )

beforeEach(() => {
  window.location.hash = ''
})

afterEach(cleanup)

describe('the report picker', () => {
  it('offers all three reports to managers and admins', async () => {
    await open('#/reports', 'manager')

    expect(shownReports()).toEqual([
      'Pipeline by stage',
      'Won and lost',
      'Forecast'
    ])
  })

  it('hides the forecast from members', async () => {
    await open('#/reports', 'member')

    expect(shownReports()).toEqual(['Pipeline by stage', 'Won and lost'])
  })

  it('opens on the pipeline, and on whichever report the address names', async () => {
    const first = await open('#/reports', 'member')
    expect(first.getPipeline).toHaveBeenCalledWith({ period: 'this_quarter' })
    expect(
      screen
        .getByRole('tab', { name: 'Pipeline by stage' })
        .getAttribute('aria-selected')
    ).toBe('true')
    cleanup()

    const second = await open('#/reports/won-lost', 'member')
    expect(second.getWonLost).toHaveBeenCalledWith({ period: 'this_quarter' })
    expect(second.getPipeline).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Won and lost' })).toBeTruthy()
  })

  it('moves to a report’s own address when it’s picked', async () => {
    const bridge = await open('#/reports', 'admin')

    // Tabs change on pointer down, as Radix does.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Forecast' }))
    expect(window.location.hash).toBe('#/reports/forecast')
    await act(async () => {
      window.dispatchEvent(new Event('hashchange'))
    })

    expect(bridge.getForecast).toHaveBeenCalledWith({
      period: 'next_3_months'
    })
    expect(
      screen.getByRole('heading', { name: 'Forecast by close month' })
    ).toBeTruthy()
  })

  it('tells a member who opens the forecast’s address that it isn’t theirs', async () => {
    const bridge = await open('#/reports/forecast', 'member')

    expect(
      screen.getByText('The forecast is for managers and admins')
    ).toBeTruthy()
    expect(bridge.getForecast).not.toHaveBeenCalled()
    expect(screen.queryByRole('toolbar', { name: 'Filters' })).toBeNull()
  })

  it('says so when the server refuses a report', async () => {
    await open(
      '#/reports/forecast',
      'manager',
      makeBridge({
        getForecast: vi.fn(async () => ({
          ok: false as const,
          message: 'Only managers and admins see the forecast.',
          code: 'forbidden'
        }))
      })
    )

    expect(
      screen.getByText('This report is for managers and admins')
    ).toBeTruthy()
  })

  it('shows the empty page where there’s no server to ask', async () => {
    window.location.hash = '#/reports'
    render(<ReportsPage bridge={null} me={person('admin')} />)

    expect(screen.getByText('No numbers yet')).toBeTruthy()
    expect(screen.queryByRole('tab')).toBeNull()
  })
})

describe('the filters', () => {
  it('loads the report again for another period', async () => {
    const bridge = await open('#/reports/won-lost', 'member')

    await pick(/^Period: This quarter/, 'Last month')

    expect(bridge.getWonLost).toHaveBeenLastCalledWith({
      period: 'last_month'
    })
    expect(
      screen.getByRole('button', { name: 'Period: Last month' })
    ).toBeTruthy()
  })

  it('narrows to one owner: me, or someone on the team', async () => {
    const bridge = await open('#/reports', 'member')

    await pick(/^Owner: Everyone/, 'Me')
    expect(bridge.getPipeline).toHaveBeenLastCalledWith({
      period: 'this_quarter',
      ownerId: 'u-me'
    })

    await pick(/^Owner: Me/, 'Ravi Shah')
    expect(bridge.getPipeline).toHaveBeenLastCalledWith({
      period: 'this_quarter',
      ownerId: 'u-ravi'
    })
    // The card says whose numbers these are.
    expect(screen.getByText(/in Ravi Shah’s pipeline/)).toBeTruthy()
  })

  it('gives the forecast periods that look ahead', async () => {
    const bridge = await open('#/reports/forecast', 'admin')

    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Period: Next 3 months' }),
      { key: 'Enter' }
    )
    expect(
      (await screen.findAllByRole('menuitemradio')).map(
        (item) => item.textContent
      )
    ).toEqual([
      'This quarter',
      'Next 3 months',
      'Next 6 months',
      'Next 12 months'
    ])

    fireEvent.click(
      screen.getByRole('menuitemradio', { name: 'Next 6 months' })
    )
    await act(async () => {})
    expect(bridge.getForecast).toHaveBeenLastCalledWith({
      period: 'next_6_months'
    })
  })

  it('keeps the filters when the report changes', async () => {
    const bridge = await open('#/reports', 'member')
    await pick(/^Period: This quarter/, 'This year')
    await pick(/^Owner: Everyone/, 'Me')

    await act(async () => {
      window.location.hash = '#/reports/won-lost'
      window.dispatchEvent(new Event('hashchange'))
    })

    expect(bridge.getWonLost).toHaveBeenLastCalledWith({
      period: 'this_year',
      ownerId: 'u-me'
    })
  })
})

describe('a report', () => {
  it('draws the pipeline’s chart and the numbers under it', async () => {
    await open('#/reports', 'member')

    const chart = screen.getByRole('list', { name: 'Open deals by stage' })
    const [qualified, proposal] = within(chart).getAllByRole('listitem')
    expect(qualified.textContent).toContain('Qualified')
    expect(qualified.textContent).toContain('1 deal')
    expect(qualified.textContent).toContain(
      '33% moved on: 1 of 3 deals that entered'
    )
    expect(proposal.textContent).toContain(
      'No deals entered this stage in the period'
    )

    const table = screen.getByRole('table', {
      name: 'Pipeline by stage, in numbers'
    })
    expect(
      within(table)
        .getAllByRole('row')
        .map((row) => row.textContent)
    ).toEqual([
      'StageWin chanceOpen dealsOpen valueEnteredMoved onConversion',
      expect.stringMatching(/^Qualified10%1.*1,000.*3133%$/),
      expect.stringMatching(/^Proposal50%1.*5,000.*00—$/),
      expect.stringMatching(/^All stages2.*6,000/)
    ])
  })

  it('links every deal behind the numbers to its own page', async () => {
    await open('#/reports/won-lost', 'member')

    const deals = screen.getByRole('table', { name: 'Deals closed' })
    expect(
      within(deals)
        .getAllByRole('link')
        .map((link) => [
          link.getAttribute('aria-label'),
          link.getAttribute('href')
        ])
    ).toEqual([
      ['Open Headquarters rollout', '#/deals/w1'],
      ['Open Loyalty app', '#/deals/l1']
    ])
    expect(within(deals).getByText('Price')).toBeTruthy()
  })

  it('narrows the deals to the ones behind one number', async () => {
    await open('#/reports/won-lost', 'member')

    await pick(/^Show: Won and lost/, 'Lost: Price')

    const deals = screen.getByRole('table', { name: 'Deals closed' })
    expect(within(deals).queryByText('Headquarters rollout')).toBeNull()
    expect(within(deals).getByText('Loyalty app')).toBeTruthy()
  })

  it('shows the forecast’s months, weighted, and deals with no date apart', async () => {
    await open('#/reports/forecast', 'manager')

    const chart = screen.getByRole('list', { name: 'Forecast by close month' })
    const [november, december] = within(chart).getAllByRole('listitem')
    expect(november.textContent).toMatch(/Nov 2026.*2,500.*of.*5,000 · 1 deal/)
    expect(december.textContent).toContain('No deals')

    const table = screen.getByRole('table', {
      name: 'Forecast by close month, in numbers'
    })
    expect(within(table).getByText('Whole period')).toBeTruthy()
    expect(within(table).getByText('No close date')).toBeTruthy()
    expect(within(table).queryByText('Past their close date')).toBeNull()
  })

  it('never adds two currencies together', async () => {
    await open(
      '#/reports/won-lost',
      'member',
      makeBridge({
        getWonLost: vi.fn(async () =>
          ok({
            ...WON_LOST,
            won: {
              count: 2,
              totals: [usd(1_000_000), { currency: 'EUR', valueMinor: 300_000 }]
            }
          })
        )
      })
    )

    expect(screen.getByText(/These deals are in 2 currencies/)).toBeTruthy()
    const table = screen.getByRole('table', {
      name: 'Won and lost, in numbers'
    })
    expect(within(table).getByText(/10,000 \+ .*3,000/)).toBeTruthy()

    // The charts draw one currency at a time.
    expect(screen.getByText('Revenue won (USD)')).toBeTruthy()
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'EUR' }))
    expect(screen.getByText('Revenue won (EUR)')).toBeTruthy()
  })

  it('asks AI about a chart, naming the report and its filters', async () => {
    await open('#/reports/won-lost', 'member')
    await pick(/^Owner: Everyone/, 'Ravi Shah')

    const asked: TAskDetail[] = []
    const listen = (event: Event) =>
      asked.push((event as CustomEvent<TAskDetail>).detail)
    window.addEventListener(ASK_EVENT, listen)
    const card = screen
      .getByRole('heading', { name: 'Why deals were lost' })
      .closest('section') as HTMLElement
    fireEvent.click(
      within(card).getByRole('button', { name: 'Ask about this' })
    )
    window.removeEventListener(ASK_EVENT, listen)

    expect(asked).toEqual([
      {
        prompt: expect.stringMatching(
          /“Why deals were lost” report for this quarter \(.*Oct.*Dec.*2026\), for Ravi Shah’s deals/
        ),
        record: {
          type: 'report',
          id: 'won-lost?period=this_quarter&ownerId=u-ravi',
          label: 'Why deals were lost · This quarter · Ravi Shah'
        }
      }
    ])
  })
})

describe('a period with no deals', () => {
  it('says nothing closed, and offers a longer period', async () => {
    const getWonLost = vi
      .fn<TReportsBridge['getWonLost']>()
      .mockResolvedValueOnce(ok(NOTHING_CLOSED))
      .mockResolvedValue(ok(WON_LOST))
    await open('#/reports/won-lost', 'member', makeBridge({ getWonLost }))

    expect(screen.getByText('No deals closed in this period')).toBeTruthy()
    expect(
      // Dates follow the computer's custom: "1 Oct" here, "Oct 1" elsewhere.
      screen.getByText(/No deals were won or lost between .*Oct.*Dec.*2026/)
    ).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()

    fireEvent.click(
      screen.getByRole('button', { name: 'Show the last 12 months' })
    )
    await act(async () => {})

    expect(getWonLost).toHaveBeenLastCalledWith({ period: 'last_12_months' })
    expect(
      screen.getByRole('button', { name: 'Period: Last 12 months' })
    ).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Won and lost' })).toBeTruthy()
  })

  it('offers everyone’s deals when one person has none', async () => {
    const empty: TPipelineReport = {
      ...PIPELINE,
      deals: [],
      stages: PIPELINE.stages.map((stage) => ({
        ...stage,
        openCount: 0,
        openTotals: [],
        entered: 0,
        movedOn: 0,
        conversion: null
      }))
    }
    const getPipeline = vi
      .fn<TReportsBridge['getPipeline']>()
      .mockImplementation(async (query) =>
        ok(query?.ownerId ? empty : PIPELINE)
      )
    await open('#/reports', 'member', makeBridge({ getPipeline }))
    await pick(/^Owner: Everyone/, 'Ravi Shah')

    expect(screen.getByText('No deals in the pipeline')).toBeTruthy()
    expect(screen.getByText(/Ravi Shah has no open deals/)).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', { name: 'Show everyone’s deals' })
    )
    await act(async () => {})

    expect(screen.getByRole('button', { name: 'Owner: Everyone' })).toBeTruthy()
    expect(
      screen.getByRole('list', { name: 'Open deals by stage' })
    ).toBeTruthy()
  })

  it('says there’s nothing to forecast', async () => {
    await open(
      '#/reports/forecast',
      'admin',
      makeBridge({
        getForecast: vi.fn(async () =>
          ok({
            ...FORECAST,
            deals: [],
            months: FORECAST.months.map((month) => ({
              ...month,
              count: 0,
              totals: []
            })),
            undated: { count: 0, totals: [] }
          })
        )
      })
    )

    expect(screen.getByText('Nothing to forecast')).toBeTruthy()
  })
})
