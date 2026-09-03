import { describe, expect, it } from 'vitest'
import { LANGS } from '@genoffice/i18n'
import { strings } from '../src/renderer/i18n/strings'

const dicts = strings as Record<string, Record<string, string>>
const zhKeys = Object.keys(dicts.zh!).sort()

/** "Traditional" in every UI language the table serves, plus both Chinese scripts. */
const TRADITIONAL_LABEL =
  /繁體|繁体|傳統|传统|tradition|tradicional|tradizional|tradycyjny|Tradisional|традиц|التقليدية|מסורתית|पारंपरिक|번체|ตัวเต็ม/i

/**
 * The ribbon and the right-click menu build their Translate target list straight
 * out of these tables, so a key added to one locale has to exist in all of them —
 * otherwise that language silently loses 繁體中文 or gains an empty menu row.
 */
describe('i18n string tables', () => {
  it('provides a dictionary for every supported language and nothing else', () => {
    expect(Object.keys(dicts).sort()).toEqual([...LANGS].sort())
  })

  it.each([...LANGS])('locale %s has exactly the zh key set', (lang) => {
    expect(Object.keys(dicts[lang]!).sort()).toEqual(zhKeys)
  })

  it.each([...LANGS])('locale %s has no unexpected empty values', (lang) => {
    // a handful of labels are affixes that CJK locales express as a suffix instead,
    // so their prefix is legitimately '' — everything else must carry text
    const intentionallyEmpty = new Set(['appCompareWithPrefix'])
    for (const [key, value] of Object.entries(dicts[lang]!)) {
      expect(typeof value, `${lang}.${key}`).toBe('string')
      if (intentionallyEmpty.has(key)) continue
      expect(value.trim().length, `${lang}.${key} is empty`).toBeGreaterThan(0)
    }
  })

  it.each([...LANGS])('locale %s keeps the same placeholders as zh', (lang) => {
    for (const key of zhKeys) {
      const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort()
      expect(placeholders(dicts[lang]![key]!), `${lang}.${key}`).toEqual(
        placeholders(dicts.zh![key]!),
      )
    }
  })

  it.each([...LANGS])('locale %s offers Traditional Chinese as a translate target', (lang) => {
    expect(dicts[lang]!.appLangTraditionalChinese, `${lang}.appLangTraditionalChinese`).toMatch(
      TRADITIONAL_LABEL,
    )
    expect(
      dicts[lang]!.ribbonLangTraditionalChinese,
      `${lang}.ribbonLangTraditionalChinese`,
    ).toMatch(TRADITIONAL_LABEL)
  })
})
