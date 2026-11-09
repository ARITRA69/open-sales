import { execFile } from 'node:child_process'
import { access, constants } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

import type {
  TAiToolId,
  TAiToolsStatus,
  TAiToolStatus
} from '../preload/bridge-types'

/** What detection needs from the machine. Passed in so tests can fake it. */
export type TAiToolsMachine = {
  platform: NodeJS.Platform
  homeDir: string
  env: Record<string, string | undefined>
  isExecutable: (path: string) => Promise<boolean>
  fileExists: (path: string) => Promise<boolean>
  // First line of `<path> --version`, or null if it fails.
  readVersion: (path: string) => Promise<string | null>
  // Whether a macOS keychain item exists. Reads its name only, never its secret.
  hasKeychainItem: (service: string) => Promise<boolean>
}

type TToolSpec = {
  id: TAiToolId
  name: string
  command: string
  hasCredentials: (machine: TAiToolsMachine) => Promise<boolean>
}

const TOOLS: TToolSpec[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    command: 'claude',
    hasCredentials: async (machine) =>
      Boolean(machine.env.ANTHROPIC_API_KEY) ||
      Boolean(machine.env.CLAUDE_CODE_OAUTH_TOKEN) ||
      (machine.platform === 'darwin' &&
        (await machine.hasKeychainItem('Claude Code-credentials'))) ||
      (await machine.fileExists(
        join(machine.homeDir, '.claude', '.credentials.json')
      ))
  },
  {
    id: 'codex',
    name: 'Codex',
    command: 'codex',
    hasCredentials: async (machine) =>
      Boolean(machine.env.OPENAI_API_KEY) ||
      (await machine.fileExists(
        join(
          machine.env.CODEX_HOME ?? join(machine.homeDir, '.codex'),
          'auth.json'
        )
      ))
  }
]

/**
 * Folders to look in. An app opened from the Dock gets a short PATH without
 * Homebrew or ~/.local/bin, so the usual install places are added.
 */
export const searchFolders = (machine: TAiToolsMachine) => {
  const home = machine.homeDir
  const fromPath = (machine.env.PATH ?? '').split(delimiter).filter(Boolean)
  const usual =
    machine.platform === 'win32'
      ? [join(machine.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'npm')]
      : [
          join(home, '.local', 'bin'),
          join(home, '.claude', 'local'),
          join(home, '.bun', 'bin'),
          join(home, '.npm-global', 'bin'),
          join(home, '.volta', 'bin'),
          '/opt/homebrew/bin',
          '/usr/local/bin'
        ]
  return [...new Set([...fromPath, ...usual])]
}

const findCommand = async (machine: TAiToolsMachine, command: string) => {
  const names =
    machine.platform === 'win32'
      ? [`${command}.exe`, `${command}.cmd`]
      : [command]
  for (const folder of searchFolders(machine)) {
    for (const name of names) {
      const path = join(folder, name)
      if (await machine.isExecutable(path)) return path
    }
  }
  return null
}

const detectTool = async (
  machine: TAiToolsMachine,
  tool: TToolSpec
): Promise<TAiToolStatus> => {
  const path = await findCommand(machine, tool.command)
  if (!path) return { id: tool.id, name: tool.name, state: 'not-installed' }

  const [version, hasCredentials] = await Promise.all([
    machine.readVersion(path),
    tool.hasCredentials(machine)
  ])
  return {
    id: tool.id,
    name: tool.name,
    state: hasCredentials ? 'ready' : 'needs-sign-in',
    version
  }
}

/** Whether Claude Code and Codex are installed and signed in. Never runs a paid request. */
export const detectAiTools = async (
  machine: TAiToolsMachine
): Promise<TAiToolsStatus> => ({
  tools: await Promise.all(TOOLS.map((tool) => detectTool(machine, tool)))
})

const run = (file: string, args: string[]) =>
  new Promise<string | null>((resolve) => {
    execFile(file, args, { timeout: 5000 }, (error, stdout) =>
      resolve(error ? null : stdout)
    )
  })

/** The real machine. */
export const localMachine = (): TAiToolsMachine => ({
  platform: process.platform,
  homeDir: homedir(),
  env: process.env,
  isExecutable: (path) =>
    access(path, constants.X_OK).then(
      () => true,
      () => false
    ),
  fileExists: (path) =>
    access(path).then(
      () => true,
      () => false
    ),
  readVersion: async (path) =>
    (await run(path, ['--version']))?.trim().split('\n')[0] || null,
  hasKeychainItem: async (service) =>
    (await run('/usr/bin/security', [
      'find-generic-password',
      '-s',
      service
    ])) !== null
})
