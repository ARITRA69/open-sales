import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

type TEncryption = {
  isEncryptionAvailable: () => boolean
  encryptString: (plain: string) => Buffer
  decryptString: (encrypted: Buffer) => string
}

/**
 * Remembers the server address and the session token between launches. The
 * token is encrypted with the OS keychain (Electron's safeStorage). Where no
 * keychain is available, it's kept in memory only, so the person signs in
 * again next launch rather than leaving a readable token on disk.
 */
export const createConnectionStore = (dir: string, encryption: TEncryption) => {
  const serverFile = join(dir, 'server.json')
  const tokenFile = join(dir, 'session-token.bin')
  let memoryToken: string | null = null

  const readServerUrl = async (): Promise<string | null> => {
    try {
      const saved = JSON.parse(await readFile(serverFile, 'utf8'))
      return typeof saved.serverUrl === 'string' ? saved.serverUrl : null
    } catch {
      return null
    }
  }

  const saveServerUrl = async (serverUrl: string) => {
    await mkdir(dir, { recursive: true })
    await writeFile(serverFile, JSON.stringify({ serverUrl }))
  }

  const readToken = async (): Promise<string | null> => {
    if (!encryption.isEncryptionAvailable()) return memoryToken
    try {
      return encryption.decryptString(await readFile(tokenFile))
    } catch {
      return null
    }
  }

  const saveToken = async (token: string) => {
    if (!encryption.isEncryptionAvailable()) {
      memoryToken = token
      return
    }
    await mkdir(dir, { recursive: true })
    await writeFile(tokenFile, encryption.encryptString(token))
  }

  const clearToken = async () => {
    memoryToken = null
    await rm(tokenFile, { force: true })
  }

  const clearAll = async () => {
    await clearToken()
    await rm(serverFile, { force: true })
  }

  return {
    readServerUrl,
    saveServerUrl,
    readToken,
    saveToken,
    clearToken,
    clearAll
  }
}

export type TConnectionStore = ReturnType<typeof createConnectionStore>
