/*
 * `bun run dev:server`: the server in development, in one command. Starts
 * Docker if it isn't running, starts the database container, makes .env from
 * .env.example the first time, then runs the server with hot reload.
 */
import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { styleText } from 'node:util'

const SERVER_DIR = resolve(import.meta.dirname, '..')
const REPO_DIR = resolve(SERVER_DIR, '../..')
const DOCKER_WAIT_MS = 120_000

// The product name, so a rebranded copy says its own name here too.
const { productName } = JSON.parse(
  readFileSync(resolve(REPO_DIR, 'apps/desktop/brand.config.json'), 'utf8')
) as { productName: string }

// styleText leaves out colours when the output isn't a terminal.
const show = {
  title: (part: string) =>
    console.log(
      `\n  ${styleText(['bold', 'cyan'], '◆')} ${styleText('bold', productName)} ${styleText('dim', `· ${part}`)}\n`
    ),
  done: (label: string, detail = '') =>
    console.log(
      `  ${styleText('green', '✓')} ${label.padEnd(11)}${styleText('dim', detail)}`
    ),
  step: (label: string) =>
    console.log(`  ${styleText('cyan', '›')} ${styleText('dim', label)}`),
  note: (text: string) => console.log(`\n  ${styleText('dim', text)}\n`)
}

const fail = (message: string): never => {
  console.error(`  ${styleText('red', '✗')} ${message}`)
  process.exit(1)
}

/** Runs a command from the repo root. True if it worked. */
const run = (command: string, args: string[]) =>
  spawnSync(command, args, { cwd: REPO_DIR, stdio: 'inherit' }).status === 0

const isDockerUp = () =>
  spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0

const wakeDocker = async () => {
  if (isDockerUp()) return show.done('Docker', 'running')
  if (process.platform !== 'darwin') {
    fail('Docker isn’t running. Start it, then run this again.')
  }

  show.step('Starting Docker…')
  // Docker Desktop, else OrbStack. -g keeps it in the background.
  const opened = ['Docker', 'OrbStack'].some(
    (app) => spawnSync('open', ['-g', '-a', app]).status === 0
  )
  if (!opened) {
    fail('Install Docker Desktop or OrbStack, then run this again.')
  }

  const deadline = Date.now() + DOCKER_WAIT_MS
  while (!isDockerUp()) {
    if (Date.now() > deadline) fail('Docker didn’t start within two minutes.')
    await Bun.sleep(1000)
  }
  show.done('Docker', 'started')
}

show.title('server')
await wakeDocker()

// The server's own container would hold port 8787.
const runningServer = spawnSync(
  'docker',
  ['compose', 'ps', '--quiet', '--status', 'running', 'server'],
  { cwd: REPO_DIR, encoding: 'utf8' }
)
if (runningServer.stdout.trim()) {
  show.step('Stopping the server container, which uses port 8787…')
  run('docker', ['compose', '--progress', 'quiet', 'stop', 'server'])
}

// --wait returns once Postgres answers its health check. Quiet hides
// Docker's progress lines; its errors still show.
if (
  !run('docker', [
    'compose',
    '--progress',
    'quiet',
    'up',
    '--detach',
    '--wait',
    'db'
  ])
) {
  fail('The database didn’t start. See Docker’s message above.')
}
const dbAddress = spawnSync('docker', ['compose', 'port', 'db', '5432'], {
  cwd: REPO_DIR,
  encoding: 'utf8'
}).stdout.trim()
show.done('Database', dbAddress.replace('127.0.0.1', 'localhost'))

const envFile = resolve(SERVER_DIR, '.env')
if (existsSync(envFile)) {
  show.done('Settings', 'apps/server/.env')
} else {
  copyFileSync(resolve(SERVER_DIR, '.env.example'), envFile)
  show.done('Settings', 'made apps/server/.env from .env.example')
}

const server = spawn('bun', ['--watch', '--no-clear-screen', 'src/index.ts'], {
  cwd: SERVER_DIR,
  stdio: ['inherit', 'pipe', 'pipe']
})

// Tidies the lines src/index.ts prints at start; anything else, such as
// errors, shows as it is.
let hasStarted = false
const tidy = (line: string) => {
  if (line === 'Database is up to date.') {
    if (!hasStarted) show.done('Migrations', 'up to date')
    return
  }
  const listening = line.match(/^Server listening on (\S+?)\/?$/)
  if (!listening) return console.log(line)
  if (hasStarted) {
    show.done('Reloaded', new Date().toLocaleTimeString())
    return
  }
  hasStarted = true
  show.done('API', `${listening[1]}/api/v1`)
  show.note(
    'Saving a file reloads the server. Ctrl+C stops it; the database keeps running.'
  )
}
createInterface({ input: server.stdout }).on('line', tidy)
createInterface({ input: server.stderr }).on('line', (line) =>
  console.error(line)
)

server.on('exit', (code) => process.exit(code ?? 0))
// Ctrl+C reaches the server too; wait for it to stop rather than leaving it.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.kill(signal))
}
