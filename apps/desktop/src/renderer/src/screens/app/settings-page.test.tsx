// @vitest-environment happy-dom
import type { Role, TSessionUser } from '@open-sales/shared'
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

import type { TTeamControls } from '@/hooks/use-team'

import { SettingsPage } from './settings-page'
import type { TSettingsBridge } from './settings/settings-bridge'

const person = (role: Role): TSessionUser => ({
  id: 'asha',
  name: 'Asha Menon',
  email: 'asha@halden.com',
  role
})

const makeBridge = (): TSettingsBridge => ({
  getWorkspace: vi.fn(async () => ({
    ok: true as const,
    data: { name: 'Halden', currency: 'USD', timeZone: 'UTC' }
  })),
  updateWorkspace: vi.fn(async () => ({
    ok: true as const,
    data: { name: 'Halden Capital', currency: 'USD', timeZone: 'UTC' }
  })),
  updateMe: vi.fn(async ({ name }) => ({
    ok: true as const,
    data: { ...person('member'), name }
  })),
  getPipeline: vi.fn(async () => ({
    ok: true as const,
    data: {
      id: 'sales',
      name: 'Sales',
      revision: 'r1',
      stages: [
        {
          id: 'qualified',
          name: 'Qualified',
          position: 0,
          kind: 'open' as const,
          winProbability: 10,
          stalledAfterDays: 14,
          goal: null,
          exitCriteria: null,
          dealCount: 0
        }
      ],
      lostReasons: [{ id: 'price', label: 'Price', archivedAt: null }]
    }
  })),
  saveStages: vi.fn(),
  saveLostReasons: vi.fn(),
  updateMember: vi.fn()
})

const TEAM: TTeamControls = {
  joinLink: null,
  members: [
    {
      id: 'asha',
      name: 'Asha Menon',
      email: 'asha@halden.com',
      role: 'admin',
      status: 'active',
      joinedAt: '2026-11-01T09:00:00.000Z'
    }
  ],
  pending: [],
  problem: null,
  resetJoinLink: vi.fn(),
  setTrustedDomain: vi.fn(),
  turnOffJoinLink: vi.fn(),
  decide: vi.fn(),
  reload: vi.fn()
}

const renderPage = (role: Role, hash: string, bridge = makeBridge()) => {
  window.location.hash = hash
  render(
    <SettingsPage
      aiTools={null}
      bridge={bridge}
      serverHost="sales.halden.com"
      team={role === 'admin' ? TEAM : null}
      user={person(role)}
      workspaceName="Halden"
      onCheckAiTools={vi.fn()}
      onSignOut={vi.fn()}
    />
  )
  return bridge
}

const sectionLinks = () =>
  within(screen.getByRole('navigation', { name: 'Settings' }))
    .getAllByRole('link')
    .map((link) => link.textContent)

describe('SettingsPage', () => {
  afterEach(() => {
    cleanup()
    window.location.hash = ''
  })

  it.each(['member', 'manager'] as const)(
    'shows a %s only their own settings, whatever the address says',
    async (role) => {
      const bridge = renderPage(role, '#/settings/team')

      expect(sectionLinks()).toEqual(['My settings'])
      expect(
        screen.getByRole('heading', { level: 1, name: 'My settings' })
      ).toBeTruthy()
      expect(screen.queryByText('Join link')).toBeNull()

      for (const section of ['workspace', 'pipeline', 'lost-reasons']) {
        act(() => {
          window.location.hash = `#/settings/${section}`
          window.dispatchEvent(new Event('hashchange'))
        })
        expect(
          screen.getByRole('heading', { level: 1, name: 'My settings' })
        ).toBeTruthy()
      }
      // Nothing an admin runs was even asked for.
      expect(bridge.getWorkspace).not.toHaveBeenCalled()
      expect(bridge.getPipeline).not.toHaveBeenCalled()
    }
  )

  it('gives an admin every section, each at its own address', async () => {
    renderPage('admin', '#/settings/workspace')

    expect(sectionLinks()).toEqual([
      'My settings',
      'Workspace',
      'Pipeline stages',
      'Lost reasons',
      'Team'
    ])
    expect(
      screen.getByRole('link', { name: 'Workspace' }).getAttribute('href')
    ).toBe('#/settings/workspace')
    expect(
      screen
        .getByRole('link', { name: 'Workspace' })
        .getAttribute('aria-current')
    ).toBe('page')
    expect(
      ((await screen.findByLabelText('Name')) as HTMLInputElement).value
    ).toBe('Halden')

    const goTo = (section: string) =>
      act(() => {
        window.location.hash = `#/settings/${section}`
        window.dispatchEvent(new Event('hashchange'))
      })

    goTo('pipeline')
    expect(
      ((await screen.findByLabelText('Stage name')) as HTMLInputElement).value
    ).toBe('Qualified')

    goTo('lost-reasons')
    expect(
      ((await screen.findByLabelText('Reason')) as HTMLInputElement).value
    ).toBe('Price')

    goTo('team')
    expect(screen.getByText('Join link')).toBeTruthy()
    expect(screen.getByRole('list', { name: 'People' })).toBeTruthy()

    goTo('nowhere')
    expect(
      screen.getByRole('heading', { level: 1, name: 'My settings' })
    ).toBeTruthy()
  })

  it('lets anyone change their own name, and shows their email and role', async () => {
    const bridge = renderPage('member', '#/settings')

    expect(screen.getByText('asha@halden.com')).toBeTruthy()
    expect(screen.getByText('Member')).toBeTruthy()
    expect(screen.getByText('sales.halden.com')).toBeTruthy()

    const name = screen.getByLabelText('Name') as HTMLInputElement
    const save = screen.getByRole('button', { name: 'Save' })
    expect((save as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(name, { target: { value: ' ' } })
    fireEvent.click(save)
    expect(await screen.findByText('Enter your name')).toBeTruthy()
    expect(bridge.updateMe).not.toHaveBeenCalled()

    fireEvent.change(name, { target: { value: 'Asha K. Menon' } })
    fireEvent.click(save)
    await waitFor(() =>
      expect(bridge.updateMe).toHaveBeenCalledWith({ name: 'Asha K. Menon' })
    )
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(true))
    expect(name.value).toBe('Asha K. Menon')
  })

  it('saves only what an admin changed about the workspace', async () => {
    const bridge = renderPage('admin', '#/settings/workspace')

    fireEvent.change(await screen.findByLabelText('Name'), {
      target: { value: 'Halden Capital' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(bridge.updateWorkspace).toHaveBeenCalledWith({
        name: 'Halden Capital'
      })
    )
  })
})
