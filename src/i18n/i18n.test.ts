import { afterEach, describe, expect, it } from 'vitest'
import i18n, { applyDocumentLocale, changeLocale, resources } from '.'
import { DEFAULT_LOCALE, STORAGE_KEY, directionOf } from './config'
import { detectLocale, matchLocale } from './detect'

function flatKeys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null ? flatKeys(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  )
}

function flatValues(obj: object): string[] {
  return Object.values(obj).flatMap((value) =>
    typeof value === 'object' && value !== null ? flatValues(value) : [String(value)],
  )
}

afterEach(async () => {
  window.localStorage.clear()
  await i18n.changeLanguage('en')
})

describe('translations', () => {
  const enKeys = flatKeys(resources.en.translation).sort()

  it.each(['fr', 'ar'] as const)('%s has exactly the same keys as en', (locale) => {
    expect(flatKeys(resources[locale].translation).sort()).toEqual(enKeys)
  })

  it.each(['en', 'fr', 'ar'] as const)('%s has no empty strings', (locale) => {
    for (const value of flatValues(resources[locale].translation)) expect(value.trim()).not.toBe('')
  })

  it('uses the approved Arabic tagline', () => {
    const { taglineLead, taglineTail } = resources.ar.translation.common
    expect(`${taglineLead} ${taglineTail}`).toBe('دورك، في الوقت المناسب لك.')
  })
})

describe('direction', () => {
  it('maps Arabic to RTL and French/English to LTR', () => {
    expect(directionOf('ar')).toBe('rtl')
    expect(directionOf('fr')).toBe('ltr')
    expect(directionOf('en')).toBe('ltr')
  })

  it('sets lang and dir on the document element', () => {
    applyDocumentLocale('ar')
    expect(document.documentElement).toHaveAttribute('lang', 'ar')
    expect(document.documentElement).toHaveAttribute('dir', 'rtl')
    applyDocumentLocale('fr')
    expect(document.documentElement).toHaveAttribute('dir', 'ltr')
  })

  it('updates the document and persists the choice on language change', async () => {
    await changeLocale('ar')
    expect(document.documentElement.dir).toBe('rtl')
    expect(document.documentElement.lang).toBe('ar')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('ar')
    await changeLocale('en')
    expect(document.documentElement.dir).toBe('ltr')
  })
})

describe('locale detection', () => {
  it('matches regional tags to supported locales', () => {
    expect(matchLocale('ar-MA')).toBe('ar')
    expect(matchLocale('fr_FR')).toBe('fr')
    expect(matchLocale('EN-gb')).toBe('en')
    expect(matchLocale('de-DE')).toBeNull()
    expect(matchLocale(undefined)).toBeNull()
  })

  it('prefers a stored choice, then browser languages, then the default', () => {
    expect(detectLocale(['de', 'ar-MA', 'fr'])).toBe('ar')
    expect(detectLocale(['de', 'es'])).toBe(DEFAULT_LOCALE)
    window.localStorage.setItem(STORAGE_KEY, 'en')
    expect(detectLocale(['ar-MA'])).toBe('en')
  })

  it('ignores an invalid stored value', () => {
    window.localStorage.setItem(STORAGE_KEY, 'xx')
    expect(detectLocale(['fr-MA'])).toBe('fr')
  })
})
