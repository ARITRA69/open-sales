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

import { ASK_EVENT, type TAskDetail } from './ask-ai'
import { RunPlaybookMenu } from './run-playbook-menu'
import { makeBridge, makePlaybook } from './test-data'

const HALDEN = { type: 'deal', id: 'd1', label: 'Halden Capital' } as const

const DEMO = makePlaybook({ status: 'published' })
const STALLED = makePlaybook({
  id: 'p2',
  name: 'Stalled deal check',
  description: 'Why a deal has gone quiet.',
  status: 'published',
  current: {
    ...makePlaybook().current,
    id: 'p2-v3',
    number: 3,
    steps: 'Say why it stalled. Propose a next step.',
    blanks: [],
    allowedChanges: ['fields', 'tasks']
  }
})

const listOf = (...items: (typeof DEMO)[]) => ({
  list: vi.fn(async () => ({
    ok: true as const,
    data: { items, nextCursor: null }
  }))
})

const openMenu = () =>
  fireEvent.keyDown(screen.getByRole('button', { name: 'Run playbook' }), {
    key: 'Enter'
  })

describe('RunPlaybookMenu', () => {
  const asked: TAskDetail[] = []
  const listener = (event: Event) =>
    asked.push((event as CustomEvent<TAskDetail>).detail)

  afterEach(() => {
    cleanup()
    window.removeEventListener(ASK_EVENT, listener)
    asked.length = 0
  })

  const renderMenu = (bridge = makeBridge(DEMO, listOf(DEMO, STALLED))) => {
    window.addEventListener(ASK_EVENT, listener)
    const onRun = vi.fn()
    render(<RunPlaybookMenu bridge={bridge} record={HALDEN} onRun={onRun} />)
    return { bridge, onRun }
  }

  it('lists the published playbooks when it opens', async () => {
    const { bridge } = renderMenu()
    expect(bridge.list).not.toHaveBeenCalled()

    openMenu()

    expect(
      await screen.findByRole('menuitem', { name: /Stalled deal check/ })
    ).toBeTruthy()
    expect(
      screen.getByRole('menuitem', { name: /Follow-up after a demo/ })
        .textContent
    ).toContain('Recap the demo and set the next step.')
    expect(bridge.list).toHaveBeenCalledWith({
      status: 'published',
      limit: 200
    })
    expect(
      screen
        .getByRole('menuitem', { name: 'All playbooks' })
        .getAttribute('href')
    ).toBe('#/playbooks')
  })

  it('runs a playbook with no blanks straight away, on the record it’s on', async () => {
    const { onRun } = renderMenu()

    openMenu()
    fireEvent.click(
      await screen.findByRole('menuitem', { name: /Stalled deal check/ })
    )

    expect(asked).toHaveLength(1)
    expect(asked[0].record).toEqual(HALDEN)
    expect(asked[0].prompt).toBe(
      [
        'Run the playbook “Stalled deal check” on Halden Capital.',
        'Steps:\nSay why it stalled. Propose a next step.',
        'You may propose changes to fields and tasks, and nothing else. Every change is a proposal for a person to approve. Never send email or change who owns a record.'
      ].join('\n\n')
    )
    expect(onRun).toHaveBeenCalledWith(asked[0], STALLED)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('asks the blanks first, and fills the answers into the steps', async () => {
    renderMenu()

    openMenu()
    fireEvent.click(
      await screen.findByRole('menuitem', { name: /Follow-up after a demo/ })
    )

    const dialog = await screen.findByRole('dialog', {
      name: 'Follow-up after a demo'
    })
    const choices = within(dialog).getByRole('group', {
      name: 'Which plan did they pick?'
    })
    expect(
      within(choices)
        .getAllByRole('button')
        .map((choice) => choice.textContent)
    ).toEqual(['Starter', 'Team'])

    // Nothing runs until every blank has an answer.
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Run playbook' })
    )
    expect(within(dialog).getByText('Choose one')).toBeTruthy()
    expect(asked).toHaveLength(0)

    fireEvent.click(within(choices).getByRole('button', { name: 'Starter' }))
    fireEvent.click(within(choices).getByRole('button', { name: 'Team' }))
    expect(
      within(choices)
        .getByRole('button', { name: 'Team' })
        .getAttribute('aria-pressed')
    ).toBe('true')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Run playbook' })
    )

    expect(asked).toHaveLength(1)
    expect(asked[0].record).toEqual(HALDEN)
    expect(asked[0].prompt).toContain('on Halden Capital.')
    expect(asked[0].prompt).toContain(
      'Read the demo notes. Draft a recap for the Team plan.'
    )
    expect(asked[0].prompt).not.toContain('{Plan}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('takes a typed answer where a blank has no options', async () => {
    const typed = makePlaybook({
      status: 'published',
      current: {
        ...makePlaybook().current,
        steps: 'Draft a recap.',
        blanks: [
          {
            name: 'Budget',
            question: 'What budget did they give?',
            options: []
          }
        ]
      }
    })
    renderMenu(makeBridge(typed, listOf(typed)))

    openMenu()
    fireEvent.click(
      await screen.findByRole('menuitem', { name: /Follow-up after a demo/ })
    )
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(
      within(dialog).getByRole('textbox', {
        name: 'What budget did they give?'
      }),
      { target: { value: '40k a year' } }
    )
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Run playbook' })
    )

    // The steps don't name this blank, so the answer is listed after them.
    expect(asked[0].prompt).toContain(
      'Answers:\n- What budget did they give? 40k a year'
    )
  })

  it('closes the questions without running when cancelled', async () => {
    renderMenu()

    openMenu()
    fireEvent.click(
      await screen.findByRole('menuitem', { name: /Follow-up after a demo/ })
    )
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(asked).toHaveLength(0)
  })

  it('says so when there are none, or they didn’t load', async () => {
    renderMenu(makeBridge(DEMO, listOf()))
    openMenu()
    expect(
      (
        await screen.findByRole('menuitem', { name: /No playbooks yet/ })
      ).getAttribute('aria-disabled')
    ).toBe('true')
    cleanup()

    renderMenu(
      makeBridge(DEMO, {
        list: vi.fn(async () => ({
          ok: false as const,
          message: 'Couldn’t reach the server.'
        }))
      })
    )
    openMenu()
    expect(
      (await screen.findByRole('menuitem', { name: /didn’t load/ })).textContent
    ).toContain('Couldn’t reach the server.')
  })

  it('shows nothing where playbooks can’t be reached', () => {
    const { container } = render(
      <RunPlaybookMenu bridge={null} record={HALDEN} />
    )
    expect(container.innerHTML).toBe('')
  })
})
