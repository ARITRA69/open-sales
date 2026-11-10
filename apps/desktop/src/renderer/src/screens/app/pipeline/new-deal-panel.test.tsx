// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { NewDealPanel, type TNewDealStart } from './new-deal-panel'
import {
  ASHA,
  DAN,
  HALDEN,
  LUMEN,
  makeBridge,
  PIPELINE,
  sessionUser
} from './test-data'

afterEach(cleanup)

const renderPanel = (
  start: TNewDealStart,
  createDeal: Parameters<typeof NewDealPanel>[0]['createDeal'] = null,
  me = sessionUser(ASHA, 'member')
) => {
  const bridgeOf = makeBridge([])
  const handlers = { onSaved: vi.fn(), onClose: vi.fn() }
  render(
    <NewDealPanel
      {...handlers}
      bridge={bridgeOf.bridge}
      createDeal={createDeal}
      me={me}
      pipeline={PIPELINE}
      start={start}
      users={[ASHA, DAN]}
    />
  )
  return { ...handlers, ...bridgeOf }
}

describe('NewDealPanel', () => {
  it('offers only open stages, starting on the first', () => {
    renderPanel({})
    const stage = screen.getByRole('button', { name: 'Stage' })
    expect(stage.textContent).toContain('Qualified')
    fireEvent.click(stage)
    expect(
      screen.getAllByRole('option').map((option) => option.textContent)
    ).toEqual(['Qualified', 'Proposal'])
  })

  it('says who owns an account a member can’t add deals to, instead of failing', () => {
    const { onClose } = renderPanel({
      company: { ...LUMEN, canEdit: false }
    })
    expect(
      screen.getByText(
        'Owned by Dan Okafor. Only they, a manager or an admin can add deals to Lumen Retail.'
      )
    ).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Save and add another' })
    ).toBeNull()
    // The fields are there to read, switched off together.
    expect(
      (screen.getByLabelText('Deal').closest('fieldset') as HTMLFieldSetElement)
        .disabled
    ).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows the server’s refusal as a plain line, not an error', async () => {
    const createDeal = vi.fn(async () => ({
      ok: false as const,
      code: 'forbidden',
      message:
        'Only the company’s owner, a manager or an admin can add deals to it.'
    }))
    const { onSaved, onClose } = renderPanel({ company: HALDEN }, createDeal)
    fireEvent.change(screen.getByLabelText('Deal'), {
      target: { value: 'Platform rollout' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect((await screen.findByRole('status')).textContent).toBe(
      'Only the company’s owner, a manager or an admin can add deals to it.'
    )
    expect(screen.queryByRole('alert')).toBeNull()
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows any other problem as an error and keeps what was typed', async () => {
    const createDeal = vi.fn(async () => ({
      ok: false as const,
      message: 'The server didn’t answer in time. Try again in a moment.'
    }))
    renderPanel({ company: HALDEN }, createDeal)
    fireEvent.change(screen.getByLabelText('Deal'), {
      target: { value: 'Platform rollout' }
    })
    fireEvent.change(screen.getByLabelText('Value (USD)'), {
      target: { value: '12,500' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect((await screen.findByRole('alert')).textContent).toMatch(/in time/)
    expect((screen.getByLabelText('Deal') as HTMLInputElement).value).toBe(
      'Platform rollout'
    )
    expect(createDeal).toHaveBeenCalledWith({
      companyId: 'halden',
      name: 'Platform rollout',
      stageId: 'qualified',
      valueMinor: 1_250_000,
      closeDate: null,
      personIds: []
    })
  })

  it('saves through the records bridge, without people, when it has no call of its own', async () => {
    const { calls, onSaved, onClose } = renderPanel({
      company: HALDEN,
      stageId: 'proposal'
    })
    fireEvent.change(screen.getByLabelText('Deal'), {
      target: { value: 'Platform rollout' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    expect(calls.create).toEqual([
      [
        'deals',
        {
          companyId: 'halden',
          name: 'Platform rollout',
          stageId: 'proposal',
          valueMinor: null,
          closeDate: null
        }
      ]
    ])
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('won’t save an amount it can’t read', () => {
    const { calls } = renderPanel({ company: HALDEN })
    fireEvent.change(screen.getByLabelText('Deal'), {
      target: { value: 'Platform rollout' }
    })
    fireEvent.change(screen.getByLabelText('Value (USD)'), {
      target: { value: 'lots' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert').textContent).toBe(
      'Enter an amount like 12,500.'
    )
    expect(calls.create).toHaveLength(0)
  })
})
