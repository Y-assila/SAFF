import { describe, expect, it } from 'vitest'
import { safeReturnPath } from './returnPath'

describe('safeReturnPath', () => {
  it('keeps barber paths', () => {
    expect(safeReturnPath('/barber/3f2a-11')).toBe('/barber/3f2a-11')
    expect(safeReturnPath('/barber/3f2a/settings')).toBe('/barber/3f2a/settings')
  })
  it('rejects anything that could redirect elsewhere', () => {
    for (const bad of ['https://evil.example', '//evil.example', '/barber/../t', '/t', '/barber/login', '/barber?x=1', 42, null]) {
      expect(safeReturnPath(bad)).toBe('/barber')
    }
  })
})
