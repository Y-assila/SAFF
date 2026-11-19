import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guards the brand rule "preserve the logo exactly": every logo file served by the app must be
 * byte-identical to the approved brand kit.
 */
const root = process.cwd() // vitest runs from the project root
const kit = resolve(root, 'SAFF_Exact_Logo_Brand_Kit_v1.2')

const pairs: Array<[served: string, source: string]> = [
  ['public/brand/saff-primary.svg', 'logos/saff-primary.svg'],
  ['public/brand/saff-symbol.svg', 'logos/saff-symbol.svg'],
  ['public/brand/saff-symbol-monochrome.svg', 'logos/saff-symbol-monochrome.svg'],
  ['public/brand/saff-primary-transparent.png', 'logos/saff-primary-transparent.png'],
  ['public/brand/saff-symbol-transparent.png', 'logos/saff-symbol-transparent.png'],
  ['public/brand/saff-app-icon-512.png', 'app-icons/saff-app-icon-512.png'],
]

const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')

describe('brand assets', () => {
  it.each(pairs)('%s is byte-identical to the brand kit', (served, source) => {
    expect(sha256(resolve(root, served))).toBe(sha256(resolve(kit, source)))
  })
})
