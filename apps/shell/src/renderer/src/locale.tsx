import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { createI18n, htmlLang, type Lang, type Params } from '@genoffice/i18n'
import { aiProviderStrings } from './ai-provider-strings'
import { strings as homeStrings } from './strings'
import { CHATGPT_SUBSCRIPTION_ENABLED } from '../../shared/product-config'
import { homeInterfaceStrings } from './home-interface-strings'

function productStrings<
  H extends Record<string, string>,
  P extends Record<string, string>,
  I extends Record<string, string>,
>(home: H, provider: P, ui: I) {
  const combined = { ...homeStrings.en, ...home, ...provider, ...ui }
  if (!CHATGPT_SUBSCRIPTION_ENABLED) {
    Object.assign(combined, {
      onbLocalAi: home.onbLocalAi,
      onbNote3: home.onbNote3,
    })
  }
  return combined
}

const strings = {
  zh: productStrings(homeStrings['zh'], aiProviderStrings['zh'], homeInterfaceStrings['zh']),
  en: productStrings(homeStrings['en'], aiProviderStrings['en'], homeInterfaceStrings['en']),
  ja: productStrings(homeStrings['ja'], aiProviderStrings['ja'], homeInterfaceStrings['ja']),
  ko: productStrings(homeStrings['ko'], aiProviderStrings['ko'], homeInterfaceStrings['ko']),
  fr: productStrings(homeStrings['fr'], aiProviderStrings['fr'], homeInterfaceStrings['fr']),
  de: productStrings(homeStrings['de'], aiProviderStrings['de'], homeInterfaceStrings['de']),
  es: productStrings(homeStrings['es'], aiProviderStrings['es'], homeInterfaceStrings['es']),
  th: productStrings(homeStrings['th'], aiProviderStrings['th'], homeInterfaceStrings['th']),
  id: productStrings(homeStrings['id'], aiProviderStrings['id'], homeInterfaceStrings['id']),
  ru: productStrings(homeStrings['ru'], aiProviderStrings['ru'], homeInterfaceStrings['ru']),
  ar: productStrings(homeStrings['ar'], aiProviderStrings['ar'], homeInterfaceStrings['ar']),
  pt: productStrings(homeStrings['pt'], aiProviderStrings['pt'], homeInterfaceStrings['pt']),
  it: productStrings(homeStrings['it'], aiProviderStrings['it'], homeInterfaceStrings['it']),
  pl: productStrings(homeStrings['pl'], aiProviderStrings['pl'], homeInterfaceStrings['pl']),
  nl: productStrings(homeStrings['nl'], aiProviderStrings['nl'], homeInterfaceStrings['nl']),
  ms: productStrings(homeStrings['ms'], aiProviderStrings['ms'], homeInterfaceStrings['ms']),
  he: productStrings(homeStrings['he'], aiProviderStrings['he'], homeInterfaceStrings['he']),
  hi: productStrings(homeStrings['hi'], aiProviderStrings['hi'], homeInterfaceStrings['hi']),
  'zh-TW': productStrings(
    homeStrings['zh-TW'],
    aiProviderStrings['zh-TW'],
    homeInterfaceStrings['zh-TW'],
  ),
  cs: productStrings(homeStrings['cs'], aiProviderStrings['cs'], homeInterfaceStrings['cs']),
} as const

const translate = createI18n(strings)

export type StringKey = Extract<keyof typeof strings.zh, string>
export type TFunc = (key: StringKey, params?: Params) => string

interface LocaleValue {
  lang: Lang
  setLang: (lang: Lang) => void
}

const LocaleContext = createContext<LocaleValue>({ lang: 'zh', setLang: () => {} })

export function LocaleProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial)
  const value = useMemo<LocaleValue>(
    () => ({
      lang,
      setLang: (next) => {
        setLangState(next)
        document.documentElement.lang = htmlLang(next)
        void window.aiOffice.setLanguage(next)
      },
    }),
    [lang],
  )
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export interface I18n {
  lang: Lang
  setLang: (lang: Lang) => void
  t: TFunc
  /** BCP-47 locale for date/number formatting */
  dateLocale: string
}

/** BCP-47 locale per UI language, for date/number formatting */
const DATE_LOCALES: Record<Lang, string> = {
  zh: 'zh-CN',
  en: 'en-US',
  ja: 'ja-JP',
  ko: 'ko-KR',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
  th: 'th-TH',
  id: 'id-ID',
  ru: 'ru-RU',
  ar: 'ar-SA',
  pt: 'pt-BR',
  it: 'it-IT',
  pl: 'pl-PL',
  cs: 'cs-CZ',
  nl: 'nl-NL',
  ms: 'ms-MY',
  he: 'he-IL',
  hi: 'hi-IN',
  'zh-TW': 'zh-TW',
}

export function useI18n(): I18n {
  const { lang, setLang } = useContext(LocaleContext)
  return {
    lang,
    setLang,
    t: (key, params) => translate(lang, key, params),
    dateLocale: DATE_LOCALES[lang],
  }
}
