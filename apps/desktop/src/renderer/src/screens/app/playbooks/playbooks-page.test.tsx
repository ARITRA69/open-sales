// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PlaybooksPage } from './playbooks-page'
import { makeBridge, makePlaybook } from './test-data'

const MANAGER = {
  id: 'u1',
  name: 'Mo Rahman',
  email: 'mo@halden.com',
  role: 'manager' as const
}
const MEMBER = {
  ...MANAGER,
  id: 'u2',
  name: 'Ravi Shah',
  role: 'member' as const
}

const PUBLISHED = makePlaybook({ status: 'published' })

const open = (hash: string) => {
  window.location.hash = hash
}

describe('PlaybooksPage', () => {
  afterEach(() => {
    cleanup()
    open('')
  })

  it('shows a manager the whole library, with drafts and New playbook', async () => {
    open('#/playbooks')
    const draft = makePlaybook()
    const bridge = makeBridge(draft)
    render(<PlaybooksPage bridge={bridge} me={MANAGER} />)

    const row = await screen.findByRole('row', {
      name: /Follow-up after a demo/
    })
    expect(row.textContent).toContain('Recap the demo and set the next step.')
    expect(row.textContent).toContain('Mo Rahman')
    expect(row.textContent).toContain('Draft')
    expect(bridge.list).toHaveBeenCalledWith({
      status: 'any',
      archived: 'false'
    })
    expect(
      screen.getByRole('link', { name: 'New playbook' }).getAttribute('href')
    ).toBe('#/playbooks/new')
    expect(screen.getByRole('tab', { name: 'Drafts' })).toBeTruthy()
    // A row opens the playbook's own page.
    expect(
      row.querySelector('a[href="#/playbooks/p1"]') ??
        screen.queryByRole('link', { name: /Follow-up after a demo/ })
    ).toBeTruthy()
  })

  it('shows a member only published playbooks, with nothing to write', async () => {
    open('#/playbooks')
    const bridge = makeBridge(PUBLISHED)
    render(<PlaybooksPage bridge={bridge} me={MEMBER} />)

    await screen.findByRole('row', { name: /Follow-up after a demo/ })
    expect(bridge.list).toHaveBeenCalledWith({
      status: 'published',
      archived: 'false'
    })
    expect(screen.queryByRole('link', { name: 'New playbook' })).toBeNull()
    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.queryByText('Draft')).toBeNull()
  })

  it('tells a member plainly when nothing is published yet', async () => {
    open('#/playbooks')
    const bridge = makeBridge(PUBLISHED, {
      list: vi.fn(async () => ({
        ok: true as const,
        data: { items: [], nextCursor: null }
      }))
    })
    render(<PlaybooksPage bridge={bridge} me={MEMBER} />)

    expect(await screen.findByText('No playbooks yet')).toBeTruthy()
    expect(screen.getByText(/haven’t published a playbook yet/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Write the first/ })).toBeNull()
  })

  it('opens one playbook at its own address, read-only for a member', async () => {
    open('#/playbooks/p1')
    const bridge = makeBridge({ ...PUBLISHED, canEdit: false })
    render(<PlaybooksPage bridge={bridge} me={MEMBER} />)

    expect(
      await screen.findByRole('heading', { name: 'Follow-up after a demo' })
    ).toBeTruthy()
    expect(bridge.get).toHaveBeenCalledWith('p1')
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
    expect(
      screen.getByText(/Only managers and admins can change playbooks/)
    ).toBeTruthy()
  })

  it('says so when the playbook isn’t there, or isn’t theirs to see', async () => {
    open('#/playbooks/p9')
    const bridge = makeBridge(PUBLISHED, {
      get: vi.fn(async () => ({
        ok: false as const,
        message: 'That playbook doesn’t exist, or was deleted.',
        code: 'not_found'
      }))
    })
    render(<PlaybooksPage bridge={bridge} me={MEMBER} />)

    expect(
      await screen.findByText('That playbook doesn’t exist, or was deleted.')
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Back to playbooks' })
    ).toBeTruthy()
  })

  it('lets a manager start a new one, and keeps members out of it', async () => {
    open('#/playbooks/new')
    const bridge = makeBridge()
    const { unmount } = render(<PlaybooksPage bridge={bridge} me={MANAGER} />)
    expect(screen.getByRole('heading', { name: 'New playbook' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Publish' })).toBeTruthy()
    unmount()

    render(<PlaybooksPage bridge={bridge} me={MEMBER} />)
    await waitFor(() =>
      expect(
        screen.getByText('Only managers and admins can write playbooks.')
      ).toBeTruthy()
    )
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull()
  })

  it('stays a calm empty page where there’s no server to ask', () => {
    open('#/playbooks')
    render(<PlaybooksPage bridge={null} me={MANAGER} />)
    expect(screen.getByText('No playbooks yet')).toBeTruthy()
  })
})
