// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LeadsPage } from './leads-page'
import {
  ASHA,
  makeLead,
  makeLeadsBridge,
  makeRecordsBridge,
  RAVI
} from './test-helpers'

afterEach(() => {
  cleanup()
  window.location.hash = ''
})

const DANA = makeLead({
  fitNote: 'Matches your usual customer: 120 people, logistics.'
})
const MARCUS = makeLead({
  id: 'lead-marcus',
  name: 'Marcus Lee',
  companyName: 'Lumen Retail',
  source: 'email',
  owner: { id: 'u-lena', name: 'Lena Ortiz' },
  message: null,
  canTake: false
})

const renderPage = (
  leads = [DANA, MARCUS],
  me = ASHA,
  overrides: Parameters<typeof makeLeadsBridge>[1] = {}
) => {
  const bridge = makeLeadsBridge(leads, overrides)
  render(
    <LeadsPage bridge={bridge} me={me} recordsBridge={makeRecordsBridge()} />
  )
  return bridge
}

const rowOf = async (name: string) => {
  const opener = await screen.findByRole('button', { name: `Open ${name}` })
  return opener.closest('[role=row]') as HTMLElement
}

describe('LeadsPage', () => {
  it('lists each lead with its company, source, when it arrived and its owner', async () => {
    renderPage()
    const dana = await rowOf('Dana Whitfield')
    expect(within(dana).getByText('Brightwell Logistics')).toBeTruthy()
    expect(within(dana).getByText('Web form')).toBeTruthy()
    expect(within(dana).getByText('2h ago')).toBeTruthy()
    expect(within(dana).getByText('Unassigned')).toBeTruthy()

    const marcus = await rowOf('Marcus Lee')
    expect(within(marcus).getByText('Email')).toBeTruthy()
    expect(within(marcus).getByText('Lena Ortiz')).toBeTruthy()
  })

  it('asks for the leads still to work first, then follows the filters', async () => {
    const bridge = renderPage()
    await rowOf('Dana Whitfield')
    expect(bridge.list).toHaveBeenLastCalledWith({
      q: undefined,
      owner: 'anyone',
      status: 'open'
    })

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Unassigned' }))
    await waitFor(() =>
      expect(bridge.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ owner: 'none' })
      )
    )
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Mine' }))
    await waitFor(() =>
      expect(bridge.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ owner: 'me' })
      )
    )

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search leads' }), {
      target: { value: ' lumen ' }
    })
    await waitFor(() =>
      expect(bridge.list).toHaveBeenLastCalledWith({
        q: 'lumen',
        owner: 'me',
        status: 'open'
      })
    )
  })

  it('stays calm when there are no leads', async () => {
    renderPage([])
    expect(await screen.findByText('No new leads')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add a lead' }))
    expect(await screen.findByRole('dialog', { name: 'New lead' })).toBeTruthy()
  })

  it('shows the empty state when there’s no server to ask', () => {
    render(<LeadsPage bridge={null} me={ASHA} recordsBridge={null} />)
    expect(screen.getByText('No new leads')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'New lead' })).toBeNull()
  })

  it('adds a lead by hand', async () => {
    const bridge = renderPage()
    await rowOf('Dana Whitfield')
    fireEvent.click(screen.getByRole('button', { name: 'New lead' }))
    const dialog = await screen.findByRole('dialog', { name: 'New lead' })

    // A name is all it needs, but it does need that.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add lead' }))
    expect(await within(dialog).findByText('Enter their name')).toBeTruthy()
    expect(bridge.create).not.toHaveBeenCalled()

    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'Wen Zhao' }
    })
    fireEvent.change(within(dialog).getByLabelText('Company'), {
      target: { value: 'Pinecrest Schools' }
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add lead' }))

    await waitFor(() =>
      expect(bridge.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Wen Zhao',
          companyName: 'Pinecrest Schools',
          ownerId: ASHA.id
        })
      )
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'New lead' })).toBeNull()
    )
    // The inbox asked again, so the new lead shows.
    expect(vi.mocked(bridge.list).mock.calls.length).toBeGreaterThan(1)
  })

  it('opens a lead with what they wrote and the AI’s note on fit', async () => {
    renderPage()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Dana Whitfield' })
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Dana Whitfield'
    })
    expect(window.location.hash).toBe('#/leads/lead-dana')
    expect(
      within(dialog).getByText('Operations Director at Brightwell Logistics')
    ).toBeTruthy()
    expect(
      within(dialog).getByText('Our tracking contract ends in March.')
    ).toBeTruthy()
    expect(within(dialog).getByText('AI’s note on fit')).toBeTruthy()
    expect(
      within(dialog).getByText(
        'Matches your usual customer: 120 people, logistics.'
      )
    ).toBeTruthy()
    for (const name of ['Convert', 'Disqualify', 'Mark qualified', 'Ask AI']) {
      expect(within(dialog).getByRole('button', { name })).toBeTruthy()
    }
  })

  it('leaves out the fit note and the message when the lead has none', async () => {
    renderPage()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Marcus Lee' })
    )
    const dialog = await screen.findByRole('dialog', { name: 'Marcus Lee' })
    expect(within(dialog).queryByText('AI’s note on fit')).toBeNull()
    expect(within(dialog).queryByText('What they wrote')).toBeNull()
  })

  it('opens the lead named in the address', async () => {
    window.location.hash = '#/leads/lead-marcus'
    const bridge = renderPage()
    expect(
      await screen.findByRole('dialog', { name: 'Marcus Lee' })
    ).toBeTruthy()
    expect(bridge.get).toHaveBeenCalledWith('lead-marcus')
  })

  it('shows a teammate’s lead to a member without the buttons to work it', async () => {
    renderPage(
      [{ ...MARCUS, canWork: false, canAssign: false, canTake: false }],
      RAVI
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Marcus Lee' })
    )
    const dialog = await screen.findByRole('dialog', { name: 'Marcus Lee' })
    expect(
      within(dialog).getByText(
        'This lead is with Lena Ortiz. Only they, a manager or an admin can work it.'
      )
    ).toBeTruthy()
    for (const name of ['Convert', 'Disqualify', 'Take it']) {
      expect(within(dialog).queryByRole('button', { name })).toBeNull()
    }
  })

  it('lets a member take a lead nobody has', async () => {
    const bridge = renderPage([{ ...DANA, canAssign: false }], RAVI)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Dana Whitfield' })
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Dana Whitfield'
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Take it' }))
    await waitFor(() =>
      expect(bridge.assign).toHaveBeenCalledWith('lead-dana', {
        version: 1,
        ownerId: RAVI.id
      })
    )
  })

  it('marks a lead qualified from its dialog', async () => {
    const bridge = renderPage()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Dana Whitfield' })
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Dana Whitfield'
    })
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Mark qualified' })
    )
    await waitFor(() =>
      expect(bridge.qualify).toHaveBeenCalledWith('lead-dana', 1)
    )
    // The dialog now shows the lead as the server returned it.
    await waitFor(() =>
      expect(
        within(dialog).queryByRole('button', { name: 'Mark qualified' })
      ).toBeNull()
    )
  })

  it('disqualifies one lead with a reason, and closes it', async () => {
    const bridge = renderPage()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Dana Whitfield' })
    )
    const lead = await screen.findByRole('dialog', { name: 'Dana Whitfield' })
    fireEvent.click(within(lead).getByRole('button', { name: 'Disqualify' }))

    const dialog = await screen.findByRole('dialog', {
      name: 'Disqualify Dana Whitfield'
    })
    // No reason, no change.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disqualify' }))
    expect(
      await within(dialog).findByText('Say why, in a few words.')
    ).toBeTruthy()
    expect(bridge.disqualify).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'No budget' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disqualify' }))
    await waitFor(() =>
      expect(bridge.disqualify).toHaveBeenCalledWith('lead-dana', {
        version: 1,
        reason: 'No budget'
      })
    )
    expect(
      await screen.findByText('Dana Whitfield was disqualified.')
    ).toBeTruthy()
    expect(window.location.hash).toBe('#/leads')
  })

  it('disqualifies several from the bar, and says which couldn’t be', async () => {
    const bridge = renderPage([DANA, MARCUS], ASHA, {
      disqualify: vi.fn(async (id, { reason }) =>
        id === 'lead-marcus'
          ? { ok: false as const, message: 'This lead was already converted.' }
          : {
              ok: true as const,
              data: {
                ...DANA,
                status: 'disqualified' as const,
                disqualifiedReason: reason
              }
            }
      )
    })
    await rowOf('Dana Whitfield')
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Select Dana Whitfield' })
    )
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Marcus Lee' }))

    const bar = await screen.findByRole('toolbar', { name: 'Selection' })
    expect(within(bar).getByText('2 selected')).toBeTruthy()
    // Managers assign to anyone from the bar.
    expect(within(bar).getByRole('button', { name: 'Assign' })).toBeTruthy()
    fireEvent.click(within(bar).getByRole('button', { name: 'Disqualify' }))

    const dialog = await screen.findByRole('dialog', {
      name: 'Disqualify 2 leads'
    })
    fireEvent.change(within(dialog).getByLabelText('Why'), {
      target: { value: 'Too small' }
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disqualify' }))

    await waitFor(() => expect(bridge.disqualify).toHaveBeenCalledTimes(2))
    expect(bridge.disqualify).toHaveBeenCalledWith('lead-marcus', {
      version: 1,
      reason: 'Too small'
    })
    expect(
      await screen.findByText(
        '1 lead disqualified. 1 couldn’t be: This lead was already converted.'
      )
    ).toBeTruthy()
    // The selection is cleared with the bar.
    expect(screen.queryByRole('toolbar', { name: 'Selection' })).toBeNull()
  })

  it('lets a member assign the selected leads only to themself', async () => {
    const bridge = renderPage([{ ...DANA, canAssign: false }], RAVI)
    await rowOf('Dana Whitfield')
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Select Dana Whitfield' })
    )
    const bar = await screen.findByRole('toolbar', { name: 'Selection' })
    expect(within(bar).queryByRole('button', { name: 'Assign' })).toBeNull()
    fireEvent.click(within(bar).getByRole('button', { name: 'Assign to me' }))
    await waitFor(() =>
      expect(bridge.assign).toHaveBeenCalledWith('lead-dana', {
        version: 1,
        ownerId: RAVI.id
      })
    )
    expect(await screen.findByText('1 lead assigned to you.')).toBeTruthy()
  })

  it('goes from a lead to converting it', async () => {
    const bridge = renderPage()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Dana Whitfield' })
    )
    const lead = await screen.findByRole('dialog', { name: 'Dana Whitfield' })
    fireEvent.click(within(lead).getByRole('button', { name: 'Convert' }))
    expect(
      await screen.findByRole('dialog', { name: 'Convert Dana Whitfield' })
    ).toBeTruthy()
    await waitFor(() =>
      expect(bridge.match).toHaveBeenCalledWith(
        'lead-dana',
        'Brightwell Logistics'
      )
    )
  })
})
