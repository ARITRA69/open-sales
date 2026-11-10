// @vitest-environment happy-dom
import type {
  TContract,
  TContractCandidate,
  TPipeline
} from '@open-sales/shared'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { TRecordsBridge, TRenewalsBridge } from './renewals-bridge'
import { RenewalsPage } from './renewals-page'

const TODAY = '2026-11-10'

const contract = (changes: Partial<TContract> = {}): TContract => ({
  id: 'c-halden',
  version: 1,
  company: { id: 'halden', name: 'Halden Capital' },
  owner: { id: 'u1', name: 'Asha Menon' },
  deal: { id: 'd1', name: 'Platform rollout' },
  renewalDeal: null,
  valueMinor: 4_800_000,
  currency: 'USD',
  startsOn: '2025-11-28',
  renewsOn: '2026-11-28',
  status: 'active',
  endReason: null,
  createdAt: '2026-01-01T09:00:00.000Z',
  updatedAt: '2026-01-01T09:00:00.000Z',
  canEdit: true,
  ...changes
})

const OVERDUE = contract({
  id: 'c-orbit',
  company: { id: 'orbit', name: 'Orbit Health' },
  owner: { id: 'u2', name: 'Dan Okafor' },
  renewsOn: '2026-11-06',
  startsOn: '2025-11-06'
})

const RENEWING = contract({
  id: 'c-lumen',
  company: { id: 'lumen', name: 'Lumen Retail' },
  status: 'renewing',
  renewalDeal: { id: 'd9', name: 'Lumen Retail renewal 2026', status: 'open' }
})

const CANDIDATE: TContractCandidate = {
  deal: { id: 'won-1', name: 'Reporting add-on' },
  company: { id: 'orbit', name: 'Orbit Health' },
  owner: { id: 'u1', name: 'Asha Menon' },
  valueMinor: 600_000,
  currency: 'USD',
  closeDate: '2026-11-01',
  suggestedStartsOn: '2026-11-01',
  suggestedRenewsOn: '2027-11-01',
  canEdit: true
}

const PIPELINE = {
  id: 'sales',
  name: 'Sales',
  currency: 'USD',
  stages: [
    { id: 'qualified', name: 'Qualified', kind: 'open' },
    { id: 'proposal', name: 'Proposal', kind: 'open' },
    { id: 'won', name: 'Won', kind: 'won' }
  ],
  lostReasons: []
} as unknown as TPipeline

const page = <TItem,>(items: TItem[]) => ({
  ok: true as const,
  data: { items, nextCursor: null }
})

const makeBridge = (
  contracts: TContract[] = [OVERDUE, contract(), RENEWING],
  overrides: Partial<TRenewalsBridge> = {}
): TRenewalsBridge => ({
  list: vi.fn(async () => page(contracts)),
  listCandidates: vi.fn(async () => page([CANDIDATE])),
  createContract: vi.fn(async () => ({ ok: true as const, data: contract() })),
  startRenewal: vi.fn(async () => ({
    ok: true as const,
    data: contract({
      status: 'renewing',
      version: 2,
      renewalDeal: {
        id: 'd-new',
        name: 'Halden Capital renewal 2026',
        status: 'open'
      }
    })
  })),
  endContract: vi.fn(async () => ({
    ok: true as const,
    data: contract({ status: 'ended', endReason: 'No budget', version: 2 })
  })),
  reopenContract: vi.fn(async () => ({ ok: true as const, data: contract() })),
  ...overrides
})

const records = {
  getPipeline: vi.fn(async () => ({ ok: true as const, data: PIPELINE }))
} as unknown as TRecordsBridge

const renderPage = (bridge: TRenewalsBridge) =>
  render(<RenewalsPage bridge={bridge} recordsBridge={records} today={TODAY} />)

const rowFor = async (account: string) =>
  (await screen.findByRole('link', { name: account })).closest(
    '[role="row"]'
  ) as HTMLElement

describe('RenewalsPage', () => {
  afterEach(() => {
    cleanup()
    window.location.hash = ''
  })

  it('lists contracts with their account, date, value, owner and state', async () => {
    renderPage(makeBridge())

    const halden = await rowFor('Halden Capital')
    expect(
      within(halden)
        .getByRole('link', { name: 'Halden Capital' })
        .getAttribute('href')
    ).toBe('#/accounts/halden')
    expect(halden.textContent).toContain('Platform rollout')
    // The day and month follow the computer's custom.
    expect(halden.textContent).toMatch(/28 Nov|Nov 28/)
    expect(halden.textContent).toContain('In 18 days')
    expect(halden.textContent).toContain('$48,000')
    expect(halden.textContent).toContain('Asha Menon')
    expect(halden.textContent).toContain('Active')

    const orbit = await rowFor('Orbit Health')
    expect(orbit.textContent).toContain('4 days overdue')
    expect(orbit.textContent).toContain('Overdue')

    // A renewal under way links to its deal instead of offering to start one.
    const lumen = await rowFor('Lumen Retail')
    expect(lumen.textContent).toContain('Renewing')
    expect(
      within(lumen)
        .getByRole('link', { name: /Open deal/ })
        .getAttribute('href')
    ).toBe('#/deals/d9')
    expect(within(lumen).queryByRole('button', { name: /Start renewal/ })).toBe(
      null
    )
  })

  it('asks for the next 90 days, and again for another window or view', async () => {
    const bridge = makeBridge()
    renderPage(bridge)
    await rowFor('Halden Capital')
    expect(bridge.list).toHaveBeenLastCalledWith({
      view: 'upcoming',
      window: 90,
      owner: 'anyone'
    })

    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Renewing in: Next 90 days' }),
      { key: 'Enter' }
    )
    fireEvent.click(
      await screen.findByRole('menuitemradio', { name: 'Next 30 days' })
    )
    await waitFor(() =>
      expect(bridge.list).toHaveBeenLastCalledWith({
        view: 'upcoming',
        window: 30,
        owner: 'anyone'
      })
    )

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'My renewals' }))
    await waitFor(() =>
      expect(bridge.list).toHaveBeenLastCalledWith({
        view: 'upcoming',
        window: 30,
        owner: 'me'
      })
    )
    expect(bridge.listCandidates).toHaveBeenLastCalledWith({ owner: 'me' })

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Closed' }))
    await waitFor(() =>
      expect(bridge.list).toHaveBeenLastCalledWith({
        view: 'closed',
        window: 30,
        owner: 'anyone'
      })
    )
    // Closed contracts have no window, and nothing to add a contract to.
    expect(screen.queryByRole('button', { name: /Renewing in/ })).toBeNull()
    expect(screen.queryByText('Won deals without a contract')).toBeNull()
  })

  it('starts a renewal from the contract’s own numbers, and links to the new deal', async () => {
    const bridge = makeBridge()
    renderPage(bridge)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Start renewal for Halden Capital'
      })
    )
    const dialog = screen.getByRole('dialog', {
      name: 'Start the renewal for Halden Capital?'
    })
    expect(dialog.textContent).toContain('(1 year)')
    expect(
      within(dialog).getByLabelText<HTMLInputElement>('Value (USD)').value
    ).toBe('48,000')
    expect(
      within(dialog).getByLabelText<HTMLInputElement>('Close date').value
    ).toContain('2026')
    expect(within(dialog).getByLabelText<HTMLInputElement>('Owner').value).toBe(
      'Asha Menon'
    )
    expect(
      within(dialog).getByRole('button', { name: 'Stage' }).textContent
    ).toContain('Qualified')

    fireEvent.change(within(dialog).getByLabelText('Value (USD)'), {
      target: { value: '52,000' }
    })
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Start renewal' })
    )

    await waitFor(() =>
      expect(bridge.startRenewal).toHaveBeenCalledWith('c-halden', {
        version: 1,
        valueMinor: 5_200_000,
        closeDate: '2026-11-28',
        stageId: 'qualified'
      })
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    const notice = await screen.findByRole('status')
    expect(notice.textContent).toContain('Renewal started for Halden Capital')
    fireEvent.click(within(notice).getByRole('button', { name: 'Open deal' }))
    expect(window.location.hash).toBe('#/deals/d-new')
    // Both lists are asked again, so the row shows as renewing.
    expect(bridge.list).toHaveBeenCalledTimes(2)
  })

  it('won’t save a renewal whose value isn’t an amount', async () => {
    const bridge = makeBridge()
    renderPage(bridge)
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Start renewal for Halden Capital'
      })
    )
    fireEvent.change(screen.getByLabelText('Value (USD)'), {
      target: { value: 'lots' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Start renewal' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Enter an amount like 12,500.'
    )
    expect(bridge.startRenewal).not.toHaveBeenCalled()
  })

  it('asks why before marking a contract as won’t renew', async () => {
    const bridge = makeBridge()
    renderPage(bridge)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Won’t renew, Halden Capital'
      })
    )
    const dialog = screen.getByRole('dialog', {
      name: "Why won't Halden Capital renew?"
    })
    const confirm = within(dialog).getByRole('button', {
      name: "Mark as won't renew"
    })
    expect(confirm.hasAttribute('disabled')).toBe(true)

    fireEvent.click(within(dialog).getByRole('button', { name: 'No budget' }))
    fireEvent.click(confirm)

    await waitFor(() =>
      expect(bridge.endContract).toHaveBeenCalledWith('c-halden', {
        version: 1,
        reason: 'No budget'
      })
    )
    expect((await screen.findByRole('status')).textContent).toContain(
      'Halden Capital won’t renew'
    )
  })

  it('adds a contract to a won deal', async () => {
    const bridge = makeBridge()
    renderPage(bridge)

    const waiting = (
      await screen.findByText('Won deals without a contract')
    ).closest('section') as HTMLElement
    expect(
      within(waiting)
        .getByRole('link', { name: 'Reporting add-on' })
        .getAttribute('href')
    ).toBe('#/deals/won-1')
    expect(waiting.textContent).toMatch(/Orbit Health · Won (1 Nov|Nov 1)/)

    fireEvent.click(
      within(waiting).getByRole('button', {
        name: 'Add contract for Reporting add-on'
      })
    )
    const dialog = screen.getByRole('dialog', {
      name: 'Add a contract for Orbit Health'
    })
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Add contract' })
    )

    await waitFor(() =>
      expect(bridge.createContract).toHaveBeenCalledWith({
        dealId: 'won-1',
        startsOn: '2026-11-01',
        renewsOn: '2027-11-01',
        valueMinor: 600_000
      })
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(bridge.listCandidates).toHaveBeenCalledTimes(2)
  })

  it('says why when someone changed the contract first, and loads it again', async () => {
    const bridge = makeBridge(undefined, {
      endContract: vi.fn(async () => ({
        ok: false as const,
        code: 'changed_since',
        message: 'Someone changed this while you were editing.'
      }))
    })
    renderPage(bridge)
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Won’t renew, Halden Capital'
      })
    )
    fireEvent.click(screen.getByRole('button', { name: 'No budget' }))
    fireEvent.click(screen.getByRole('button', { name: "Mark as won't renew" }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Someone changed this while you were editing.'
    )
    expect(screen.getByRole('dialog')).toBeTruthy()
    await waitFor(() => expect(bridge.list).toHaveBeenCalledTimes(2))
  })

  it('reopens an ended contract from the closed list', async () => {
    const ended = contract({
      status: 'ended',
      endReason: 'Chose another tool',
      version: 2
    })
    const bridge = makeBridge([ended])
    renderPage(bridge)
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Closed' }))

    const row = await rowFor('Halden Capital')
    expect(row.textContent).toContain('Ended')
    expect(row.textContent).toContain('Chose another tool')
    fireEvent.click(
      within(row).getByRole('button', { name: 'Reopen Halden Capital' })
    )
    await waitFor(() =>
      expect(bridge.reopenContract).toHaveBeenCalledWith('c-halden', 2)
    )
    expect((await screen.findByRole('status')).textContent).toContain(
      'Halden Capital is active again'
    )
  })

  it('shows contracts read-only to people who can’t change them', async () => {
    renderPage(
      makeBridge([contract({ canEdit: false })], {
        listCandidates: vi.fn(async () =>
          page([{ ...CANDIDATE, canEdit: false }])
        )
      })
    )
    const row = await rowFor('Halden Capital')
    expect(within(row).queryByRole('button')).toBeNull()
    await screen.findByText('Reporting add-on')
    expect(screen.queryByRole('button', { name: /Add contract/ })).toBeNull()
  })

  it('says so when nothing renews in the window', async () => {
    renderPage(makeBridge([], { listCandidates: vi.fn(async () => page([])) }))
    expect(await screen.findByText('No renewals coming up')).toBeTruthy()
    expect(
      screen.getByText('Contracts renewing in the next 90 days will show here.')
    ).toBeTruthy()
    expect(screen.queryByText('Won deals without a contract')).toBeNull()
  })

  it('offers to try again when the server can’t be reached', async () => {
    const list = vi
      .fn<TRenewalsBridge['list']>()
      .mockResolvedValueOnce({ ok: false, message: 'Couldn’t reach it.' })
      .mockResolvedValue(page([contract()]))
    renderPage(makeBridge([], { list }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Couldn’t reach it.'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await rowFor('Halden Capital')).toBeTruthy()
  })

  it('stays an empty page where there’s nothing to ask', () => {
    render(<RenewalsPage bridge={null} />)
    expect(screen.getByText('No renewals coming up')).toBeTruthy()
  })
})
