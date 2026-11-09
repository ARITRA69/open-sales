import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const readJson = (file: string) =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, '../..', file), 'utf8'))

describe('brand.config.json', () => {
  const brand = readJson('brand.config.json')

  // Packagers read productName from package.json, so the two must agree.
  it('matches productName in package.json', () => {
    expect(readJson('package.json').productName).toBe(brand.productName)
  })

  // Mac bundle ids and Windows app ids are reverse domain names.
  it('has a reverse-domain app id', () => {
    expect(brand.appId).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i)
  })
})
