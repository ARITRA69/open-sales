import { randomBytes } from 'node:crypto'

/**
 * A UUIDv7: 48 bits of milliseconds, then random bits. Ids sort by when they
 * were made, so new rows land at the end of an index. Written out rather
 * than `Bun.randomUUIDv7()`, because the tests run under Node.
 */
export const newId = (now = Date.now()): string => {
  const bytes = randomBytes(16)
  bytes.writeUIntBE(now, 0, 6)
  bytes[6] = 0x70 | (bytes[6] & 0x0f) // version 7
  bytes[8] = 0x80 | (bytes[8] & 0x3f) // RFC 9562 variant
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
