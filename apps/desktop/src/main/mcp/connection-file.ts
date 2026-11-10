import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/*
 * Where this launch's MCP address and secret are left for the relay. A
 * person connects their AI tool once, with a command that starts the relay
 * (`stdio-relay.mjs`); the relay reads this file each time, so the
 * connection keeps working though the address and secret change at every
 * launch. Only the person's own account can read the file, which is the
 * same trust as the AI tool's own settings.
 */

export type TMcpConnection = { url: string; token: string }

export const writeConnectionFile = async (
  path: string,
  connection: TMcpConnection
) => {
  await mkdir(dirname(path), { recursive: true })
  // Removed first: writing over an old file would keep its old permissions.
  await rm(path, { force: true })
  await writeFile(path, JSON.stringify(connection), { mode: 0o600 })
}

export const removeConnectionFile = (path: string) => rm(path, { force: true })

const quote = (value: string, platform: NodeJS.Platform) =>
  platform === 'win32'
    ? `"${value.replace(/"/g, '\\"')}"`
    : `'${value.replace(/'/g, `'\\''`)}'`

type TRelayCommandOptions = {
  serverName: string
  // The app's own program, which also runs the relay.
  appPath: string
  relayPath: string
  connectionPath: string
  productName: string
  platform: NodeJS.Platform
}

/**
 * The command a person runs once to connect each AI tool. The relay runs on
 * the app's own program (`ELECTRON_RUN_AS_NODE`), so nothing else has to be
 * installed.
 */
export const relayCommands = ({
  serverName,
  appPath,
  relayPath,
  connectionPath,
  productName,
  platform
}: TRelayCommandOptions) => {
  const relay = [appPath, relayPath, connectionPath, productName]
    .map((part) => quote(part, platform))
    .join(' ')
  return {
    'claude-code': `claude mcp add --scope user ${serverName} -e ELECTRON_RUN_AS_NODE=1 -- ${relay}`,
    codex: `codex mcp add ${serverName} --env ELECTRON_RUN_AS_NODE=1 -- ${relay}`
  }
}
