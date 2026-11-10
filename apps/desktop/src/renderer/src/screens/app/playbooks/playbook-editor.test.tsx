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
import { PlaybookEditor } from './playbook-editor'
import { makeBridge, makePlaybook } from './test-data'

const type = (box: HTMLElement, value: string) =>
  fireEvent.change(box, { target: { value } })

const box = (name: string | RegExp) => screen.getByRole('textbox', { name })
const button = (name: string | RegExp) => screen.getByRole('button', { name })
const stepsBox = () => box('Steps') as HTMLTextAreaElement
// The playbook's own name: each blank has a Name box too, further down.
const nameBox = () =>
  screen.getAllByRole('textbox', { name: 'Name' })[0] as HTMLInputElement

/** Types an option into a blank and presses Enter. */
const addOption = (blank: string, option: string) => {
  const optionBox = box(`Add an option to ${blank}`)
  type(optionBox, option)
  fireEvent.keyDown(optionBox, { key: 'Enter' })
}

/** Collects what's handed to Ask AI. */
const listenForAsk = () => {
  const asked: TAskDetail[] = []
  const listener = (event: Event) =>
    asked.push((event as CustomEvent<TAskDetail>).detail)
  window.addEventListener(ASK_EVENT, listener)
  return { asked, stop: () => window.removeEventListener(ASK_EVENT, listener) }
}

describe('PlaybookEditor', () => {
  afterEach(cleanup)

  describe('blanks', () => {
    it('writes a blank with options and saves it with the draft', async () => {
      const bridge = makeBridge()
      const onCreated = vi.fn()
      render(
        <PlaybookEditor
          canWrite
          bridge={bridge}
          playbook={null}
          onCreated={onCreated}
        />
      )

      type(nameBox(), 'Demo follow-up')
      type(stepsBox(), 'Draft a recap for the')
      fireEvent.click(button('Add a blank'))

      const blank = screen.getByRole('group', { name: 'Blank: blank 1' })
      type(within(blank).getByRole('textbox', { name: 'Name' }), 'Plan')
      type(
        within(blank).getByRole('textbox', { name: 'Question to ask' }),
        'Which plan did they pick?'
      )
      addOption('Plan', 'Starter')
      addOption('Plan', ' Team ')
      // The same option twice is kept once.
      addOption('Plan', 'Team')

      fireEvent.click(button('Add it to the steps'))
      expect(stepsBox().value).toBe('Draft a recap for the {Plan}')

      fireEvent.click(button('Save as draft'))
      await waitFor(() => expect(bridge.create).toHaveBeenCalledOnce())
      expect(bridge.create).toHaveBeenCalledWith({
        name: 'Demo follow-up',
        description: '',
        steps: 'Draft a recap for the {Plan}',
        blanks: [
          {
            name: 'Plan',
            question: 'Which plan did they pick?',
            options: ['Starter', 'Team']
          }
        ],
        allowedChanges: ['fields', 'tasks', 'email_drafts']
      })
      await waitFor(() => expect(onCreated).toHaveBeenCalledOnce())
    })

    it('keeps an option that was typed but never entered', async () => {
      const playbook = makePlaybook()
      const bridge = makeBridge(playbook)
      render(<PlaybookEditor canWrite bridge={bridge} playbook={playbook} />)

      const optionBox = box('Add an option to Plan')
      type(optionBox, 'Enterprise')
      fireEvent.blur(optionBox)
      fireEvent.click(button('Save as draft'))

      await waitFor(() => expect(bridge.update).toHaveBeenCalledOnce())
      expect(bridge.update).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({
          blanks: [
            {
              name: 'Plan',
              question: 'Which plan did they pick?',
              options: ['Starter', 'Team', 'Enterprise']
            }
          ],
          version: 1
        })
      )
    })

    it('removes options and whole blanks', async () => {
      const playbook = makePlaybook()
      const bridge = makeBridge(playbook)
      render(<PlaybookEditor canWrite bridge={bridge} playbook={playbook} />)

      // Nothing has changed yet, so there's nothing to save.
      expect((button('Save as draft') as HTMLButtonElement).disabled).toBe(true)

      fireEvent.click(button('Remove option Team'))
      expect(screen.queryByText('Team')).toBeNull()
      expect(screen.getByText('Starter')).toBeTruthy()

      fireEvent.click(button('Remove Plan'))
      await waitFor(() =>
        expect(screen.queryByRole('group', { name: 'Blank: Plan' })).toBeNull()
      )

      fireEvent.click(button('Save as draft'))
      await waitFor(() => expect(bridge.update).toHaveBeenCalledOnce())
      expect(bridge.update).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ blanks: [], version: 1 })
      )
    })

    it('says what’s wrong with a blank instead of saving it', async () => {
      const playbook = makePlaybook()
      const bridge = makeBridge(playbook)
      render(<PlaybookEditor canWrite bridge={bridge} playbook={playbook} />)

      fireEvent.click(button('Add a blank'))
      const second = screen.getByRole('group', { name: 'Blank: blank 2' })
      type(within(second).getByRole('textbox', { name: 'Name' }), 'plan')
      type(
        within(second).getByRole('textbox', { name: 'Question to ask' }),
        'Monthly or yearly?'
      )
      fireEvent.click(button('Save as draft'))

      expect((await screen.findByRole('alert')).textContent).toContain(
        'Two blanks have the same name'
      )

      type(within(second).getByRole('textbox', { name: 'Name' }), 'Billing')
      type(
        within(second).getByRole('textbox', { name: 'Question to ask' }),
        ' '
      )
      fireEvent.click(button('Save as draft'))
      expect(screen.getByRole('alert').textContent).toContain(
        'Write the question to ask'
      )
      expect(bridge.update).not.toHaveBeenCalled()
    })
  })

  it('needs a name', () => {
    const bridge = makeBridge()
    render(<PlaybookEditor canWrite bridge={bridge} playbook={null} />)

    fireEvent.click(button('Save as draft'))

    expect(screen.getByText('Name the playbook')).toBeTruthy()
    expect(bridge.create).not.toHaveBeenCalled()
  })

  it('saves which changes it may make, and always says what it can’t', async () => {
    const playbook = makePlaybook()
    const bridge = makeBridge(playbook)
    render(<PlaybookEditor canWrite bridge={bridge} playbook={playbook} />)

    expect(
      screen.getByText('It can never send email or change owners.')
    ).toBeTruthy()
    const choices = screen.getAllByRole('checkbox')
    expect(
      choices.map((choice) => choice.getAttribute('aria-checked'))
    ).toEqual(['true', 'false', 'true'])
    // Only the fixed three: nothing offers sending email or changing owners.
    expect(choices).toHaveLength(3)

    fireEvent.click(screen.getByRole('checkbox', { name: /Tasks/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Email drafts/ }))
    fireEvent.click(button('Save as draft'))

    await waitFor(() => expect(bridge.update).toHaveBeenCalledOnce())
    expect(bridge.update).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ allowedChanges: ['fields', 'tasks'] })
    )
  })

  it('publishes what’s written: saves first, then publishes that version', async () => {
    const playbook = makePlaybook()
    const bridge = makeBridge(playbook)
    render(<PlaybookEditor canWrite bridge={bridge} playbook={playbook} />)

    expect(screen.getByText('Draft')).toBeTruthy()
    expect(
      screen.getByText(/Version 1 · last changed .* by Mo Rahman/)
    ).toBeTruthy()

    type(stepsBox(), 'Read the notes. Propose the next step.')
    fireEvent.click(button('Publish'))

    await waitFor(() => expect(bridge.setState).toHaveBeenCalledOnce())
    expect(bridge.update).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({
        steps: 'Read the notes. Propose the next step.',
        version: 1
      })
    )
    // The version the save handed back, not the one the page opened with.
    expect(bridge.setState).toHaveBeenCalledWith('p1', 'publish', 2)
    expect(await screen.findByText('Published')).toBeTruthy()
    // Published: one main button, and Unpublish in the menu.
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull()
    expect(button('Save changes')).toBeTruthy()
  })

  it('won’t publish without steps', () => {
    const playbook = makePlaybook()
    const bridge = makeBridge(playbook)
    render(<PlaybookEditor canWrite bridge={bridge} playbook={playbook} />)

    type(stepsBox(), '  ')
    fireEvent.click(button('Publish'))

    expect(screen.getByRole('alert').textContent).toContain('Write the steps')
    expect(bridge.update).not.toHaveBeenCalled()
    expect(bridge.setState).not.toHaveBeenCalled()
  })

  it('offers the other person’s version when someone saved first', async () => {
    const playbook = makePlaybook()
    const theirs = makePlaybook({ name: 'Renamed by Dan', version: 2 })
    const bridge = makeBridge(playbook, {
      update: vi.fn(async () => ({
        ok: false as const,
        message: 'Someone changed this while you were editing.',
        code: 'changed_since'
      })),
      get: vi.fn(async () => ({ ok: true as const, data: theirs }))
    })
    render(<PlaybookEditor canWrite bridge={bridge} playbook={playbook} />)

    type(nameBox(), 'My name for it')
    fireEvent.click(button('Save as draft'))
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Someone changed this'
    )

    fireEvent.click(button('Load their version'))
    await waitFor(() => expect(nameBox().value).toBe('Renamed by Dan'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows members the same page, read-only', () => {
    const playbook = makePlaybook({ status: 'published', canEdit: false })
    const bridge = makeBridge(playbook)
    render(
      <PlaybookEditor bridge={bridge} canWrite={false} playbook={playbook} />
    )

    expect(
      screen.getByText(/Only managers and admins can change playbooks/)
    ).toBeTruthy()
    for (const name of [
      'Save changes',
      'Save as draft',
      'Publish',
      'More',
      'Try it',
      'Add a blank',
      'Remove Plan',
      'Remove option Team'
    ]) {
      expect(screen.queryByRole('button', { name })).toBeNull()
    }
    for (const field of screen.getAllByRole('textbox')) {
      expect((field as HTMLInputElement).readOnly).toBe(true)
    }
    for (const choice of screen.getAllByRole('checkbox')) {
      expect((choice as HTMLButtonElement).disabled).toBe(true)
    }
    // They still see the question it asks and what it may change.
    expect((box('Question to ask') as HTMLInputElement).value).toBe(
      'Which plan did they pick?'
    )
    expect(
      screen.getByText('It can never send email or change owners.')
    ).toBeTruthy()
  })

  describe('Try it', () => {
    it('asks the blanks, then hands the steps to Ask AI', async () => {
      const playbook = makePlaybook()
      const ask = listenForAsk()
      render(
        <PlaybookEditor
          canWrite
          bridge={makeBridge(playbook)}
          playbook={playbook}
        />
      )
      expect(
        screen.getByText(/runs on your own Claude Code or Codex/)
      ).toBeTruthy()

      fireEvent.click(button('Try it'))
      const dialog = await screen.findByRole('dialog', {
        name: 'Follow-up after a demo'
      })
      // Every blank needs an answer.
      fireEvent.click(within(dialog).getByRole('button', { name: 'Try it' }))
      expect(within(dialog).getByText('Choose one')).toBeTruthy()
      expect(ask.asked).toHaveLength(0)

      fireEvent.click(within(dialog).getByRole('button', { name: 'Team' }))
      fireEvent.click(within(dialog).getByRole('button', { name: 'Try it' }))

      expect(ask.asked).toHaveLength(1)
      expect(ask.asked[0].record).toEqual({
        type: 'playbook',
        id: 'p1',
        label: 'Follow-up after a demo'
      })
      expect(ask.asked[0].prompt).toContain(
        'Read the demo notes. Draft a recap for the Team plan.'
      )
      expect(ask.asked[0].prompt).toContain(
        'You may propose changes to fields and email drafts, and nothing else.'
      )
      expect(ask.asked[0].prompt).toContain('Never send email')
      expect((await screen.findByRole('status')).textContent).toContain(
        'Handed to Ask AI'
      )
      ask.stop()
    })

    it('tries the steps as written now, before they’re saved', () => {
      const ask = listenForAsk()
      render(<PlaybookEditor canWrite bridge={makeBridge()} playbook={null} />)

      fireEvent.click(button('Try it'))
      expect(screen.getByRole('alert').textContent).toContain(
        'Write the steps first'
      )

      type(stepsBox(), 'Sum up this deal in three lines.')
      fireEvent.click(button('Try it'))

      expect(ask.asked).toHaveLength(1)
      expect(ask.asked[0].record).toEqual({
        type: 'playbook',
        id: 'new',
        label: 'Untitled playbook'
      })
      expect(ask.asked[0].prompt).toContain('Sum up this deal in three lines.')
      ask.stop()
    })

    it('says so when no AI tool is ready on this computer', () => {
      render(
        <PlaybookEditor
          canWrite
          aiToolReady={false}
          bridge={makeBridge()}
          playbook={null}
        />
      )
      expect(
        screen.getByText(/No AI tool is ready on this computer/)
      ).toBeTruthy()
      expect(
        screen
          .getByRole('link', { name: 'Set one up in Settings' })
          .getAttribute('href')
      ).toBe('#/settings')
    })
  })
})
