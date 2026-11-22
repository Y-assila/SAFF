import { describe, expect, it } from 'vitest'
import { SLUG_PATTERN, slugify } from './api'

describe('slugify', () => {
  it('builds a valid shop link from a name', () => {
    expect(slugify('Salon Atlas')).toBe('salon-atlas')
    expect(slugify('  Coiffure Élégance — Maârif ')).toBe('coiffure-elegance-maarif')
    expect(slugify('Barber 2000!!')).toBe('barber-2000')
  })
  it('returns something the database accepts, or empty (Arabic-only names need a typed link)', () => {
    for (const name of ['Salon Atlas', 'A--B', 'x'.repeat(80) + ' y']) {
      expect(slugify(name)).toMatch(SLUG_PATTERN)
    }
    expect(slugify('صالون الأطلس')).toBe('')
  })
})
