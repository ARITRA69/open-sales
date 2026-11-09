/*
 * Draws the greyscale app icon into build/: icon.png and icon.icns for the
 * Mac dock, icon.ico for the Windows taskbar. Run it with:
 *   bunx electron scripts/make-app-icon.mjs
 * It only needs running again if the icon changes, and iconutil needs a Mac.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { app, BrowserWindow, nativeImage } from 'electron'

const CANVAS = 1024
const BUILD_DIR = resolve(import.meta.dirname, '../build')
const LOGO_WIDTH = 100
const LOGO_HEIGHT = 100

// The mark: an open ring with an arrow leaving through the gap, in greys
// dark enough to hold up at taskbar sizes.
const LOGO = `
  <g fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="11">
    <path stroke="#4d4d4d" d="M74 56A30 30 0 1 1 44 26" />
    <path stroke="#363636" d="M50 50L82 18M62 18H82V38" />
  </g>
`

const buildIconSvg = ({ tileInset, tileRadius, logoHeight, hasShadow }) => {
  const tileSize = CANVAS - tileInset * 2
  const scale = logoHeight / LOGO_HEIGHT
  const logoX = (CANVAS - LOGO_WIDTH * scale) / 2
  const logoY = (CANVAS - logoHeight) / 2

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
      <defs>
        <linearGradient id="tile" x1="0" x2="0" y1="0" y2="1">
          <stop stop-color="#ffffff" /><stop offset="1" stop-color="#ebebeb" />
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#000000" flood-opacity="0.28" />
        </filter>
      </defs>
      <rect x="${tileInset}" y="${tileInset}" width="${tileSize}" height="${tileSize}" rx="${tileRadius}"
        fill="url(#tile)" ${hasShadow ? 'filter="url(#shadow)"' : ''} />
      <g transform="translate(${logoX} ${logoY}) scale(${scale})">${LOGO}</g>
    </svg>`
}

// The Mac leaves the standard margin round the tile. Windows fills the square.
const MAC_ICON = {
  tileInset: 100,
  tileRadius: 185,
  logoHeight: 470,
  hasShadow: true
}
const WINDOWS_ICON = {
  tileInset: 0,
  tileRadius: 180,
  logoHeight: 620,
  hasShadow: false
}

const renderSvg = async (svg) => {
  const window = new BrowserWindow({
    width: CANVAS,
    height: CANVAS,
    show: false,
    frame: false,
    transparent: true,
    enableLargerThanScreen: true,
    webPreferences: { offscreen: true }
  })
  let latestFrame

  window.webContents.on('paint', (_event, _dirty, frame) => {
    latestFrame = frame
  })

  const page = `<!doctype html><body style="margin:0;background:transparent">${svg}</body>`
  await window.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(page)}`
  )
  await new Promise((done) => setTimeout(done, 500))
  window.destroy()

  return nativeImage.createFromBuffer(latestFrame.toPNG())
}

const pngAt = (image, size) =>
  image.resize({ width: size, height: size, quality: 'best' }).toPNG()

const writeIcns = (image) => {
  const workDir = mkdtempSync(join(tmpdir(), 'app-icon-'))
  const iconset = join(workDir, 'icon.iconset')

  mkdirSync(iconset)
  for (const size of [16, 32, 128, 256, 512]) {
    writeFileSync(join(iconset, `icon_${size}x${size}.png`), pngAt(image, size))
    writeFileSync(
      join(iconset, `icon_${size}x${size}@2x.png`),
      pngAt(image, size * 2)
    )
  }
  execFileSync('iconutil', [
    '-c',
    'icns',
    iconset,
    '-o',
    join(BUILD_DIR, 'icon.icns')
  ])
  rmSync(workDir, { recursive: true })
}

// An .ico is a small directory followed by one PNG per size.
const writeIco = (image) => {
  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const pngs = sizes.map((size) => pngAt(image, size))
  const header = Buffer.alloc(6 + sizes.length * 16)
  let imageOffset = header.length

  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(sizes.length, 4)
  sizes.forEach((size, index) => {
    const entry = 6 + index * 16

    // Note: an .ico stores 256 as 0, because the field is one byte.
    header.writeUInt8(size === 256 ? 0 : size, entry)
    header.writeUInt8(size === 256 ? 0 : size, entry + 1)
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(pngs[index].length, entry + 8)
    header.writeUInt32LE(imageOffset, entry + 12)
    imageOffset += pngs[index].length
  })

  writeFileSync(join(BUILD_DIR, 'icon.ico'), Buffer.concat([header, ...pngs]))
}

app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.disableHardwareAcceleration()
// Note: each render closes its window, which would otherwise quit the app.
app.on('window-all-closed', () => {})

void app.whenReady().then(async () => {
  mkdirSync(BUILD_DIR, { recursive: true })

  const macImage = await renderSvg(buildIconSvg(MAC_ICON))
  const windowsImage = await renderSvg(buildIconSvg(WINDOWS_ICON))

  writeFileSync(join(BUILD_DIR, 'icon.png'), pngAt(macImage, CANVAS))
  writeFileSync(join(BUILD_DIR, 'icon-windows.png'), pngAt(windowsImage, 256))
  writeIcns(macImage)
  writeIco(windowsImage)

  app.quit()
})
