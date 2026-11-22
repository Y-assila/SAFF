import { describe, expect, it } from 'vitest'
import { passwordProblem, temporaryPassword } from './password'

describe('temporaryPassword', () => {
  it('is 4 groups of 4 unambiguous characters', () => {
    for (let i = 0; i < 200; i++) {
      const p = temporaryPassword()
      expect(p).toMatch(/^[A-HJ-NP-Za-km-z2-9]{4}(-[A-HJ-NP-Za-km-z2-9]{4}){3}$/)
      expect(p).not.toMatch(/[01OIl]/)
    }
  })
  it('is different every time', () => {
    expect(new Set(Array.from({ length: 100 }, temporaryPassword)).size).toBe(100)
  })
  it('satisfies the rules for chosen passwords', () => {
    expect(passwordProblem(temporaryPassword())).toBeNull()
  })
})

describe('passwordProblem', () => {
  it('requires 10 to 72 bytes', () => {
    expect(passwordProblem('short')).toBe('too_short')
    expect(passwordProblem(undefined)).toBe('too_short')
    expect(passwordProblem('a'.repeat(10))).toBeNull()
    expect(passwordProblem('a'.repeat(73))).toBe('too_long')
    expect(passwordProblem('é'.repeat(37))).toBe('too_long') // 74 bytes
  })
})
