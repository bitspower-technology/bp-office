import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { createI18n, htmlLang, type Lang, type Params } from '@genoffice/i18n'
import { aiProviderStrings } from './ai-provider-strings'
import { strings as homeStrings } from './strings'
import { CHATGPT_SUBSCRIPTION_ENABLED } from '../../shared/product-config'

function productStrings<H extends Record<string, string>, P extends Record<string, string>>(
  home: H,
  provider: P,
): H & P {
  const combined = { ...home, ...provider } as H & P
  if (!CHATGPT_SUBSCRIPTION_ENABLED) {
    Object.assign(combined, {
      onbLocalAi: home.onbLocalAi,
      onbNote3: home.onbNote3,
    })
  }
  return combined
}

const strings = {
  zh: productStrings(homeStrings.zh, aiProviderStrings.zh),
  en: productStrings(homeStrings.en, aiProviderStrings.en),
  ja: productStrings(homeStrings.ja, aiProviderStrings.ja),
  ko: productStrings(homeStrings.ko, aiProviderStrings.ko),
  fr: productStrings(homeStrings.fr, aiProviderStrings.fr),
  de: productStrings(homeStrings.de, aiProviderStrings.de),
  es: productStrings(homeStrings.es, aiProviderStrings.es),
  th: productStrings(homeStrings.th, aiProviderStrings.th),
  id: productStrings(homeStrings.id, aiProviderStrings.id),
  ru: productStrings(homeStrings.ru, aiProviderStrings.ru),
  ar: productStrings(homeStrings.ar, aiProviderStrings.ar),
  pt: productStrings(homeStrings.pt, aiProviderStrings.pt),
  it: productStrings(homeStrings.it, aiProviderStrings.it),
  pl: productStrings(homeStrings.pl, aiProviderStrings.pl),
  nl: productStrings(homeStrings.nl, aiProviderStrings.nl),
  ms: productStrings(homeStrings.ms, aiProviderStrings.ms),
  he: productStrings(homeStrings.he, aiProviderStrings.he),
  hi: productStrings(homeStrings.hi, aiProviderStrings.hi),
  'zh-TW': productStrings(homeStrings['zh-TW'], aiProviderStrings['zh-TW']),
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
