// @vitest-environment happy-dom
import type { TDeal, TSessionUser } from '@open-sales/shared'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { formatMoney } from '@/lib/money'

import { PipelinePage } from '../records/pipeline-page'
import {
  ASHA,
  DAN,
  daysAgo,
  makeBridge,
  makeDeal,
  sessionUser
} from './test-data'

const DEALS: TDeal[] = [
  makeDeal({
    id: 'a',
    name: 'Analytics add-on',
    owner: ASHA,
    stageId: 'qualified',
    valueMinor: 1_200_000,
    closeDate: '2026-11-30'
  }),
  makeDeal({
    id: 'b',
    name: 'Store pilot',
    owner: DAN,
    stageId: 'qualified',
    valueMinor: 2_500_000,
    closeDate: '2026-12-15'
  }),
  makeDeal({
    id: 'c',
    name: 'Platform rollout',
    owner: ASHA,
    stageId: 'proposal',
    valueMinor: 4_800_000,
    closeDate: '2026-12-20',
    // Proposal allows 10 idle days.
    stageEnteredAt: daysAgo(16)
  })
]

const money = (minor: number) => formatMoney(minor, 'USD', { compact: true })

const renderPage = async (
  me: TSessionUser = sessionUser(ASHA, 'manager'),
  bridgeOf = makeBridge(DEALS)
) => {
  const createDeal = vi.fn(async (input: { name: string }) => ({
    ok: true as const,
    data: makeDeal({ id: 'made', name: input.name })
  }))
  const view = render(
    <PipelinePage bridge={bridgeOf.bridge} createDeal={createDeal} me={me} />
  )
  await screen.findByRole('toolbar', { name: 'Pipeline filters' })
  return { ...bridgeOf, ...view, createDeal }
}

// `hidden` too: an open dialog hides the page behind it from assistive tech.
const column = (name: string) =>
  screen.getByRole('region', { name, hidden: true })
const card = (name: string) =>
  screen.queryByRole('button', { name: `Edit ${name}` })

// Tabs change on mouse down, as Radix has them.
const showList = () =>
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'List' }), { button: 0 })

/** Opens a menu and picks one of its items: a choice, or a tick box. */
const pick = async (
  trigger: string | RegExp,
  item: string | RegExp,
  role: 'menuitem' | 'menuitemradio' | 'menuitemcheckbox' = 'menuitemradio'
) => {
  fireEvent.keyDown(screen.getByRole('button', { name: trigger }), {
    key: 'Enter'
  })
  fireEvent.click(await screen.findByRole(role, { name: item }))
  // A tick box keeps its menu open; a choice closes it and hands focus back.
  if (role !== 'menuitemcheckbox') {
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  }
}

/** Picks from a form's select, and waits for its list to close. */
const choose = async (field: HTMLElement, option: string) => {
  fireEvent.click(field)
  fireEvent.click(await screen.findByRole('option', { name: option }))
  await waitFor(() => expect(screen.queryByRole('option')).toBeNull())
}

/** Drags a card and drops it on a column, as the browser reports it. */
const dragTo = (dealName: string, columnName: string) => {
  const data: Record<string, string> = {}
  const dataTransfer = {
    setData: (type: string, value: string) => {
      data[type] = value
    },
    getData: (type: string) => data[type] ?? '',
    get types() {
      return Object.keys(data)
    },
    effectAllowed: 'none'
  }
  fireEvent.dragStart(card(dealName)!, { dataTransfer })
  fireEvent.dragOver(column(columnName), { dataTransfer })
  fireEvent.drop(column(columnName), { dataTransfer })
}

beforeEach(() => {
  localStorage.clear()
  // The test DOM has no drag image to set.
  vi.spyOn(DataTransfer.prototype, 'setDragImage').mockImplementation(
    () => undefined
  )
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Pipeline filters', () => {
  it('starts a manager on everyone’s deals, each column headed by its count and value', async () => {
    await renderPage()
    expect(screen.getByRole('button', { name: 'Owner: Everyone' })).toBeTruthy()

    const qualified = within(column('Qualified'))
    expect(qualified.getByLabelText('2 deals')).toBeTruthy()
    expect(qualified.getByText(money(3_700_000))).toBeTruthy()
    const proposal = within(column('Proposal'))
    expect(proposal.getByLabelText('1 deal')).toBeTruthy()
    expect(proposal.getByText(money(4_800_000))).toBeTruthy()
    expect(screen.getByText(`3 deals · ${money(8_500_000)}`)).toBeTruthy()
  })

  it('starts a member on their own deals', async () => {
    await renderPage(sessionUser(DAN, 'member'))
    expect(screen.getByRole('button', { name: 'My deals' })).toBeTruthy()
    expect(card('Store pilot')).toBeTruthy()
    expect(card('Analytics add-on')).toBeNull()
    expect(card('Platform rollout')).toBeNull()
    expect(within(column('Qualified')).getByLabelText('1 deal')).toBeTruthy()
    expect(screen.getByText(`1 deal · ${money(2_500_000)}`)).toBeTruthy()
  })

  it('filters by owner, and the column headers follow', async () => {
    await renderPage()
    await pick('Owner: Everyone', 'Dan Okafor')

    expect(
      screen.getByRole('button', { name: 'Owner: Dan Okafor' })
    ).toBeTruthy()
    expect(card('Store pilot')).toBeTruthy()
    expect(card('Analytics add-on')).toBeNull()
    const qualified = within(column('Qualified'))
    expect(qualified.getByLabelText('1 deal')).toBeTruthy()
    expect(qualified.getByText(money(2_500_000))).toBeTruthy()
    expect(within(column('Proposal')).getByLabelText('0 deals')).toBeTruthy()

    await pick('Owner: Dan Okafor', 'My deals')
    expect(card('Analytics add-on')).toBeTruthy()
    expect(card('Store pilot')).toBeNull()
  })

  it('filters by stage, showing only those columns', async () => {
    await renderPage()
    await pick('Stage', /Proposal/, 'menuitemcheckbox')

    expect(screen.getByRole('button', { name: 'Stage: Proposal' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Qualified' })).toBeNull()
    expect(card('Platform rollout')).toBeTruthy()
    expect(card('Store pilot')).toBeNull()
    // Won and Lost stay, to drop deals on.
    expect(column('Won')).toBeTruthy()
    expect(column('Lost')).toBeTruthy()
  })

  it('filters by close month, with a count on each month', async () => {
    await renderPage()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Close month' }), {
      key: 'Enter'
    })
    const december = await screen.findByRole('menuitemcheckbox', {
      name: /December 2026/
    })
    expect(december.textContent).toContain('2')
    fireEvent.click(december)

    expect(card('Store pilot')).toBeTruthy()
    expect(card('Platform rollout')).toBeTruthy()
    expect(card('Analytics add-on')).toBeNull()
    expect(screen.getByText(`2 deals · ${money(7_300_000)}`)).toBeTruthy()
  })

  it('clears back to where this person started', async () => {
    await renderPage()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull()
    await pick('Stage', /Proposal/, 'menuitemcheckbox')
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(card('Store pilot')).toBeTruthy()
    expect(column('Qualified')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull()
  })
})

describe('Pipeline views', () => {
  const rowNames = () =>
    within(screen.getByRole('table', { name: 'Deals' }))
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getByRole('link').textContent)

  it('switches to a list of the same deals, and remembers it', async () => {
    const { unmount } = await renderPage()
    expect(screen.queryByRole('table', { name: 'Deals' })).toBeNull()
    showList()

    // Soonest close date first.
    expect(rowNames()).toEqual([
      'Analytics add-on',
      'Store pilot',
      'Platform rollout'
    ])
    expect(screen.queryByRole('region', { name: 'Qualified' })).toBeNull()

    unmount()
    await renderPage()
    expect(screen.getByRole('table', { name: 'Deals' })).toBeTruthy()
  })

  it('sorts the list by the column clicked, then the other way', async () => {
    await renderPage()
    showList()

    fireEvent.click(screen.getByRole('button', { name: 'Value' }))
    expect(rowNames()).toEqual([
      'Analytics add-on',
      'Store pilot',
      'Platform rollout'
    ])
    expect(
      screen
        .getByRole('columnheader', { name: 'Value' })
        .getAttribute('aria-sort')
    ).toBe('ascending')

    fireEvent.click(screen.getByRole('button', { name: 'Value' }))
    expect(rowNames()).toEqual([
      'Platform rollout',
      'Store pilot',
      'Analytics add-on'
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Owner' }))
    expect(rowNames()).toEqual([
      'Analytics add-on',
      'Platform rollout',
      'Store pilot'
    ])
  })

  it('keeps the filters when the view changes', async () => {
    await renderPage()
    await pick('Owner: Everyone', 'Dan Okafor')
    showList()
    expect(rowNames()).toEqual(['Store pilot'])
  })

  it('marks an idle deal on its card and its row, and links names to the deal’s page', async () => {
    await renderPage()
    const idleCard = card('Platform rollout')!.parentElement!
    expect(within(idleCard).getByText('Idle 16 days')).toBeTruthy()
    expect(
      within(card('Store pilot')!.parentElement!).queryByText(/^Idle/)
    ).toBeNull()
    expect(
      screen
        .getByRole('link', { name: 'Platform rollout' })
        .getAttribute('href')
    ).toBe('#/deals/c')

    showList()
    expect(
      screen.getAllByText(/^Idle/).map((mark) => mark.textContent)
    ).toEqual(['Idle 16 days'])
    expect(
      screen
        .getByRole('link', { name: 'Platform rollout' })
        .getAttribute('href')
    ).toBe('#/deals/c')
  })
})

describe('Moving and closing from the board', () => {
  it('moves a card dropped on another stage', async () => {
    const { calls } = await renderPage()
    dragTo('Analytics add-on', 'Proposal')

    expect(
      within(column('Proposal')).getByRole('button', {
        name: 'Edit Analytics add-on'
      })
    ).toBeTruthy()
    await waitFor(() =>
      expect(calls.update).toEqual([
        ['deals', 'a', { stageId: 'proposal', version: 1 }]
      ])
    )
  })

  it('asks before closing a card dropped on Won, and puts it back on cancel', async () => {
    const { calls } = await renderPage()
    dragTo('Analytics add-on', 'Won')

    expect(
      await screen.findByRole('dialog', {
        name: 'Close Analytics add-on as won'
      })
    ).toBeTruthy()
    // The card waits in Won while the dialog is open.
    expect(within(column('Won')).getByText('Analytics add-on')).toBeTruthy()
    expect(
      within(column('Qualified')).queryByText('Analytics add-on')
    ).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(
      within(column('Qualified')).getByText('Analytics add-on')
    ).toBeTruthy()
    expect(within(column('Won')).queryByText('Analytics add-on')).toBeNull()
    expect(calls.update).toHaveLength(0)
  })

  it('closes a card dropped on Won once confirmed, and takes it off the board', async () => {
    const { calls } = await renderPage()
    dragTo('Analytics add-on', 'Won')
    fireEvent.click(await screen.findByRole('button', { name: 'Mark as won' }))

    await waitFor(() => expect(card('Analytics add-on')).toBeNull())
    expect(calls.update[0]).toMatchObject([
      'deals',
      'a',
      { stageId: 'won', valueMinor: 1_200_000, version: 1 }
    ])
    expect(within(column('Qualified')).getByLabelText('1 deal')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('asks why before closing a card dropped on Lost', async () => {
    const { calls } = await renderPage()
    dragTo('Store pilot', 'Lost')

    await screen.findByRole('dialog', { name: 'Close Store pilot as lost' })
    fireEvent.click(screen.getByRole('button', { name: 'Mark as lost' }))
    expect(screen.getByRole('alert').textContent).toBe(
      'Choose why it was lost.'
    )
    expect(calls.update).toHaveLength(0)

    await choose(
      screen.getByRole('button', { name: 'Why it was lost' }),
      'Price'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Mark as lost' }))

    await waitFor(() => expect(card('Store pilot')).toBeNull())
    expect(calls.update[0]).toMatchObject([
      'deals',
      'b',
      { stageId: 'lost', lostReasonId: 'price', version: 1 }
    ])
  })

  it('closes from the list’s row menu too', async () => {
    await renderPage()
    showList()
    await pick('More for Store pilot', 'Mark as lost', 'menuitem')
    expect(
      await screen.findByRole('dialog', { name: 'Close Store pilot as lost' })
    ).toBeTruthy()
  })

  it('won’t let someone drag a deal they can’t change', async () => {
    const bridgeOf = makeBridge([
      makeDeal({ id: 'x', name: 'Fleet tracking', owner: DAN, canEdit: false })
    ])
    await renderPage(sessionUser(ASHA, 'manager'), bridgeOf)
    expect(card('Fleet tracking')!.getAttribute('draggable')).toBe('false')
  })
})

describe('New deal panel', () => {
  it('opens beside the board from a stage’s "+", with that stage filled in', async () => {
    await renderPage()
    fireEvent.click(
      screen.getByRole('button', { name: 'New deal in Proposal' })
    )

    const panel = within(screen.getByRole('dialog', { name: 'New deal' }))
    expect(panel.getByRole('button', { name: 'Stage' }).textContent).toContain(
      'Proposal'
    )
    // Owner defaults to me.
    expect(panel.getByRole('button', { name: 'Owner' }).textContent).toContain(
      'Asha Menon'
    )
    // The board is still there.
    expect(card('Store pilot')).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', { name: 'New deal in Qualified' })
    )
    expect(panel.getByRole('button', { name: 'Stage' }).textContent).toContain(
      'Qualified'
    )
  })

  it('saves a deal with its people, then stays open for another', async () => {
    const { createDeal } = await renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'New deal' }))
    const panel = within(screen.getByRole('dialog', { name: 'New deal' }))

    fireEvent.click(panel.getByRole('button', { name: 'Save' }))
    expect(panel.getByRole('alert').textContent).toBe('Name the deal.')

    fireEvent.change(panel.getByLabelText('Deal'), {
      target: { value: 'Renewal upsell' }
    })
    fireEvent.click(panel.getByRole('button', { name: 'Save' }))
    expect(panel.getByRole('alert').textContent).toBe('Choose the account.')

    await choose(
      panel.getByRole('button', { name: 'Account' }),
      'Halden Capital'
    )
    fireEvent.change(panel.getByLabelText('Value (USD)'), {
      target: { value: '7,500' }
    })
    fireEvent.keyDown(panel.getByRole('button', { name: 'People' }), {
      key: 'Enter'
    })
    // Only people at the chosen account.
    expect(
      (await screen.findAllByRole('menuitemcheckbox')).map(
        (item) => item.textContent
      )
    ).toEqual(['Priya Nair', 'Tom Becker'])
    fireEvent.click(
      screen.getByRole('menuitemcheckbox', { name: /Tom Becker/ })
    )
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })

    fireEvent.click(panel.getByRole('button', { name: 'Save and add another' }))
    await waitFor(() => expect(createDeal).toHaveBeenCalledOnce())
    expect(createDeal).toHaveBeenCalledWith({
      companyId: 'halden',
      name: 'Renewal upsell',
      stageId: 'qualified',
      valueMinor: 750_000,
      closeDate: null,
      ownerId: 'asha',
      personIds: ['tom']
    })

    // Still open, cleared for the next one, same account.
    expect(
      await panel.findByText('Added Renewal upsell. Add the next one.')
    ).toBeTruthy()
    expect((panel.getByLabelText('Deal') as HTMLInputElement).value).toBe('')
    expect(
      panel.getByRole('button', { name: 'Account' }).textContent
    ).toContain('Halden Capital')

    fireEvent.change(panel.getByLabelText('Deal'), {
      target: { value: 'Second deal' }
    })
    fireEvent.click(panel.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'New deal' })).toBeNull()
    )
    expect(createDeal).toHaveBeenCalledTimes(2)
  })

  it('gives a member’s new deal to them, with no owner to choose', async () => {
    const { createDeal } = await renderPage(sessionUser(DAN, 'member'))
    fireEvent.click(screen.getByRole('button', { name: 'New deal' }))
    const panel = within(screen.getByRole('dialog', { name: 'New deal' }))
    expect(panel.queryByRole('button', { name: 'Owner' })).toBeNull()
    expect((panel.getByLabelText('Owner') as HTMLInputElement).value).toBe(
      'Dan Okafor'
    )

    fireEvent.change(panel.getByLabelText('Deal'), {
      target: { value: 'Store rollout' }
    })
    await choose(panel.getByRole('button', { name: 'Account' }), 'Lumen Retail')
    fireEvent.click(panel.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(createDeal).toHaveBeenCalledOnce())
    expect(createDeal.mock.calls[0][0]).not.toHaveProperty('ownerId')
  })

  it('closes on Escape', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'New deal' }))
    fireEvent.keyDown(screen.getByLabelText('Deal'), { key: 'Escape' })
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'New deal' })).toBeNull()
    )
  })
})
