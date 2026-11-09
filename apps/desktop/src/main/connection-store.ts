import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Someone who joined and waits for approval: their ticket and email. */
export type TJoinTicket = { ticket: string; email: string }

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
  // A join request waiting for approval. The ticket only reveals whether
  // they've been let in, so it isn't encrypted.
  const joinFile = join(dir, 'join-request.json')
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
    await clearJoinTicket()
  }

  const readJoinTicket = async (): Promise<TJoinTicket | null> => {
    try {
      const saved = JSON.parse(await readFile(joinFile, 'utf8'))
      return typeof saved.ticket === 'string' && typeof saved.email === 'string'
        ? { ticket: saved.ticket, email: saved.email }
        : null
    } catch {
      return null
    }
  }

  const saveJoinTicket = async (joinTicket: TJoinTicket) => {
    await mkdir(dir, { recursive: true })
    await writeFile(joinFile, JSON.stringify(joinTicket))
  }

  const clearJoinTicket = async () => {
    await rm(joinFile, { force: true })
  }

  return {
    readServerUrl,
    saveServerUrl,
    readToken,
    saveToken,
    clearToken,
    clearAll,
    readJoinTicket,
    saveJoinTicket,
    clearJoinTicket
  }
}

export type TConnectionStore = ReturnType<typeof createConnectionStore>
