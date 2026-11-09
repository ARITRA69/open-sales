// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import brand from '../../../../../brand.config.json'
import type {
  TConnectionState,
  TOpenSalesBridge
} from '../../../../preload/bridge-types'
import { ConnectionGate } from './connection-gate'

const SERVER = 'http://localhost:8787'
const ADMIN = {
  id: 'u1',
  name: 'Asha Menon',
  email: 'asha@example.com',
  role: 'admin' as const
}

const makeBridge = (
  start: TConnectionState,
  overrides: Partial<TOpenSalesBridge['connection']> = {}
): TOpenSalesBridge['connection'] => ({
  getState: vi.fn(async () => start),
  chooseServer: vi.fn(async () => ({
    ok: true as const,
    state: { step: 'create-admin' as const, serverUrl: SERVER }
  })),
  forgetServer: vi.fn(async () => ({ step: 'choose-server' as const })),
  createAdmin: vi.fn(async () => ({
    ok: true as const,
    state: {
      step: 'signed-in' as const,
      serverUrl: SERVER,
      workspaceName: 'Halden',
      user: ADMIN
    }
  })),
  signIn: vi.fn(async () => ({ ok: false as const, message: 'Nope.' })),
  signOut: vi.fn(async () => ({
    step: 'sign-in' as const,
    serverUrl: SERVER,
    workspaceName: 'Halden'
  })),
  ...overrides
})

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('ConnectionGate', () => {
  afterEach(cleanup)

  it('asks for a server, then for the first admin on a new one', async () => {
    const bridge = makeBridge({ step: 'choose-server' })
    render(<ConnectionGate bridge={bridge} />)

    await screen.findByLabelText('Server address')
    type('Server address', 'localhost:8787')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(
      await screen.findByRole('heading', { name: 'Create the admin account' })
    ).toBeTruthy()
    expect(bridge.chooseServer).toHaveBeenCalledWith('localhost:8787')
  })

  it('checks the setup form before sending it', async () => {
    const bridge = makeBridge({ step: 'create-admin', serverUrl: SERVER })
    render(<ConnectionGate bridge={bridge} />)

    await screen.findByLabelText('Workspace name')
    type('Workspace name', 'Halden')
    type('Your name', 'Asha Menon')
    type('Work email', 'not-an-email')
    type('Password', 'short')
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Enter a valid email address')).toBeTruthy()
    expect(screen.getByText('Use at least 8 characters')).toBeTruthy()
    expect(bridge.createAdmin).not.toHaveBeenCalled()
  })

  it('shows the server’s reason when sign-in fails', async () => {
    const bridge = makeBridge({
      step: 'sign-in',
      serverUrl: SERVER,
      workspaceName: 'Halden'
    })
    render(<ConnectionGate bridge={bridge} />)

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy()
    // The server it's signing in to, with a way to change it.
    expect(screen.getByText('Halden')).toBeTruthy()
    expect(screen.getByText('localhost:8787')).toBeTruthy()
    type('Email', 'asha@example.com')
    type('Password', 'wrong password')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Nope.')
  })

  it('opens on Today, with the signed-in person in the sidebar', async () => {
    render(
      <ConnectionGate
        bridge={makeBridge({
          step: 'signed-in',
          serverUrl: SERVER,
          workspaceName: 'Halden',
          user: ADMIN
        })}
      />
    )

    const sidebar = await screen.findByRole('navigation', {
      name: brand.productName
    })
    expect(within(sidebar).getByText('Asha Menon')).toBeTruthy()
    expect(within(sidebar).getByText('Admin')).toBeTruthy()
    expect(
      screen.getByRole('heading', { level: 1, name: /, Asha$/ })
    ).toBeTruthy()
  })

  it('shows the machine’s AI tools in Settings, with fixes', async () => {
    window.location.hash = '#/settings'
    render(
      <ConnectionGate
        aiToolsBridge={{
          getStatus: vi.fn(async () => ({
            tools: [
              {
                id: 'claude-code' as const,
                name: 'Claude Code',
                state: 'needs-sign-in' as const,
                version: '2.1.0'
              },
              {
                id: 'codex' as const,
                name: 'Codex',
                state: 'not-installed' as const
              }
            ]
          }))
        }}
        bridge={makeBridge({
          step: 'signed-in',
          serverUrl: SERVER,
          workspaceName: 'Halden',
          user: ADMIN
        })}
      />
    )

    expect(await screen.findByText('Installed, not signed in')).toBeTruthy()
    expect(screen.getByText('claude')).toBeTruthy()
    expect(screen.getByText('npm install -g @openai/codex')).toBeTruthy()
    window.location.hash = ''
  })

  it('signs out from Settings', async () => {
    window.location.hash = '#/settings'
    const bridge = makeBridge({
      step: 'signed-in',
      serverUrl: SERVER,
      workspaceName: 'Halden',
      user: ADMIN
    })
    render(<ConnectionGate bridge={bridge} />)

    expect(await screen.findByText('asha@example.com')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy()
    expect(bridge.signOut).toHaveBeenCalled()
    window.location.hash = ''
  })
})
