import { describe, expect, it } from 'vitest'
import { qrBase, qrMatrix, qrPath, qrSvgFile, shopJoinUrl } from './qr'

describe('shop QR codes', () => {
  it('encodes the permanent /s/<slug> address (D-02)', () => {
    expect(shopJoinUrl('https://saff.ma/', 'salon-amine')).toBe('https://saff.ma/s/salon-amine')
  })

  it('is printable only for a public https origin (D-04)', () => {
    expect(qrBase('https://saff.ma', 'http://x')).toEqual({ base: 'https://saff.ma', printable: true })
    for (const notPrintable of ['http://saff.ma', 'https://localhost:5173', 'https://127.0.0.1', 'https://saff.local',
      'https://saff.ma/app', 'https://saff.ma/?x=1', 'not a url', '', undefined]) {
      expect(qrBase(notPrintable, 'http://localhost:5173').printable).toBe(false)
    }
    expect(qrBase(undefined, 'http://localhost:5173').base).toBe('http://localhost:5173')
  })

  it('produces a valid square QR matrix and deterministic SVG', () => {
    const m = qrMatrix('https://saff.ma/s/salon-amine')
    expect(m.length).toBeGreaterThanOrEqual(21)
    expect(m.every((row) => row.length === m.length)).toBe(true)
    // Finder pattern: top-left 7x7 has a dark border.
    expect(m[0].slice(0, 7).every(Boolean) && m[6].slice(0, 7).every(Boolean)).toBe(true)
    expect(qrPath(m)).toMatch(/^M4 4h1v1h-1z/)
    const svg = qrSvgFile('https://saff.ma/s/salon-amine')
    expect(svg).toContain('fill="#FFFFFF"')
    expect(svg).toBe(qrSvgFile('https://saff.ma/s/salon-amine'))
  })
})
