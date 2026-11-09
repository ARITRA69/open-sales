/*
 * Starts the app in development. A Mac takes the bold name in the menu bar from
 * the app bundle, so it would say Electron. On a Mac this runs a renamed copy of
 * Electron from node_modules/.dev-app and leaves the installed one untouched. A
 * packaged build gets its name from the brand config and doesn't need any of
 * this.
 */
import { execFileSync, spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { styleText } from 'node:util'

const ROOT = resolve(import.meta.dirname, '..')
// Workspace installs may hoist packages to the repo root, so ask Node where
// they are rather than assuming this app's own node_modules.
const require = createRequire(resolve(ROOT, 'package.json'))
const packageDir = (name) => dirname(require.resolve(`${name}/package.json`))
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

// The name and id come from the brand config, so a rebranded app runs as itself.
const { productName, appId, urlScheme } = readJson(
  resolve(ROOT, 'brand.config.json')
)
const ELECTRON_DIR = packageDir('electron')
const { version: electronVersion } = readJson(
  resolve(ELECTRON_DIR, 'package.json')
)
const DEV_APP_ID = `${appId}.dev`

const prepareNamedMacApp = () => {
  const appDir = resolve(ROOT, 'node_modules/.dev-app', electronVersion)
  const namedApp = resolve(appDir, `${productName}.app`)
  const namedPlist = resolve(namedApp, 'Contents/Info.plist')

  // Copies made before join links existed don't declare the link scheme.
  if (
    existsSync(namedApp) &&
    !readFileSync(namedPlist, 'utf8').includes(`<string>${urlScheme}</string>`)
  ) {
    rmSync(namedApp, { recursive: true, force: true })
  }

  if (!existsSync(namedApp)) {
    const partApp = resolve(appDir, `part-${process.pid}.app`)
    const infoPlist = resolve(partApp, 'Contents/Info.plist')
    const setPlistValue = (key, value) =>
      execFileSync('plutil', ['-replace', key, '-string', value, infoPlist])

    mkdirSync(appDir, { recursive: true })
    execFileSync('cp', [
      '-cR',
      resolve(ELECTRON_DIR, 'dist/Electron.app'),
      partApp
    ])
    setPlistValue('CFBundleName', productName)
    setPlistValue('CFBundleDisplayName', productName)
    setPlistValue('CFBundleIdentifier', DEV_APP_ID)
    // macOS only opens links for schemes an app declares here.
    execFileSync('plutil', [
      '-replace',
      'CFBundleURLTypes',
      '-json',
      JSON.stringify([
        { CFBundleURLName: DEV_APP_ID, CFBundleURLSchemes: [urlScheme] }
      ]),
      infoPlist
    ])
    // Note: editing the plist breaks the copy's signature, so sign it again.
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', partApp], {
      stdio: 'ignore'
    })
    // Named last, so an interrupted copy is never picked up as finished.
    renameSync(partApp, namedApp)
  }

  return resolve(namedApp, 'Contents/MacOS/Electron')
}

// styleText leaves out colours when the output isn't a terminal.
const show = {
  title: (part) =>
    console.log(
      `\n  ${styleText(['bold', 'cyan'], '◆')} ${styleText('bold', productName)} ${styleText('dim', `· ${part}`)}\n`
    ),
  done: (label, detail = '') =>
    console.log(
      `  ${styleText('green', '✓')} ${label.padEnd(11)}${styleText('dim', detail)}`
    ),
  step: (label) =>
    console.log(`  ${styleText('cyan', '›')} ${styleText('dim', label)}`),
  dim: (text) => console.log(styleText('dim', text))
}

// electron-vite's build report, which says nothing a developer acts on.
const QUIET_LINES = [
  /^$/,
  /^-+$/,
  /^vite v[\d.]+ building/,
  /^(transforming|rendering chunks|computing gzip size)\.\.\./,
  /^✓ \d+ modules? transformed/,
  /^✓ built in/,
  /^out\//,
  /^dev server running for the electron renderer/,
  /➜\s+Network:/,
  // macOS noise when the window is dragged by its title bar.
  /Warning: Window move completed without beginning/
]

const ANSI_CODES = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')

/** Shortens electron-vite's lines; anything else, such as errors, shows as it is. */
const tidy = (rawLine) => {
  const line = rawLine.replace(ANSI_CODES, '').trimEnd()
  if (QUIET_LINES.some((pattern) => pattern.test(line))) return
  if (line.includes('electron main process built successfully')) {
    return show.done('Main', 'built')
  }
  if (line.includes('electron preload scripts built successfully')) {
    return show.done('Preload', 'built')
  }
  const local = line.match(/➜\s+Local:\s+(\S+)/)
  if (local) {
    return show.done('Screens', `${local[1]}  (in a browser: ?preview=sign-in)`)
  }
  if (line.includes('starting electron app')) {
    show.done('App', `opening ${productName}`)
    return console.log(
      `\n  ${styleText('dim', 'Screens reload on save. Main and preload changes need a restart. Ctrl+C stops it.')}\n`
    )
  }
  // Electron's deprecation notices and Vite's reloads: worth seeing, not loud.
  if (/^\(electron\)|\[vite\]/.test(line)) return show.dim(rawLine)
  console.log(rawLine)
}

const env = { ...process.env }

show.title('desktop app')

if (process.platform === 'darwin') {
  env.ELECTRON_EXEC_PATH = prepareNamedMacApp()
}

const electronVite = spawn(
  process.execPath,
  [
    resolve(packageDir('electron-vite'), 'bin/electron-vite.js'),
    'dev',
    ...process.argv.slice(2)
  ],
  // Vite's keyboard shortcuts read stdin, so that stays the terminal's.
  { cwd: ROOT, env, stdio: ['inherit', 'pipe', 'pipe'] }
)

createInterface({ input: electronVite.stdout }).on('line', tidy)
createInterface({ input: electronVite.stderr }).on('line', tidy)

electronVite.on('exit', (code) => process.exit(code ?? 0))
// Ctrl+C reaches electron-vite too; wait for it to close the app.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => electronVite.kill(signal))
}
