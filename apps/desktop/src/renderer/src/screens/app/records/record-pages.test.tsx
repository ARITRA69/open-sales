// @vitest-environment happy-dom
import type { TSessionUser } from '@open-sales/shared'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AccountPage } from './account-page'
import { AccountsPage } from './accounts-page'
import { ASK_EVENT, type TAskDetail } from './ask-ai'
import { DealPage } from './deal-page'
import { PeoplePage } from './people-page'
import { PersonPage } from './person-page'
import { FieldList, RecordLayout } from './record-layout'
import {
  ASHA,
  company,
  DAN,
  deal,
  ITEMS,
  makeRecords,
  makeTimeline,
  person,
  task
} from './record-test-data'

const user = (role: TSessionUser['role'], who = ASHA): TSessionUser => ({
  ...who,
  email: 'someone@halden.com',
  role
})

/** The text of each timeline row, top to bottom. */
const rowTexts = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>('[data-slot=timeline-item]')].map(
    (row) => row.textContent ?? ''
  )

describe('RecordLayout', () => {
  afterEach(cleanup)

  it('puts the fields on the left and the timeline in the middle', () => {
    render(
      <RecordLayout
        actions={<button type="button">Edit</button>}
        backLink={{ label: 'Accounts', href: '#/accounts' }}
        fields={
          <FieldList rows={[{ label: 'Website', value: 'halden.com' }]} />
        }
        subtitle="Financial services"
        title="Halden Capital"
      >
        <p>What happened</p>
      </RecordLayout>
    )

    expect(
      screen.getByRole('heading', { level: 1, name: 'Halden Capital' })
    ).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'Accounts' }).getAttribute('href')
    ).toBe('#/accounts')

    const fields = screen.getByRole('complementary', { name: 'Details' })
    const timeline = screen.getByRole('region', { name: 'Timeline' })
    expect(within(fields).getByText('halden.com')).toBeTruthy()
    expect(within(timeline).getByText('What happened')).toBeTruthy()
    // Fields first, then the timeline: left to right, and top to bottom
    // when the Ask AI panel squeezes the page.
    expect(
      fields.compareDocumentPosition(timeline) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('says when a field has nothing in it', () => {
    render(<FieldList rows={[{ label: 'About', value: null }]} />)

    expect(screen.getByText('Not set')).toBeTruthy()
  })
})

describe('AccountPage', () => {
  beforeEach(() => {
    window.location.hash = '#/accounts/c1'
  })
  afterEach(cleanup)

  const renderAccount = ({
    me = user('manager'),
    records = makeRecords(),
    timeline = makeTimeline(),
    section
  }: {
    me?: TSessionUser
    records?: ReturnType<typeof makeRecords>
    timeline?: ReturnType<typeof makeTimeline>
    section?: string
  } = {}) => ({
    records,
    timeline,
    ...render(
      <AccountPage
        bridge={records}
        id="c1"
        me={me}
        section={section}
        timeline={timeline}
      />
    )
  })

  it('shows the fields, the sections, and what’s coming up first', async () => {
    const { container } = renderAccount()

    await screen.findByRole('heading', { name: 'Halden Capital' })
    const fields = screen.getByRole('complementary', { name: 'Details' })
    expect(within(fields).getByText('Financial services')).toBeTruthy()
    expect(within(fields).getByText('Dan Okafor')).toBeTruthy()

    expect(screen.getAllByRole('tab')).toHaveLength(5)
    for (const name of [
      /^Overview/,
      /^Activity/,
      /^Deals/,
      /^People/,
      /^Notes/
    ]) {
      expect(screen.getByRole('tab', { name })).toBeTruthy()
    }
    // Deals and People say how many there are.
    expect(screen.getByRole('tab', { name: /^Deals/ }).textContent).toContain(
      '1'
    )

    await screen.findByText('Send pricing to Tom')
    const upcoming = screen.getByRole('region', { name: 'Coming up' })
    expect(within(upcoming).getByText('Send pricing to Tom')).toBeTruthy()

    const rows = rowTexts(container)
    expect(rows[0]).toContain('Send pricing to Tom')
    expect(rows[1]).toContain('Asha Menon called Priya Nair')
    expect(rows[1]).toContain('Left a voicemail')
    expect(rows[2]).toContain('wrote a note')
    expect(rows[3]).toContain(
      'Dan Okafor moved Platform rollout from Qualified to Proposal'
    )
    expect(rows[4]).toContain(
      'Asha Menon changed the owner from Asha Menon to Dan Okafor'
    )
  })

  it('replaces Edit with who owns it for someone who can’t change it', async () => {
    renderAccount({
      me: user('member'),
      records: makeRecords({ company: company({ canEdit: false }) })
    })

    await screen.findByRole('heading', { name: 'Halden Capital' })
    expect(screen.getByText('Owned by Dan Okafor')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reassign' })).toBeNull()
    // The fields are words, not boxes: there's nothing to type into.
    expect(
      within(
        screen.getByRole('complementary', { name: 'Details' })
      ).queryByRole('textbox')
    ).toBeNull()
    // They can still write down what happened.
    expect(screen.getByRole('button', { name: 'Write a note' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Log a call' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add a task' })).toBeTruthy()
  })

  it('offers Edit to the owner, and Reassign only to managers and admins', async () => {
    const mine = makeRecords({ company: company({ owner: ASHA }) })
    const { unmount } = renderAccount({ me: user('member'), records: mine })
    await screen.findByRole('heading', { name: 'Halden Capital' })
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Reassign' })).toBeNull()
    expect(screen.queryByText(/Owned by/)).toBeNull()
    unmount()

    renderAccount({ me: user('manager') })
    await screen.findByRole('heading', { name: 'Halden Capital' })
    expect(screen.getByRole('button', { name: 'Reassign' })).toBeTruthy()
  })

  it('saves a note and loads the timeline again', async () => {
    const { timeline } = renderAccount()
    fireEvent.click(await screen.findByRole('button', { name: 'Write a note' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), {
      target: { value: 'Budget is signed off.' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }))

    await waitFor(() =>
      expect(timeline.createActivity).toHaveBeenCalledWith({
        type: 'note',
        on: { type: 'company', id: 'c1' },
        body: 'Budget is signed off.'
      })
    )
    await waitFor(() => expect(timeline.read).toHaveBeenCalledTimes(2))
    // The form closes once it's saved.
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Note' })).toBeNull()
    )
  })

  it('won’t save an empty note', async () => {
    const { timeline } = renderAccount()
    fireEvent.click(await screen.findByRole('button', { name: 'Write a note' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }))

    expect(screen.getByRole('alert').textContent).toBe('Write the note first.')
    expect(timeline.createActivity).not.toHaveBeenCalled()
  })

  it('logs a call with who was on it, and hands the notes to the AI', async () => {
    const asked: TAskDetail[] = []
    const listen = (event: Event) =>
      asked.push((event as CustomEvent<TAskDetail>).detail)
    window.addEventListener(ASK_EVENT, listen)

    const { timeline } = renderAccount()
    fireEvent.click(await screen.findByRole('button', { name: 'Log a call' }))
    const form = screen.getByRole('form', { name: 'Log a call' })
    // The account's people are suggested.
    fireEvent.click(within(form).getByRole('button', { name: 'Priya Nair' }))
    fireEvent.change(within(form).getByRole('textbox', { name: 'Notes' }), {
      target: { value: 'Wants pricing by Friday.' }
    })
    fireEvent.click(
      within(form).getByRole('button', { name: 'Save and ask AI' })
    )

    await waitFor(() => expect(timeline.createActivity).toHaveBeenCalled())
    expect(vi.mocked(timeline.createActivity).mock.calls[0][0]).toMatchObject({
      type: 'call',
      on: { type: 'company', id: 'c1' },
      outcome: 'connected',
      body: 'Wants pricing by Friday.',
      personIds: ['p1']
    })
    await waitFor(() => expect(asked).toHaveLength(1))
    expect(asked[0].record).toEqual({
      type: 'company',
      id: 'c1',
      label: 'Halden Capital'
    })
    expect(asked[0].prompt).toContain('Wants pricing by Friday.')
    window.removeEventListener(ASK_EVENT, listen)
  })

  it('saves a call without asking the AI when that’s what was pressed', async () => {
    const asked: Event[] = []
    const listen = (event: Event) => asked.push(event)
    window.addEventListener(ASK_EVENT, listen)

    const { timeline } = renderAccount()
    fireEvent.click(await screen.findByRole('button', { name: 'Log a call' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(timeline.createActivity).toHaveBeenCalled())
    await waitFor(() => expect(timeline.read).toHaveBeenCalledTimes(2))
    expect(asked).toHaveLength(0)
    window.removeEventListener(ASK_EVENT, listen)
  })

  it('adds a task and ticks one off', async () => {
    const { timeline } = renderAccount()
    fireEvent.click(await screen.findByRole('button', { name: 'Add a task' }))
    fireEvent.change(
      screen.getByRole('textbox', { name: 'What needs doing' }),
      { target: { value: 'Send the contract' } }
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }))

    await waitFor(() =>
      expect(timeline.createTask).toHaveBeenCalledWith({
        title: 'Send the contract',
        dueOn: null,
        assigneeId: undefined,
        on: { type: 'company', id: 'c1' }
      })
    )

    fireEvent.click(
      await screen.findByRole('checkbox', {
        name: 'Mark “Send pricing to Tom” as done'
      })
    )
    await waitFor(() =>
      expect(timeline.setTaskDone).toHaveBeenCalledWith('t1', true, 2)
    )
  })

  it('leaves a task alone for someone who can’t change it', async () => {
    renderAccount({
      timeline: makeTimeline([
        {
          kind: 'task',
          id: 't1',
          at: null,
          upcoming: true,
          task: task({ canEdit: false, dueOn: null })
        }
      ])
    })

    const box = await screen.findByRole('checkbox', {
      name: 'Mark “Send pricing to Tom” as done'
    })
    expect(box.hasAttribute('disabled')).toBe(true)
    expect(
      screen.queryByRole('button', { name: 'More for this task' })
    ).toBeNull()
  })

  it('says why a change didn’t save, where it was made', async () => {
    const timeline = makeTimeline()
    vi.mocked(timeline.createActivity).mockResolvedValue({
      ok: false,
      message: 'Restore this company to add to its timeline.'
    })
    renderAccount({ timeline })
    fireEvent.click(await screen.findByRole('button', { name: 'Write a note' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), {
      target: { value: 'Too late' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Restore this company to add to its timeline.'
    )
    // What they typed is still there.
    expect(
      screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Note' }).value
    ).toBe('Too late')
  })

  it('lists the account’s deals and people in their sections', async () => {
    const { unmount } = renderAccount({ section: 'deals' })
    const deals = await screen.findByRole('table', {
      name: 'Deals at Halden Capital'
    })
    expect(within(deals).getByText('Platform rollout')).toBeTruthy()
    expect(within(deals).getByText('Proposal')).toBeTruthy()
    expect(
      within(deals)
        .getByRole('link', { name: /Platform rollout/ })
        .getAttribute('href')
    ).toBe('#/deals/d1')
    unmount()

    renderAccount({ section: 'people' })
    const people = await screen.findByRole('table', {
      name: 'People at Halden Capital'
    })
    expect(
      within(people)
        .getByRole('link', { name: /Priya Nair/ })
        .getAttribute('href')
    ).toBe('#/people/p1')
  })

  it('keeps only notes in the Notes section', async () => {
    const { container } = renderAccount({ section: 'notes' })

    await screen.findByText('They renew in January.')
    expect(rowTexts(container)).toHaveLength(1)
    expect(screen.queryByText('Send pricing to Tom')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Log a call' })).toBeNull()
  })

  it('reassigns with the open deals, or hands them back', async () => {
    const records = makeRecords({ company: company({ version: 3 }) })
    vi.mocked(records.get).mockImplementation((async (kind: string) => ({
      ok: true,
      data: kind === 'deals' ? deal({ version: 8 }) : company()
    })) as never)
    renderAccount({ records })

    fireEvent.click(await screen.findByRole('button', { name: 'Reassign' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Move its 1 open deal too')).toBeTruthy()

    // Without a new owner, nothing is sent.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reassign' }))
    expect(within(dialog).getByRole('alert').textContent).toBe(
      'Choose who takes this account.'
    )
    expect(records.update).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: /New owner/ }))
    fireEvent.click(await screen.findByRole('option', { name: 'Asha Menon' }))
    // Leave the deals with Dan.
    fireEvent.click(within(dialog).getByRole('checkbox'))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reassign' }))

    await waitFor(() =>
      expect(records.update).toHaveBeenCalledWith('companies', 'c1', {
        ownerId: ASHA.id,
        version: 3
      })
    )
    // The server moved the deal with the account; it goes back to Dan.
    await waitFor(() =>
      expect(records.update).toHaveBeenCalledWith('deals', 'd1', {
        ownerId: DAN.id,
        version: 8
      })
    )
  })

  it('says so when the account isn’t there', async () => {
    const records = makeRecords()
    vi.mocked(records.get).mockResolvedValue({
      ok: false,
      message: 'That company doesn’t exist, or was deleted.',
      code: 'not_found'
    } as never)
    renderAccount({ records })

    expect(
      await screen.findByText('That company doesn’t exist, or was deleted.')
    ).toBeTruthy()
    expect(
      screen
        .getByRole('link', { name: 'Back to Accounts' })
        .getAttribute('href')
    ).toBe('#/accounts')
  })
})

describe('PersonPage', () => {
  afterEach(cleanup)

  it('shows how to reach them, and their timeline', async () => {
    const timeline = makeTimeline()
    render(<PersonPage bridge={makeRecords()} id="p1" timeline={timeline} />)

    await screen.findByRole('heading', { name: 'Priya Nair' })
    const fields = screen.getByRole('complementary', { name: 'Details' })
    expect(
      within(fields)
        .getByRole('link', { name: 'Halden Capital' })
        .getAttribute('href')
    ).toBe('#/accounts/c1')
    expect(within(fields).getByText('priya@halden.com')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy()
    await waitFor(() =>
      expect(timeline.read).toHaveBeenCalledWith({ type: 'person', id: 'p1' })
    )
  })

  it('names their account’s owner for someone who can’t change them', async () => {
    render(
      <PersonPage
        bridge={makeRecords({ person: person({ canEdit: false }) })}
        id="p1"
        timeline={makeTimeline()}
      />
    )

    expect(await screen.findByText('Owned by Dan Okafor')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Write a note' })).toBeTruthy()
  })

  it('starts a call with them on it', async () => {
    const timeline = makeTimeline()
    render(<PersonPage bridge={makeRecords()} id="p1" timeline={timeline} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Log a call' }))
    const chip = await screen.findByRole('button', { name: 'Priya Nair' })
    expect(chip.getAttribute('aria-pressed')).toBe('true')
  })
})

describe('DealPage', () => {
  afterEach(cleanup)

  it('shows value, stage, close date, next step, owner and people', async () => {
    const timeline = makeTimeline()
    render(
      <DealPage
        bridge={makeRecords()}
        id="d1"
        me={user('manager')}
        timeline={timeline}
      />
    )

    await screen.findByRole('heading', { name: 'Platform rollout' })
    const fields = screen.getByRole('complementary', { name: 'Details' })
    const text = fields.textContent ?? ''
    for (const shown of [
      'Proposal',
      '48,000',
      'Send pricing',
      'Dan Okafor',
      'Priya Nair'
    ]) {
      expect(text).toContain(shown)
    }
    expect(
      within(fields)
        .getByRole('link', { name: 'Priya Nair' })
        .getAttribute('href')
    ).toBe('#/people/p1')
    expect(timeline.listPeople).toHaveBeenCalledWith({ type: 'deal', id: 'd1' })
    expect(await screen.findByRole('button', { name: 'Edit' })).toBeTruthy()
  })

  it('is read-only, with its owner’s name, for someone who can’t change it', async () => {
    const { container } = render(
      <DealPage
        bridge={makeRecords({ deal: deal({ canEdit: false }) })}
        id="d1"
        me={user('member')}
        timeline={makeTimeline(ITEMS.filter((item) => item.kind === 'stage'))}
      />
    )

    expect(await screen.findByText('Owned by Dan Okafor')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    // On its own page a stage move doesn't repeat the deal's name.
    await waitFor(() =>
      expect(rowTexts(container)[0]).toContain(
        'Dan Okafor moved this deal from Qualified to Proposal'
      )
    )
  })
})

describe('the lists', () => {
  afterEach(() => {
    cleanup()
    window.location.hash = ''
  })

  it('link each account to its own page, and open it from the address', async () => {
    window.location.hash = '#/accounts'
    const records = makeRecords()
    render(<AccountsPage bridge={records} me={user('manager')} />)

    const row = await screen.findByRole('link', { name: /Halden Capital/ })
    expect(row.getAttribute('href')).toBe('#/accounts/c1')
    // The dialog stays for adding one.
    fireEvent.click(screen.getByRole('button', { name: 'New account' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    cleanup()

    window.location.hash = '#/accounts/c1/deals'
    render(<AccountsPage bridge={records} me={user('manager')} />)
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Halden Capital' })
    ).toBeTruthy()
    expect(screen.getByRole('tab', { selected: true }).textContent).toContain(
      'Deals'
    )
  })

  it('link each person to their own page', async () => {
    window.location.hash = '#/people'
    const records = makeRecords()
    render(<PeoplePage bridge={records} />)

    const row = await screen.findByRole('link', { name: /Priya Nair/ })
    expect(row.getAttribute('href')).toBe('#/people/p1')
    cleanup()

    window.location.hash = '#/people/p1'
    render(<PeoplePage bridge={records} />)
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Priya Nair' })
    ).toBeTruthy()
  })
})
