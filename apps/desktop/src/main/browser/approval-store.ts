import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { TApprovalStore } from './approvals'

type TEncryption = {
  isEncryptionAvailable: () => boolean
  encryptString: (plain: string) => Buffer
  decryptString: (encrypted: Buffer) => string
}

/**
 * Keeps the sites the person said AI may always use, in userData. The list is
 * signed with a key held in the OS keychain (Electron's safeStorage): an AI
 * tool has a shell on this machine, and must not be able to approve a site
 * for itself by editing a file. A list that doesn't match its signature is
 * treated as empty. Where there's no keychain nothing is written, so "always"
 * lasts until the app quits.
 */
export const createApprovalStore = (
  dir: string,
  encryption: TEncryption
): TApprovalStore => {
  const sitesFile = join(dir, 'browser-sites.json')
  const keyFile = join(dir, 'browser-sites.key')

  const readKey = async (): Promise<Buffer | null> => {
    try {
      return Buffer.from(
        encryption.decryptString(await readFile(keyFile)),
        'hex'
      )
    } catch {
      return null
    }
  }

  const makeKey = async () => {
    const key = randomBytes(32)
    await mkdir(dir, { recursive: true })
    await writeFile(keyFile, encryption.encryptString(key.toString('hex')), {
      mode: 0o600
    })
    return key
  }

  const sign = (key: Buffer, sites: string[]) =>
    createHmac('sha256', key).update(JSON.stringify(sites)).digest()

  return {
    canRemember: () => encryption.isEncryptionAvailable(),

    load: async () => {
      if (!encryption.isEncryptionAvailable()) return []
      try {
        const key = await readKey()
        if (!key) return []
        const saved = JSON.parse(await readFile(sitesFile, 'utf8')) as {
          sites?: unknown
          signature?: unknown
        }
        if (
          !Array.isArray(saved.sites) ||
          !saved.sites.every((site) => typeof site === 'string') ||
          typeof saved.signature !== 'string'
        ) {
          return []
        }
        const expected = sign(key, saved.sites)
        const given = Buffer.from(saved.signature, 'hex')
        return given.length === expected.length &&
          timingSafeEqual(given, expected)
          ? saved.sites
          : []
      } catch {
        return []
      }
    },

    save: async (sites) => {
      if (!encryption.isEncryptionAvailable()) return
      const key = (await readKey()) ?? (await makeKey())
      await mkdir(dir, { recursive: true })
      await writeFile(
        sitesFile,
        JSON.stringify({ sites, signature: sign(key, sites).toString('hex') }),
        { mode: 0o600 }
      )
    }
  }
}
