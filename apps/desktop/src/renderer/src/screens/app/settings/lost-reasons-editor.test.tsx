// @vitest-environment happy-dom
import type { TLostReasonsSave, TPipelineSettings } from '@open-sales/shared'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { TApiResult } from '../../../../../preload/bridge-types'
import { LostReasonsEditor } from './lost-reasons-editor'

const PIPELINE: TPipelineSettings = {
  id: 'sales',
  name: 'Sales',
  revision: 'r7',
  stages: [],
  lostReasons: [
    { id: 'price', label: 'Price', archivedAt: null },
    { id: 'timing', label: 'Bad timing', archivedAt: null },
    {
      id: 'no-decision',
      label: 'No decision',
      archivedAt: '2026-10-02T09:00:00.000Z'
    }
  ]
}

type TSave = (input: TLostReasonsSave) => Promise<TApiResult<TPipelineSettings>>

const renderEditor = () => {
  const onSave = vi.fn<TSave>(async () => ({ ok: true, data: PIPELINE }))
  render(<LostReasonsEditor pipeline={PIPELINE} onSave={onSave} />)
  return { onSave }
}

const labels = () =>
  screen
    .getAllByLabelText('Reason')
    .map((box) => (box as HTMLInputElement).value)
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }))

describe('LostReasonsEditor', () => {
  afterEach(cleanup)

  it('adds, renames, reorders, archives and brings back, then saves the list', async () => {
    const { onSave } = renderEditor()
    expect(labels()).toEqual(['Price', 'Bad timing'])
    const archived = () =>
      screen.getByRole('list', { name: 'Archived reasons' })
    expect(within(archived()).getByText('No decision')).toBeTruthy()

    fireEvent.change(screen.getAllByLabelText('Reason')[0], {
      target: { value: 'Too expensive' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add reason' }))
    fireEvent.change(screen.getAllByLabelText('Reason')[2], {
      target: { value: 'No budget' }
    })
    fireEvent.keyDown(
      screen.getByRole('button', { name: /^Reorder No budget/ }),
      {
        key: 'ArrowUp'
      }
    )
    expect(labels()).toEqual(['Too expensive', 'No budget', 'Bad timing'])

    fireEvent.click(screen.getByRole('button', { name: 'Archive Bad timing' }))
    expect(within(archived()).getByText('Bad timing')).toBeTruthy()
    fireEvent.click(
      within(
        within(archived()).getByRole('listitem', { name: 'No decision' })
      ).getByRole('button', { name: 'Restore' })
    )
    expect(labels()).toEqual(['Too expensive', 'No budget', 'No decision'])

    save()
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0]).toEqual({
      revision: 'r7',
      reasons: [
        { id: 'price', label: 'Too expensive' },
        { id: undefined, label: 'No budget' },
        { id: 'no-decision', label: 'No decision' }
      ]
    })
  })

  it('won’t save an empty or repeated reason, or archive the last one', async () => {
    const { onSave } = renderEditor()

    fireEvent.click(screen.getByRole('button', { name: 'Add reason' }))
    save()
    expect(
      (await screen.findAllByText('Give the reason a name')).length
    ).toBeGreaterThan(0)

    fireEvent.change(screen.getAllByLabelText('Reason')[2], {
      target: { value: 'price' }
    })
    save()
    expect(
      await screen.findByText(
        '“price” is on the list twice. Give each reason its own name.'
      )
    ).toBeTruthy()
    expect(onSave).not.toHaveBeenCalled()

    // A reason that was never saved is removed, not archived.
    fireEvent.click(screen.getByRole('button', { name: 'Archive price' }))
    fireEvent.click(screen.getByRole('button', { name: 'Archive Price' }))
    expect(labels()).toEqual(['Bad timing'])
    expect(
      (
        screen.getByRole('button', {
          name: 'Archive Bad timing'
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true)
  })
})
