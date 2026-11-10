// @vitest-environment happy-dom
import type {
  TPipelineSettings,
  TSettingsStage,
  TStagesSaveInput
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

import type { TApiResult } from '../../../../../preload/bridge-types'
import { StagesEditor } from './stages-editor'

const stage = (
  id: string,
  name: string,
  kind: TSettingsStage['kind'],
  winProbability: number,
  dealCount: number
): TSettingsStage => ({
  id,
  name,
  position: 0,
  kind,
  winProbability,
  stalledAfterDays: kind === 'open' ? 14 : null,
  goal: null,
  exitCriteria: id === 'proposal' ? 'Pricing sent and budget confirmed.' : null,
  dealCount
})

const PIPELINE: TPipelineSettings = {
  id: 'sales',
  name: 'Sales',
  revision: 'r1',
  stages: [
    stage('qualified', 'Qualified', 'open', 10, 0),
    stage('proposal', 'Proposal', 'open', 50, 4),
    stage('negotiation', 'Negotiation', 'open', 75, 1),
    stage('won', 'Won', 'won', 100, 6),
    stage('lost', 'Lost', 'lost', 0, 2)
  ],
  lostReasons: []
}

type TSave = (input: TStagesSaveInput) => Promise<TApiResult<TPipelineSettings>>

const renderEditor = (
  onSave: TSave = vi.fn<TSave>(async () => ({ ok: true, data: PIPELINE })),
  pipeline = PIPELINE
) => {
  const onLoadLatest = vi.fn()
  render(
    <StagesEditor
      pipeline={pipeline}
      onLoadLatest={onLoadLatest}
      onSave={onSave}
    />
  )
  return { onSave: onSave as ReturnType<typeof vi.fn<TSave>>, onLoadLatest }
}

const row = (name: string) => screen.getByRole('listitem', { name })
const stageNames = () =>
  screen
    .getAllByLabelText('Stage name')
    .map((box) => (box as HTMLInputElement).value)
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }))
const sent = (onSave: ReturnType<typeof vi.fn<TSave>>) =>
  onSave.mock.calls[0][0]

describe('StagesEditor', () => {
  afterEach(cleanup)

  it('lists the stages in order, with Won and Lost renamable but fixed', () => {
    renderEditor()

    expect(stageNames()).toEqual(['Qualified', 'Proposal', 'Negotiation'])
    expect(within(row('Proposal')).getByText('4 deals')).toBeTruthy()
    // What the AI reads shows without opening it.
    expect(
      within(row('Proposal')).getByText('Pricing sent and budget confirmed.')
    ).toBeTruthy()

    expect(
      (screen.getByLabelText('Name of the Won stage') as HTMLInputElement).value
    ).toBe('Won')
    expect(screen.getByLabelText('Name of the Lost stage')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remove Won' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove Lost' })).toBeNull()

    // Nothing to save yet.
    expect(
      (screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement)
        .disabled
    ).toBe(true)
  })

  it('saves renames, a new order and a new stage in one go', async () => {
    const { onSave } = renderEditor()

    fireEvent.change(within(row('Qualified')).getByLabelText('Stage name'), {
      target: { value: 'Lead' }
    })
    fireEvent.change(
      within(row('Lead')).getByLabelText('Win probability, percent'),
      { target: { value: '15%' } }
    )
    // Never stalls.
    fireEvent.change(
      within(row('Lead')).getByLabelText('Stalled after, days'),
      { target: { value: '' } }
    )
    // Down one with the keyboard; up at the top does nothing.
    const handle = within(row('Lead')).getByRole('button', {
      name: /^Reorder Lead/
    })
    fireEvent.keyDown(handle, { key: 'ArrowUp' })
    expect(stageNames()).toEqual(['Lead', 'Proposal', 'Negotiation'])
    fireEvent.keyDown(
      within(row('Lead')).getByRole('button', { name: /^Reorder Lead/ }),
      { key: 'ArrowDown' }
    )
    expect(stageNames()).toEqual(['Proposal', 'Lead', 'Negotiation'])

    fireEvent.click(screen.getByRole('button', { name: 'Add stage' }))
    const added = row('New stage')
    fireEvent.change(within(added).getByLabelText('Stage name'), {
      target: { value: 'Legal review' }
    })
    fireEvent.click(
      within(row('Legal review')).getByRole('button', {
        name: /Goal and exit criteria/
      })
    )
    fireEvent.change(await screen.findByLabelText('Exit criteria'), {
      target: { value: 'Their legal team has signed off.' }
    })
    fireEvent.change(screen.getByLabelText('Name of the Won stage'), {
      target: { value: 'Closed won' }
    })

    save()
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(sent(onSave)).toEqual({
      revision: 'r1',
      stages: [
        {
          id: 'proposal',
          name: 'Proposal',
          winProbability: 50,
          stalledAfterDays: 14,
          goal: '',
          exitCriteria: 'Pricing sent and budget confirmed.'
        },
        {
          id: 'qualified',
          name: 'Lead',
          winProbability: 15,
          stalledAfterDays: null,
          goal: '',
          exitCriteria: ''
        },
        {
          id: 'negotiation',
          name: 'Negotiation',
          winProbability: 75,
          stalledAfterDays: 14,
          goal: '',
          exitCriteria: ''
        },
        {
          id: undefined,
          name: 'Legal review',
          winProbability: 50,
          stalledAfterDays: 14,
          goal: '',
          exitCriteria: 'Their legal team has signed off.'
        }
      ],
      wonName: 'Closed won',
      lostName: 'Lost',
      removed: []
    })
  })

  it('asks where the deals should move before removing a stage that has some', async () => {
    const { onSave } = renderEditor()

    fireEvent.click(screen.getByRole('button', { name: 'Remove Proposal' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Remove “Proposal”?')).toBeTruthy()
    expect(
      within(dialog).getByText(
        '4 deals are in this stage. Choose where they should move.'
      )
    ).toBeTruthy()
    // Not without somewhere for them to go.
    const confirm = within(dialog).getByRole('button', { name: 'Remove stage' })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    expect(stageNames()).toContain('Proposal')

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Move its deals to' })
    )
    // The stage itself isn't a choice; Won and Lost aren't either.
    expect(screen.queryByRole('option', { name: 'Proposal' })).toBeNull()
    expect(screen.queryByRole('option', { name: 'Won' })).toBeNull()
    fireEvent.click(await screen.findByRole('option', { name: 'Negotiation' }))
    fireEvent.click(confirm)

    await waitFor(() =>
      expect(stageNames()).toEqual(['Qualified', 'Negotiation'])
    )
    expect(
      screen.getByText(
        '“Proposal” will be removed when you save. Its 4 deals will move to Negotiation.'
      )
    ).toBeTruthy()
    // The stage they're moving into has to stay.
    fireEvent.click(screen.getByRole('button', { name: 'Remove Negotiation' }))
    expect(screen.getByRole('alert').textContent).toMatch(
      /Deals from “Proposal” are set to move into “Negotiation”/
    )
    expect(stageNames()).toEqual(['Qualified', 'Negotiation'])

    save()
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(sent(onSave).removed).toEqual([
      { id: 'proposal', moveDealsTo: 'negotiation' }
    ])
    expect(sent(onSave).stages.map((s) => s.id)).toEqual([
      'qualified',
      'negotiation'
    ])
  })

  it('removes an empty stage straight away, and can put it back', async () => {
    const { onSave } = renderEditor()

    fireEvent.click(screen.getByRole('button', { name: 'Remove Qualified' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(stageNames()).toEqual(['Proposal', 'Negotiation'])

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(stageNames()).toEqual(['Qualified', 'Proposal', 'Negotiation'])

    fireEvent.click(screen.getByRole('button', { name: 'Remove Qualified' }))
    save()
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(sent(onSave).removed).toEqual([
      { id: 'qualified', moveDealsTo: null }
    ])
  })

  it('keeps at least one stage before Won and Lost', () => {
    renderEditor(undefined, {
      ...PIPELINE,
      stages: PIPELINE.stages.filter(
        (s) => s.kind !== 'open' || s.id === 'qualified'
      )
    })

    expect(
      (
        screen.getByRole('button', {
          name: 'Remove Qualified'
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true)
  })

  it('says what’s wrong before sending anything', async () => {
    const { onSave } = renderEditor()

    fireEvent.change(within(row('Qualified')).getByLabelText('Stage name'), {
      target: { value: '  ' }
    })
    save()
    expect(
      (await screen.findAllByText('Give the stage a name')).length
    ).toBeGreaterThan(0)

    fireEvent.change(within(row('New stage')).getByLabelText('Stage name'), {
      target: { value: 'proposal' }
    })
    save()
    expect(
      await screen.findByText(
        'Two stages are called “Proposal”. Give each its own name.'
      )
    ).toBeTruthy()

    fireEvent.change(within(row('proposal')).getByLabelText('Stage name'), {
      target: { value: 'Lead' }
    })
    fireEvent.change(
      within(row('Lead')).getByLabelText('Win probability, percent'),
      { target: { value: '140' } }
    )
    save()
    expect(
      (await screen.findAllByText('Win probability can’t be above 100')).length
    ).toBeGreaterThan(0)
    expect(onSave).not.toHaveBeenCalled()

    // Discard puts everything back.
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(stageNames()).toEqual(['Qualified', 'Proposal', 'Negotiation'])
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('offers the latest when someone else saved first', async () => {
    const { onLoadLatest } = renderEditor(
      vi.fn<TSave>(async () => ({
        ok: false,
        code: 'changed_since',
        message: 'Someone changed this while you were editing.'
      }))
    )

    fireEvent.change(within(row('Qualified')).getByLabelText('Stage name'), {
      target: { value: 'Lead' }
    })
    save()

    expect(
      await screen.findByText('Someone changed this while you were editing.')
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Load the latest' }))
    expect(onLoadLatest).toHaveBeenCalled()
  })
})
