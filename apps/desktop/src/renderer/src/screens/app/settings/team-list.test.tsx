// @vitest-environment happy-dom
import type { TMember } from '@open-sales/shared'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TeamList } from './team-list'

const member = (
  id: string,
  name: string,
  role: TMember['role'],
  status: TMember['status'] = 'active'
): TMember => ({
  id,
  name,
  email: `${id}@halden.com`,
  role,
  status,
  joinedAt: '2026-11-01T09:00:00.000Z'
})

const ASHA = member('asha', 'Asha Menon', 'admin')
const MO = member('mo', 'Mo Rahman', 'manager')
const DAN = member('dan', 'Dan Okafor', 'member')
const LENA = member('lena', 'Lena Ortiz', 'member', 'deactivated')
const RAVI = member('ravi', 'Ravi Shah', 'member', 'declined')

const renderList = (members: TMember[] = [ASHA, MO, DAN, LENA, RAVI]) => {
  const onUpdate = vi.fn()
  const onApprove = vi.fn()
  render(
    <TeamList
      meId="asha"
      members={members}
      onApprove={onApprove}
      onUpdate={onUpdate}
    />
  )
  return { onUpdate, onApprove }
}

const row = (name: string) => screen.getByRole('listitem', { name })

describe('TeamList', () => {
  afterEach(cleanup)

  it('shows everyone with their role and whether they can sign in', () => {
    renderList()

    expect(within(row('Asha Menon')).getByText('You')).toBeTruthy()
    expect(within(row('Mo Rahman')).getByText('mo@halden.com')).toBeTruthy()
    expect(
      within(row('Mo Rahman')).getByRole('button', {
        name: 'Role of Mo Rahman: Manager'
      })
    ).toBeTruthy()
    expect(within(row('Lena Ortiz')).getByText('Deactivated')).toBeTruthy()
    expect(within(row('Ravi Shah')).getByText('Declined')).toBeTruthy()
  })

  it('changes a role from the pill', async () => {
    const { onUpdate } = renderList()

    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Role of Dan Okafor: Member' }),
      { key: 'Enter' }
    )
    expect(
      (
        await screen.findByRole('menuitemradio', { name: 'Member' })
      ).getAttribute('aria-checked')
    ).toBe('true')
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Manager' }))

    expect(onUpdate).toHaveBeenCalledWith(DAN, { role: 'manager' })
  })

  it('asks before deactivating someone', async () => {
    const { onUpdate } = renderList()

    fireEvent.click(
      within(row('Dan Okafor')).getByRole('button', { name: 'Deactivate' })
    )
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Deactivate Dan Okafor?')).toBeTruthy()
    expect(onUpdate).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Deactivate' }))
    expect(onUpdate).toHaveBeenCalledWith(DAN, { status: 'deactivated' })
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  })

  it('backs out of deactivating without changing anything', async () => {
    const { onUpdate } = renderList()

    fireEvent.click(
      within(row('Mo Rahman')).getByRole('button', { name: 'Deactivate' })
    )
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Cancel'
      })
    )

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('brings back someone deactivated, and lets in someone declined', () => {
    const { onUpdate, onApprove } = renderList()

    fireEvent.click(
      within(row('Lena Ortiz')).getByRole('button', { name: 'Reactivate' })
    )
    expect(onUpdate).toHaveBeenCalledWith(LENA, { status: 'active' })
    // Their role can be changed while they're away.
    expect(
      within(row('Lena Ortiz')).getByRole('button', {
        name: 'Role of Lena Ortiz: Member'
      })
    ).toBeTruthy()

    fireEvent.click(
      within(row('Ravi Shah')).getByRole('button', { name: 'Approve' })
    )
    expect(onApprove).toHaveBeenCalledWith('ravi')
    // Someone who never joined has no role to change yet.
    expect(
      within(row('Ravi Shah')).queryByRole('button', { name: /^Role of/ })
    ).toBeNull()
  })

  it('never offers to deactivate yourself or to lose the only admin', () => {
    renderList()

    const mine = within(row('Asha Menon'))
    expect(mine.queryByRole('button', { name: 'Deactivate' })).toBeNull()
    // The only admin keeps the role until someone else has it.
    expect(mine.queryByRole('button', { name: /^Role of/ })).toBeNull()
    expect(mine.getByText('Only admin')).toBeTruthy()
  })

  it('lets an admin step down once there’s another', () => {
    renderList([ASHA, { ...MO, role: 'admin' }, DAN])

    const mine = within(row('Asha Menon'))
    expect(
      mine.getByRole('button', { name: 'Role of Asha Menon: Admin' })
    ).toBeTruthy()
    // Still not their own account.
    expect(mine.queryByRole('button', { name: 'Deactivate' })).toBeNull()
    expect(
      within(row('Mo Rahman')).getByRole('button', { name: 'Deactivate' })
    ).toBeTruthy()
  })

  it('doesn’t count a deactivated admin as one', () => {
    renderList([ASHA, { ...MO, role: 'admin', status: 'deactivated' }])

    expect(within(row('Asha Menon')).getByText('Only admin')).toBeTruthy()
  })
})
