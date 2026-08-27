import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { createI18n, htmlLang, type Lang, type Params } from '@genoffice/i18n'
import { aiProviderStrings } from './ai-provider-strings'
import { strings as homeStrings } from './strings'

const strings = {
  zh: { ...homeStrings.zh, ...aiProviderStrings.zh },
  en: { ...homeStrings.en, ...aiProviderStrings.en },
  ja: { ...homeStrings.ja, ...aiProviderStrings.ja },
  ko: { ...homeStrings.ko, ...aiProviderStrings.ko },
  fr: { ...homeStrings.fr, ...aiProviderStrings.fr },
  de: { ...homeStrings.de, ...aiProviderStrings.de },
  es: { ...homeStrings.es, ...aiProviderStrings.es },
  th: { ...homeStrings.th, ...aiProviderStrings.th },
  id: { ...homeStrings.id, ...aiProviderStrings.id },
  ru: { ...homeStrings.ru, ...aiProviderStrings.ru },
  ar: { ...homeStrings.ar, ...aiProviderStrings.ar },
  pt: { ...homeStrings.pt, ...aiProviderStrings.pt },
  it: { ...homeStrings.it, ...aiProviderStrings.it },
  pl: { ...homeStrings.pl, ...aiProviderStrings.pl },
  nl: { ...homeStrings.nl, ...aiProviderStrings.nl },
  ms: { ...homeStrings.ms, ...aiProviderStrings.ms },
  he: { ...homeStrings.he, ...aiProviderStrings.he },
  hi: { ...homeStrings.hi, ...aiProviderStrings.hi },
  'zh-TW': { ...homeStrings['zh-TW'], ...aiProviderStrings['zh-TW'] },
} as const

const translate = createI18n(strings)

export type StringKey = keyof typeof strings.zh
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
