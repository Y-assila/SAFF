import { describe, expect, it } from 'vitest'
import { safeReturnPath } from './returnPath'

describe('safeReturnPath', () => {
  it('keeps barber paths', () => {
    expect(safeReturnPath('/barber/3f2a-11')).toBe('/barber/3f2a-11')
    expect(safeReturnPath('/barber/3f2a/settings')).toBe('/barber/3f2a/settings')
  })
  it('rejects anything that could redirect elsewhere', () => {
    for (const bad of ['https://evil.example', '//evil.example', '/barber/../t', '/t', '/barber/login', '/barber?x=1', '/admin', 42, null]) {
      expect(safeReturnPath(bad)).toBe('/barber')
    }
  })
  it('keeps admin paths only for the admin area', () => {
    expect(safeReturnPath('/admin/shops/3f2a', 'admin')).toBe('/admin/shops/3f2a')
    for (const bad of ['/barber', '/admin/login', '//evil.example', '/admin/../t']) {
      expect(safeReturnPath(bad, 'admin')).toBe('/admin')
    }
  })
})
