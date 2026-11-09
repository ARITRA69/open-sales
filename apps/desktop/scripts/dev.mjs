/*
 * Starts the app in development. A Mac takes the bold name in the menu bar from
 * the app bundle, so it would say Electron. On a Mac this runs a renamed copy of
 * Electron from node_modules/.dev-app and leaves the installed one untouched. A
 * packaged build gets its name from productName and doesn't need any of this.
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
// Workspace installs may hoist packages to the repo root, so ask Node where
// they are rather than assuming this app's own node_modules.
const require = createRequire(resolve(ROOT, 'package.json'))
const packageDir = (name) => dirname(require.resolve(`${name}/package.json`))
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

const { productName } = readJson(resolve(ROOT, 'package.json'))
const ELECTRON_DIR = packageDir('electron')
const { version: electronVersion } = readJson(
  resolve(ELECTRON_DIR, 'package.json')
)
const DEV_APP_ID = 'io.github.aritra69.open-sales.dev'

const prepareNamedMacApp = () => {
  const appDir = resolve(ROOT, 'node_modules/.dev-app', electronVersion)
  const namedApp = resolve(appDir, `${productName}.app`)

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
    // Note: editing the plist breaks the copy's signature, so sign it again.
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', partApp], {
      stdio: 'ignore'
    })
    // Named last, so an interrupted copy is never picked up as finished.
    renameSync(partApp, namedApp)
  }

  return resolve(namedApp, 'Contents/MacOS/Electron')
}

const env = { ...process.env }

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
  { cwd: ROOT, env, stdio: 'inherit' }
)

electronVite.on('exit', (code) => process.exit(code ?? 0))
