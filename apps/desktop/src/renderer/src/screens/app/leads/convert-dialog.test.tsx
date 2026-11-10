// @vitest-environment happy-dom
import type { TLeadMatch } from '@open-sales/shared'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ConvertDialog } from './convert-dialog'
import { ASHA, makeLead, makeLeadsBridge, NO_MATCH, RAVI } from './test-helpers'

afterEach(cleanup)

const MARCUS = makeLead({
  id: 'lead-marcus',
  name: 'Marcus Lee',
  email: 'marcus@lumenretail.com',
  companyName: 'Lumen Retail'
})

const LUMEN: NonNullable<TLeadMatch['company']> = {
  id: 'c-lumen',
  name: 'Lumen Retail',
  owner: { id: 'u-dan', name: 'Dan Okafor' },
  matchedBy: 'domain'
}

const answer = <TData,>(data: TData) => ({ ok: true as const, data })

const renderDialog = (
  lead = MARCUS,
  me = ASHA,
  overrides: Parameters<typeof makeLeadsBridge>[1] = {}
) => {
  const bridge = makeLeadsBridge([lead], overrides)
  const handlers = {
    onConverted: vi.fn(),
    onStale: vi.fn(),
    onClose: vi.fn()
  }
  render(
    <ConvertDialog
      bridge={bridge}
      currency="USD"
      lead={lead}
      me={me}
      {...handlers}
    />
  )
  return { bridge, ...handlers }
}

const convertButton = () => screen.getByRole('button', { name: 'Convert' })

describe('ConvertDialog', () => {
  it('shows the account it spotted, and whose it is, before anything is made', async () => {
    const { bridge } = renderDialog(MARCUS, ASHA, {
      match: vi.fn(async () =>
        answer({ company: LUMEN, person: null, canAddDeal: true })
      )
    })
    // Nothing can be confirmed until the server has said what it matches.
    expect(convertButton()).toHaveProperty('disabled', true)

    const told = await screen.findByTestId('convert-match')
    expect(
      within(told).getByText('Lumen Retail is already an account')
    ).toBeTruthy()
    expect(told.textContent).toContain('their email’s domain')
    expect(told.textContent).toContain('it stays Dan Okafor’s')
    // The account came from the email, so there's no name to retype.
    expect(screen.queryByLabelText('Company')).toBeNull()
    expect(bridge.convert).not.toHaveBeenCalled()
    expect(convertButton()).toHaveProperty('disabled', false)
  })

  it('converts into that account and then links to it and to the deal', async () => {
    const { bridge, onConverted } = renderDialog(MARCUS, ASHA, {
      match: vi.fn(async () =>
        answer({ company: LUMEN, person: null, canAddDeal: true })
      ),
      convert: vi.fn(async () =>
        answer({
          lead: { ...MARCUS, status: 'converted' as const },
          company: {
            id: LUMEN.id,
            name: LUMEN.name,
            owner: LUMEN.owner,
            isNew: false
          },
          person: { id: 'p-marcus', name: 'Marcus Lee', isNew: true },
          deal: { id: 'd-stores', name: 'Six new stores' }
        })
      )
    })
    await screen.findByTestId('convert-match')

    fireEvent.change(screen.getByLabelText('Deal'), {
      target: { value: 'Six new stores' }
    })
    fireEvent.change(screen.getByLabelText('Value (USD)'), {
      target: { value: '12,500' }
    })
    fireEvent.click(convertButton())

    await waitFor(() =>
      expect(bridge.convert).toHaveBeenCalledWith('lead-marcus', {
        version: 1,
        // The account they were shown.
        companyId: 'c-lumen',
        companyName: undefined,
        deal: { name: 'Six new stores', valueMinor: 1_250_000 }
      })
    )

    const done = await screen.findByRole('dialog', {
      name: 'Marcus Lee is converted'
    })
    expect(onConverted).toHaveBeenCalledTimes(1)
    expect(
      within(done).getByText(
        'Lumen Retail was already an account, so it stays Dan Okafor’s.'
      )
    ).toBeTruthy()
    expect(
      within(done).getByText(
        'Let Dan Okafor know there’s someone new on their account.'
      )
    ).toBeTruthy()
    expect(
      within(done)
        .getByRole('link', { name: 'Open account' })
        .getAttribute('href')
    ).toBe('#/accounts/c-lumen')
    expect(
      within(done).getByRole('link', { name: 'Open deal' }).getAttribute('href')
    ).toBe('#/deals/d-stores')
  })

  it('makes a new account when nothing matches, with or without a deal', async () => {
    const { bridge } = renderDialog(makeLead())
    const told = await screen.findByTestId('convert-match')
    expect(
      within(told).getByText('Brightwell Logistics will be a new account')
    ).toBeTruthy()
    expect(told.textContent).toContain('You’ll own it')

    // The deal is a choice.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Add a deal' }))
    expect(screen.queryByLabelText('Deal')).toBeNull()
    fireEvent.click(convertButton())

    await waitFor(() =>
      expect(bridge.convert).toHaveBeenCalledWith('lead-dana', {
        version: 1,
        companyId: null,
        companyName: 'Brightwell Logistics',
        deal: null
      })
    )
    const done = await screen.findByRole('dialog', {
      name: 'Dana Whitfield is converted'
    })
    expect(
      within(done).getByText(
        'Brightwell Logistics is a new account, and it’s yours.'
      )
    ).toBeTruthy()
  })

  it('looks again when the company’s name is changed', async () => {
    const { bridge } = renderDialog(makeLead())
    await screen.findByTestId('convert-match')
    fireEvent.change(screen.getByLabelText('Company'), {
      target: { value: 'Halden Capital' }
    })
    // Not until the server has answered for the new name.
    expect(convertButton()).toHaveProperty('disabled', true)
    await waitFor(() =>
      expect(bridge.match).toHaveBeenLastCalledWith(
        'lead-dana',
        'Halden Capital'
      )
    )
    await waitFor(() =>
      expect(convertButton()).toHaveProperty('disabled', false)
    )
  })

  it('won’t let a member add a deal to someone else’s account', async () => {
    const { bridge } = renderDialog(MARCUS, RAVI, {
      match: vi.fn(async () =>
        answer({ company: LUMEN, person: null, canAddDeal: false })
      )
    })
    await screen.findByTestId('convert-match')
    expect(screen.getByRole('checkbox', { name: 'Add a deal' })).toHaveProperty(
      'disabled',
      true
    )
    expect(
      screen.getByText(
        'Only Dan Okafor, a manager or an admin can add deals to Lumen Retail.'
      )
    ).toBeTruthy()
    expect(screen.queryByLabelText('Deal')).toBeNull()

    fireEvent.click(convertButton())
    await waitFor(() =>
      expect(bridge.convert).toHaveBeenCalledWith(
        'lead-marcus',
        expect.objectContaining({ companyId: 'c-lumen', deal: null })
      )
    )
  })

  it('says when the lead is someone already in People', async () => {
    renderDialog(MARCUS, ASHA, {
      match: vi.fn(async () =>
        answer({
          company: { ...LUMEN, matchedBy: 'person' as const },
          person: { id: 'p-marcus', name: 'Marcus Lee' },
          canAddDeal: true
        })
      )
    })
    const told = await screen.findByTestId('convert-match')
    expect(
      within(told).getByText('Marcus Lee is already in People, at Lumen Retail')
    ).toBeTruthy()
    expect(told.textContent).toContain('nobody is added twice')
  })

  it('shows what it matches now if the accounts changed meanwhile', async () => {
    const match = vi
      .fn()
      .mockResolvedValueOnce(answer(NO_MATCH))
      .mockResolvedValue(
        answer({ company: LUMEN, person: null, canAddDeal: true })
      )
    const { bridge } = renderDialog(MARCUS, ASHA, {
      match,
      convert: vi.fn(async () => ({
        ok: false as const,
        code: 'match_changed',
        message: 'The accounts changed while you were deciding.'
      }))
    })
    await screen.findByText('Lumen Retail will be a new account')
    fireEvent.click(convertButton())

    expect(
      await screen.findByText('The accounts changed while you were deciding.')
    ).toBeTruthy()
    // It asked again, and now shows the account that appeared.
    expect(
      await screen.findByText('Lumen Retail is already an account')
    ).toBeTruthy()
    expect(bridge.convert).toHaveBeenCalledTimes(1)
  })

  it('checks the amount before converting', async () => {
    const { bridge } = renderDialog(makeLead())
    await screen.findByTestId('convert-match')
    fireEvent.change(screen.getByLabelText('Value (USD)'), {
      target: { value: 'lots' }
    })
    fireEvent.click(convertButton())
    expect(await screen.findByText('Enter an amount like 12,500.')).toBeTruthy()
    expect(bridge.convert).not.toHaveBeenCalled()
  })
})
