import { describe, expect, it } from 'vitest'
import { aiProviderStrings } from '../src/renderer/src/ai-provider-strings'
import { strings } from '../src/renderer/src/strings'

/**
 * Home-screen locale tables (src/renderer/src/strings.ts): zh defines the key
 * set; every other locale must cover exactly the same keys with real content.
 */

const locales = Object.keys(strings) as Array<keyof typeof strings>
const referenceKeys = Object.keys(strings.zh).sort()

/** placeholders like {n}, {name}, {v} embedded in a template */
function placeholdersOf(template: string): string[] {
  return (template.match(/\{[a-zA-Z0-9]+\}/g) ?? []).sort()
}

describe('home-screen locale tables', () => {
  it('includes the expected UI languages', () => {
    expect(locales).toContain('zh')
    expect(locales).toContain('en')
    expect(locales).toContain('zh-TW')
    expect(locales.length).toBeGreaterThanOrEqual(19)
  })

  it.each(locales)('locale %s has exactly the zh key set', (locale) => {
    expect(Object.keys(strings[locale]).sort()).toEqual(referenceKeys)
  })

  it.each(locales)('locale %s has no empty or whitespace-only values', (locale) => {
    const empty = Object.entries(strings[locale])
      .filter(([, value]) => typeof value !== 'string' || value.trim().length === 0)
      .map(([key]) => key)
    expect(empty).toEqual([])
  })

  it.each(locales)('locale %s keeps the zh placeholder set for each key', (locale) => {
    const table = strings[locale] as Record<string, string>
    const mismatched = referenceKeys.filter((key) => {
      const localePlaceholders = placeholdersOf(table[key])
      const zhPlaceholders = placeholdersOf((strings.zh as Record<string, string>)[key])
      // Singular-count keys ("...One") may drop the numeral entirely in
      // languages that express "one" grammatically (e.g. ar/he), so a
      // missing placeholder is fine there — an extra one is not.
      if (key.endsWith('One')) {
        return localePlaceholders.some((p) => !zhPlaceholders.includes(p))
      }
      return localePlaceholders.join(',') !== zhPlaceholders.join(',')
    })
    expect(mismatched).toEqual([])
  })

  it.each(locales)('locale %s omits retired presentation actions', (locale) => {
    expect(strings[locale]).not.toHaveProperty('newSlide')
    expect(strings[locale]).not.toHaveProperty('filterSlides')
    expect(strings[locale].onbBody1).not.toMatch(
      /\bslides?\b|presenta|présent|präsent|prezent|演示|簡報|プレゼン|프레젠|งานนำเสนอ|презента|تقديم|persembahan|מצגות|प्रस्तुति/i,
    )
  })

  it('has no duplicate values that suggest an untranslated copy-paste between zh and en', () => {
    // sanity check that en is actually translated, not a zh copy
    const zh = strings.zh as Record<string, string>
    const en = strings.en as Record<string, string>
    const identical = referenceKeys.filter((key) => zh[key] === en[key])
    // a few shared strings (brand names, "PDF", "OK"-style tokens) are fine
    expect(identical.length).toBeLessThan(referenceKeys.length / 4)
  })
})

describe('AI provider locale tables', () => {
  const providerLocales = Object.keys(aiProviderStrings) as Array<keyof typeof aiProviderStrings>
  const providerReferenceKeys = Object.keys(aiProviderStrings.zh).sort()

  it('covers every shell locale', () => {
    expect([...providerLocales].sort()).toEqual([...locales].sort())
  })

  it.each(providerLocales)('locale %s has complete, non-empty provider copy', (locale) => {
    const table = aiProviderStrings[locale] as Record<string, string>
    expect(Object.keys(table).sort()).toEqual(providerReferenceKeys)
    expect(Object.values(table).every((value) => value.trim().length > 0)).toBe(true)
  })

  it.each(providerLocales)('locale %s preserves provider-copy placeholders', (locale) => {
    const table = aiProviderStrings[locale] as Record<string, string>
    const reference = aiProviderStrings.zh as Record<string, string>
    expect(
      providerReferenceKeys.filter(
        (key) => placeholdersOf(table[key]).join(',') !== placeholdersOf(reference[key]).join(','),
      ),
    ).toEqual([])
  })
})
