import { describe, expect, it } from 'vitest'

import { detectAiTools, searchFolders, type TAiToolsMachine } from './ai-tools'

const HOME = '/Users/asha'

const fakeMachine = (
  overrides: Partial<TAiToolsMachine> & {
    executables?: string[]
    files?: string[]
    keychain?: string[]
  } = {}
): TAiToolsMachine => {
  const { executables = [], files = [], keychain = [], ...rest } = overrides
  return {
    platform: 'darwin',
    homeDir: HOME,
    // A Dock-launched app's PATH: no Homebrew, no ~/.local/bin.
    env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
    isExecutable: async (path) => executables.includes(path),
    fileExists: async (path) => files.includes(path),
    readVersion: async (path) => `${path.split('/').pop()} 1.0.0`,
    hasKeychainItem: async (service) => keychain.includes(service),
    ...rest
  }
}

const stateOf = async (machine: TAiToolsMachine) =>
  Object.fromEntries(
    (await detectAiTools(machine)).tools.map((tool) => [tool.id, tool.state])
  )

describe('detectAiTools', () => {
  it('reports both tools missing on a bare machine', async () => {
    expect(await stateOf(fakeMachine())).toEqual({
      'claude-code': 'not-installed',
      codex: 'not-installed'
    })
  })

  it('finds tools outside a Dock app’s short PATH', async () => {
    const machine = fakeMachine({
      executables: ['/opt/homebrew/bin/claude', `${HOME}/.local/bin/codex`],
      keychain: ['Claude Code-credentials'],
      files: [`${HOME}/.codex/auth.json`]
    })

    const { tools } = await detectAiTools(machine)
    expect(tools).toEqual([
      {
        id: 'claude-code',
        name: 'Claude Code',
        state: 'ready',
        version: 'claude 1.0.0'
      },
      { id: 'codex', name: 'Codex', state: 'ready', version: 'codex 1.0.0' }
    ])
  })

  it('says sign in when a tool is installed without credentials', async () => {
    const machine = fakeMachine({
      executables: ['/opt/homebrew/bin/claude', '/usr/local/bin/codex']
    })
    expect(await stateOf(machine)).toEqual({
      'claude-code': 'needs-sign-in',
      codex: 'needs-sign-in'
    })
  })

  it('counts an API key or a credentials file as signed in', async () => {
    const machine = fakeMachine({
      platform: 'linux',
      env: { PATH: '/usr/bin', OPENAI_API_KEY: 'sk-test' },
      executables: ['/usr/bin/claude', '/usr/bin/codex'],
      files: [`${HOME}/.claude/.credentials.json`]
    })
    expect(await stateOf(machine)).toEqual({
      'claude-code': 'ready',
      codex: 'ready'
    })
  })

  it('reads Codex credentials from CODEX_HOME when it is set', async () => {
    const machine = fakeMachine({
      env: { PATH: '/usr/bin', CODEX_HOME: '/data/codex' },
      executables: ['/usr/bin/codex'],
      files: ['/data/codex/auth.json']
    })
    expect((await stateOf(machine)).codex).toBe('ready')
  })

  it('looks in the npm folder on Windows', () => {
    const machine = fakeMachine({
      platform: 'win32',
      env: { PATH: '', APPDATA: 'C:\\Users\\asha\\AppData\\Roaming' }
    })
    expect(searchFolders(machine)).toEqual([
      expect.stringMatching(/Roaming.npm$/)
    ])
  })
})
