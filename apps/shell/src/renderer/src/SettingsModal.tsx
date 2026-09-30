import {
  AI_CUSTOM_FONT_MAX_PX,
  AI_CUSTOM_FONT_MIN_PX,
  DEFAULT_AI_PANEL_PREFS,
  Dropdown,
  aiPanelFontPx,
  clampAiCustomFontSize,
} from '@genoffice/ui'
import type { AiFontSize, AiPanelPrefs, AiPanelSide } from '@genoffice/ui'
import type { DefaultAppStatus } from '../../shared/home-api'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useI18n } from './locale'
import type { StringKey } from './locale'
import type {
  AiConnectionProvider,
  ChatGptConfig,
  ChatGptStatus,
  LmStudioConfig,
  LmStudioStatus,
  UiTheme,
} from '../../shared/home-api'
import { AiProviderPane } from './AiProviderPane'
import './settings.css'

const LANG_OPTIONS = [
  { value: 'ar', label: 'العربية' },
  { value: 'cs', label: 'Čeština' },
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'he', label: 'עברית' },
  { value: 'hi', label: 'हिन्दी' },
  { value: 'id', label: 'Bahasa Indonesia' },
  { value: 'it', label: 'Italiano' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'ms', label: 'Bahasa Melayu' },
  { value: 'nl', label: 'Nederlands' },
  { value: 'pl', label: 'Polski' },
  { value: 'pt', label: 'Português' },
  { value: 'ru', label: 'Русский' },
  { value: 'th', label: 'ไทย' },
  { value: 'zh', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
] as const

const THEME_OPTIONS = [
  { value: 'light', labelKey: 'themeLight' },
  { value: 'dark', labelKey: 'themeDark' },
  { value: 'system', labelKey: 'themeSystem' },
] as const satisfies readonly { value: UiTheme; labelKey: StringKey }[]

function CustomFontSizeInput({
  value,
  label,
  onCommit,
}: {
  value: number
  label: string
  onCommit: (px: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  const [editing, setEditing] = useState(false)
  const shown = editing ? draft : String(value)
  const commit = (raw: string) => {
    const px = clampAiCustomFontSize(raw)
    if (px !== null && px !== value) onCommit(px)
  }
  return (
    <label className="set-num">
      <input
        type="number"
        className="set-input set-num-input"
        aria-label={label}
        min={AI_CUSTOM_FONT_MIN_PX}
        max={AI_CUSTOM_FONT_MAX_PX}
        step={1}
        value={shown}
        onFocus={() => {
          setDraft(String(value))
          setEditing(true)
        }}
        onChange={(e) => {
          setDraft(e.target.value)
          const n = Number(e.target.value)
          if (Number.isInteger(n) && n >= AI_CUSTOM_FONT_MIN_PX && n <= AI_CUSTOM_FONT_MAX_PX) {
            onCommit(n)
          }
        }}
        onBlur={() => {
          commit(draft)
          setEditing(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
      <span className="set-num-unit">px</span>
    </label>
  )
}

const AI_FONT_SIZE_OPTIONS = [
  { value: 'default', labelKey: 'aiFontSizeDefault' },
  { value: 'large', labelKey: 'aiFontSizeLarge' },
  { value: 'xlarge', labelKey: 'aiFontSizeXLarge' },
  { value: 'custom', labelKey: 'aiFontSizeCustom' },
] as const satisfies readonly { value: AiFontSize; labelKey: StringKey }[]

type SectionId = 'local-ai' | 'general' | 'about'

const SECTIONS: readonly { id: SectionId; labelKey: StringKey }[] = [
  { id: 'local-ai', labelKey: 'setSecAiProvider' },
  { id: 'general', labelKey: 'setSecGeneral' },
  { id: 'about', labelKey: 'setSecAbout' },
]

function SectionIcon({ id }: { id: SectionId }) {
  if (id === 'local-ai') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect
          x="2.2"
          y="2.3"
          width="11.6"
          height="4.3"
          rx="1.4"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <rect
          x="2.2"
          y="9.4"
          width="11.6"
          height="4.3"
          rx="1.4"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <path
          d="M4.6 4.45h.01M4.6 11.55h.01"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  if (id === 'general') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M2 5h8M13 5h1M2 11h1M6 11h8"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <circle cx="11.5" cy="5" r="1.7" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="4.5" cy="11" r="1.7" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    )
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 7.4v3.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="8" cy="5.1" r="0.8" fill="currentColor" />
    </svg>
  )
}

function Field({
  label,
  value,
  valueTitle,
  action,
}: {
  label: string
  value: string
  valueTitle?: string
  action?: ReactNode
}) {
  return (
    <div className="set-field">
      <div className="set-field-text">
        <div className="set-field-label">{label}</div>
        <div className="set-field-value" data-tip={valueTitle}>
          {value}
        </div>
      </div>
      {action}
    </div>
  )
}

export interface SettingsModalProps {
  initialSection?: SectionId
  aiProvider: AiConnectionProvider
  lmStudioStatus: LmStudioStatus | null
  lmStudioChecking: boolean
  chatGptStatus: ChatGptStatus | null
  chatGptChecking: boolean
  onRefreshLmStudio: (config?: LmStudioConfig) => Promise<void>
  onRefreshChatGpt: (config?: ChatGptConfig) => Promise<void>
  onAiProviderChange: (provider: AiConnectionProvider) => Promise<void>
  onClose: () => void
}

export function SettingsModal({
  initialSection = 'local-ai',
  aiProvider,
  lmStudioStatus,
  lmStudioChecking,
  chatGptStatus,
  chatGptChecking,
  onRefreshLmStudio,
  onRefreshChatGpt,
  onAiProviderChange,
  onClose,
}: SettingsModalProps) {
  const { lang, setLang, t } = useI18n()
  const [section, setSection] = useState<SectionId>(initialSection)
  const [defaultApp, setDefaultApp] = useState<DefaultAppStatus | null>(null)
  const [defaultAppBusy, setDefaultAppBusy] = useState(false)
  const [defaultAppFailed, setDefaultAppFailed] = useState(false)
  const [aiPrefs, setAiPrefs] = useState<AiPanelPrefs>(DEFAULT_AI_PANEL_PREFS)
  const [theme, setTheme] = useState<UiTheme>('system')
  const [saveDir, setSaveDir] = useState('')
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    let alive = true
    void window.aiOffice.getDefaultAppStatus?.().then((st) => {
      if (alive) setDefaultApp(st)
    })
    void window.aiOffice.getAiPanelPrefs?.().then((prefs) => {
      if (alive) setAiPrefs(prefs)
    })
    void window.aiOffice.getTheme?.().then((value) => {
      if (alive) setTheme(value)
    })
    void window.aiOffice.getDefaultSaveDir?.().then((value) => {
      if (alive && value) setSaveDir(value)
    })
    void window.aiOffice.getAppVersion?.().then((value) => {
      if (alive && value) setAppVersion(value)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const applyTheme = (next: UiTheme) => {
    setTheme(next)
    void window.aiOffice.setTheme(next)
    if (next === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', next)
  }

  const updateAiPrefs = (patch: Partial<AiPanelPrefs>) => {
    setAiPrefs((prev) => ({ ...prev, ...patch }))
    void window.aiOffice.setAiPanelPrefs(patch).then(setAiPrefs)
  }

  const changeSaveDir = () => {
    void window.aiOffice.pickDefaultSaveDir?.().then((dir) => {
      if (dir) setSaveDir(dir)
    })
  }

  // Windows only opens the system page; re-read ownership when the user comes back
  useEffect(() => {
    if (!defaultApp?.manualOnly) return
    const refresh = () => {
      void window.aiOffice.getDefaultAppStatus?.().then(setDefaultApp)
    }
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [defaultApp?.manualOnly])

  const claimDefaultApp = () => {
    setDefaultAppBusy(true)
    setDefaultAppFailed(false)
    void window.aiOffice
      .setDefaultApp()
      .then((st) => {
        setDefaultApp(st)
        if (!st.manualOnly && st.state !== 'default') setDefaultAppFailed(true)
      })
      .catch(() => setDefaultAppFailed(true))
      .finally(() => setDefaultAppBusy(false))
  }

  const defaultAppDesc = (() => {
    if (!defaultApp) return ''
    if (defaultAppFailed) return t('setDefaultAppFailed')
    if (defaultApp.state === 'default') return t('setDefaultAppIs')
    if (defaultApp.state === 'other' && defaultApp.others.length > 0)
      return t('setDefaultAppOther', { app: defaultApp.others.join(', ') })
    return t('setDefaultAppDesc')
  })()

  return (
    <div
      className="set-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="set-dialog" role="dialog" aria-modal="true" aria-label={t('settings')}>
        <div className="set-header">
          <h2 className="set-title">{t('settings')}</h2>
          <button className="set-close" onClick={onClose} aria-label={t('cancel')}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path
                d="M2 2l10 10M12 2L2 12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="set-body">
          <nav className="set-nav" aria-label={t('settings')}>
            {SECTIONS.map((item) => (
              <button
                key={item.id}
                className={`set-nav-item${section === item.id ? ' active' : ''}`}
                aria-current={section === item.id}
                onClick={() => setSection(item.id)}
              >
                <SectionIcon id={item.id} />
                {t(item.labelKey)}
              </button>
            ))}
          </nav>
          <div className="set-pane">
            {section === 'local-ai' && (
              <AiProviderPane
                aiProvider={aiProvider}
                lmStudioStatus={lmStudioStatus}
                lmStudioChecking={lmStudioChecking}
                chatGptStatus={chatGptStatus}
                chatGptChecking={chatGptChecking}
                onRefreshLmStudio={onRefreshLmStudio}
                onRefreshChatGpt={onRefreshChatGpt}
                onAiProviderChange={onAiProviderChange}
              />
            )}
            {section === 'general' && (
              <>
                <h3 className="set-pane-title">{t('setSecGeneral')}</h3>
                <div className="set-field">
                  <div className="set-field-text">
                    <label className="set-field-label" htmlFor="set-lang">
                      {t('language')}
                    </label>
                  </div>
                  <select
                    id="set-lang"
                    className="set-select"
                    value={lang}
                    onChange={(event) => setLang(event.target.value as typeof lang)}
                  >
                    {LANG_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="set-field">
                  <div className="set-field-text">
                    <label className="set-field-label" htmlFor="set-theme">
                      {t('theme')}
                    </label>
                  </div>
                  <select
                    id="set-theme"
                    className="set-select"
                    value={theme}
                    onChange={(event) => applyTheme(event.target.value as UiTheme)}
                  >
                    {THEME_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="set-field">
                  <div className="set-field-text">
                    <label className="set-field-label">{t('setAiPanelSide')}</label>
                  </div>
                  <Dropdown
                    className="set-dd"
                    value={aiPrefs.side}
                    ariaLabel={t('setAiPanelSide')}
                    options={[
                      { value: 'left', label: t('aiPanelSideLeft') },
                      { value: 'right', label: t('aiPanelSideRight') },
                    ]}
                    onPick={(side) => updateAiPrefs({ side: side as AiPanelSide })}
                  />
                </div>
                <div className="set-field">
                  <div className="set-field-text">
                    <label className="set-field-label">{t('setAiFontSize')}</label>
                  </div>
                  {aiPrefs.fontSize === 'custom' && (
                    <CustomFontSizeInput
                      value={aiPrefs.customFontSize}
                      label={t('aiFontSizeCustom')}
                      onCommit={(px) => updateAiPrefs({ customFontSize: px })}
                    />
                  )}
                  <Dropdown
                    className="set-dd"
                    value={aiPrefs.fontSize}
                    ariaLabel={t('setAiFontSize')}
                    options={AI_FONT_SIZE_OPTIONS.map((opt) => ({
                      value: opt.value,
                      label: t(opt.labelKey),
                    }))}
                    onPick={(v) => {
                      const fontSize = v as AiFontSize
                      // start the custom size from the preset being left so nothing jumps
                      updateAiPrefs(
                        fontSize === 'custom' && aiPrefs.fontSize !== 'custom'
                          ? { fontSize, customFontSize: aiPanelFontPx(aiPrefs) }
                          : { fontSize },
                      )
                    }}
                  />
                </div>
                <div className="set-field">
                  <div className="set-field-text">
                    <div className="set-field-stack">
                      <div className="set-field-label">{t('setAiSpellcheck')}</div>
                      <div className="set-field-desc">{t('setAiSpellcheckDesc')}</div>
                    </div>
                  </div>
                  <button
                    className="set-switch"
                    role="switch"
                    aria-checked={aiPrefs.spellcheck}
                    aria-label={t('setAiSpellcheck')}
                    onClick={() => updateAiPrefs({ spellcheck: !aiPrefs.spellcheck })}
                  />
                </div>
                {defaultApp && defaultApp.state !== 'unsupported' && (
                  <div className="set-field">
                    <div className="set-field-text">
                      <div className="set-field-stack">
                        <div className="set-field-label">{t('setDefaultApp')}</div>
                        <div className="set-field-desc">{defaultAppDesc}</div>
                      </div>
                    </div>
                    <button
                      className="set-btn"
                      disabled={defaultAppBusy || defaultApp.state === 'default'}
                      onClick={claimDefaultApp}
                    >
                      {defaultApp.manualOnly
                        ? t('setDefaultAppOpenSettings')
                        : t('setDefaultAppSet')}
                    </button>
                  </div>
                )}
                <Field
                  label={t('saveLocation')}
                  value={saveDir || '—'}
                  valueTitle={saveDir}
                  action={
                    <button className="set-btn" onClick={changeSaveDir}>
                      {t('setChange')}
                    </button>
                  }
                />
              </>
            )}
            {section === 'about' && (
              <>
                <h3 className="set-pane-title">{t('setSecAbout')}</h3>
                <Field label={t('versionLabel')} value={appVersion || '—'} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
