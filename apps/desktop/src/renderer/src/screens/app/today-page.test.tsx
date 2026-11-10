// @vitest-environment happy-dom
import type { TProposal } from '@open-sales/shared'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TodayPage } from './today-page'
import { ASK_EVENT, type TAskDetail } from './today/ask'
import { makeProposal } from './today/test-data'
import { useToday, type TProposalsBridge } from './today/use-today'

const makeBridge = (waiting: TProposal[]): TProposalsBridge => ({
  list: vi.fn(async () => ({
    ok: true as const,
    data: { items: waiting, nextCursor: null, total: waiting.length }
  })),
  create: vi.fn(),
  approve: vi.fn(async (id: string) => ({
    ok: true as const,
    data: makeProposal({
      id,
      title: waiting.find((proposal) => proposal.id === id)?.title,
      status: 'approved',
      undoUntil: '2099-01-01T00:00:00.000Z'
    })
  })),
  decline: vi.fn(async (id: string) => ({
    ok: true as const,
    data: makeProposal({ id, status: 'declined' })
  })),
  undo: vi.fn(),
  sendToOwner: vi.fn()
})

type THarnessProps = Partial<Parameters<typeof TodayPage>[0]> & {
  bridge: TProposalsBridge | null
}

const Harness = ({ bridge, ...pageProps }: THarnessProps) => {
  const today = useToday(null, bridge)
  return (
    <TodayPage
      firstName="Asha"
      now={new Date(2026, 10, 10, 9)}
      today={today}
      workspaceName="Halden"
      {...pageProps}
    />
  )
}

/** Collects what the page asks the Ask panel. */
const listenForAsks = () => {
  const asked: TAskDetail[] = []
  const handle = (event: Event) =>
    asked.push((event as CustomEvent<TAskDetail>).detail)
  window.addEventListener(ASK_EVENT, handle)
  return { asked, stop: () => window.removeEventListener(ASK_EVENT, handle) }
}

describe('TodayPage', () => {
  afterEach(cleanup)

  it('greets the person and stays calm when nothing waits', async () => {
    render(<Harness bridge={makeBridge([])} />)

    expect(screen.getByText('Good morning, Asha')).toBeTruthy()
    expect(screen.getByText('Here’s what needs you at Halden.')).toBeTruthy()
    expect(await screen.findByText('You’re all caught up')).toBeTruthy()
    // Wired later: nothing shows until there's something to show.
    expect(screen.queryByText('Follow-ups due')).toBeNull()
    expect(screen.queryByText('Deals needing a nudge')).toBeNull()
    expect(screen.queryByText('Waiting to join')).toBeNull()
  })

  it('hands questions and suggested prompts to the Ask panel', async () => {
    const { asked, stop } = listenForAsks()
    render(<Harness bridge={null} />)

    const box = screen.getByLabelText(
      'Ask AI about your deals, accounts and people'
    )
    const ask = screen.getByRole('button', { name: 'Ask' })
    expect((ask as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(box, { target: { value: ' Which deals are at risk? ' } })
    fireEvent.click(ask)
    expect((box as HTMLInputElement).value).toBe('')

    fireEvent.click(
      screen.getByRole('button', { name: 'Who should I call today?' })
    )
    fireEvent.click(
      within(screen.getByRole('status')).getByRole('button', {
        name: 'Catch me up on my pipeline'
      })
    )
    stop()

    expect(asked).toEqual([
      { prompt: 'Which deals are at risk?' },
      { prompt: 'Who should I call today?' },
      { prompt: 'Catch me up on my pipeline' }
    ])
  })

  it('lists proposals with their count, and approves one from its card', async () => {
    const bridge = makeBridge([
      makeProposal({ id: 'p1', title: 'Move Platform to Proposal' }),
      makeProposal({ id: 'p2', title: 'Set the industry' })
    ])
    render(<Harness bridge={bridge} />)

    const first = await screen.findByRole('group', {
      name: 'Move Platform to Proposal'
    })
    expect(
      within(
        screen.getByRole('heading', { name: /Waiting for you/ })
      ).getByText('2')
    ).toBeTruthy()

    fireEvent.click(within(first).getByRole('button', { name: 'Approve' }))
    expect(
      await screen.findByText('Done: Move Platform to Proposal')
    ).toBeTruthy()
    expect(bridge.approve).toHaveBeenCalledWith('p1', undefined)
    expect(
      within(
        screen.getByRole('heading', { name: /Waiting for you/ })
      ).getByText('1')
    ).toBeTruthy()
  })

  it('approves several at once from the bar', async () => {
    const bridge = makeBridge([
      makeProposal({ id: 'p1', title: 'Move Platform to Proposal' }),
      makeProposal({ id: 'p2', title: 'Set the industry' }),
      // Out of date: it needs a look, so it can't be ticked.
      makeProposal({ id: 'p3', title: 'Old news', status: 'out_of_date' })
    ])
    render(<Harness bridge={bridge} />)

    await screen.findByRole('group', { name: 'Set the industry' })
    expect(screen.queryByRole('toolbar')).toBeNull()
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)

    for (const title of ['Move Platform to Proposal', 'Set the industry']) {
      fireEvent.click(screen.getByRole('checkbox', { name: `Select ${title}` }))
    }
    const bar = screen.getByRole('toolbar', { name: 'Selection' })
    expect(within(bar).getByText('2 selected')).toBeTruthy()

    await act(async () => {
      fireEvent.click(within(bar).getByRole('button', { name: 'Approve' }))
    })
    await waitFor(() => expect(bridge.approve).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Done: Set the industry')).toBeTruthy()
    expect(screen.queryByRole('toolbar')).toBeNull()
    expect(screen.getByRole('group', { name: 'Old news' })).toBeTruthy()
  })

  it('shows people waiting to join, follow-ups and stalled deals when given them', async () => {
    const onFollowUpDone = vi.fn()
    const { asked, stop } = listenForAsks()
    render(
      <Harness
        bridge={null}
        followUps={[
          {
            id: 't1',
            title: 'Send pricing to Tom',
            detail: 'Halden Capital · Platform',
            dueOn: '2020-01-01',
            href: '#/deals/d1'
          }
        ]}
        nudges={[
          {
            id: 'd1',
            name: 'Platform',
            companyName: 'Halden Capital',
            idleDays: 16,
            stageName: 'Proposal',
            reason: 'No reply since the proposal went out.'
          }
        ]}
        pendingPeople={[
          {
            id: 'ravi',
            name: 'Ravi Shah',
            email: 'ravi@gmail.com',
            role: 'member',
            status: 'pending',
            joinedAt: '2026-11-09T11:00:00.000Z'
          }
        ]}
        onFollowUpDone={onFollowUpDone}
      />
    )

    expect(screen.getByText('Waiting to join')).toBeTruthy()
    expect(screen.getByText('Ravi Shah')).toBeTruthy()

    expect(screen.getByText('Follow-ups due')).toBeTruthy()
    expect(
      screen
        .getByRole('link', { name: 'Send pricing to Tom' })
        .getAttribute('href')
    ).toBe('#/deals/d1')
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Done: Send pricing to Tom' })
    )
    expect(onFollowUpDone).toHaveBeenCalledWith('t1')

    expect(screen.getByText('Deals needing a nudge')).toBeTruthy()
    expect(screen.getByText('Idle 16 days in Proposal')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ask what to do' }))
    stop()
    expect(asked).toEqual([
      {
        prompt: 'What should I do next on Platform?',
        record: { type: 'deal', id: 'd1', label: 'Platform' }
      }
    ])
  })
})
