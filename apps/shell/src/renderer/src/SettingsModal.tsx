import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useI18n } from './locale'
import type { StringKey } from './locale'
import type { LmStudioConfig, LmStudioStatus, UiTheme } from '../../shared/home-api'
import './settings.css'

const LANG_OPTIONS = [
  { value: 'ar', label: 'العربية' },
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

const CHANNEL_OPTIONS = [
  { value: 'stable', labelKey: 'channelStable' },
  { value: 'beta', labelKey: 'channelBeta' },
] as const satisfies readonly { value: 'stable' | 'beta'; labelKey: StringKey }[]

type SectionId = 'local-ai' | 'general' | 'about'

const SECTIONS: readonly { id: SectionId; labelKey: StringKey }[] = [
  { id: 'local-ai', labelKey: 'setSecLocalAi' },
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
  lmStudioStatus: LmStudioStatus | null
  lmStudioChecking: boolean
  onRefreshLmStudio: (config?: LmStudioConfig) => Promise<void>
  onClose: () => void
}

export function SettingsModal({
  lmStudioStatus,
  lmStudioChecking,
  onRefreshLmStudio,
  onClose,
}: SettingsModalProps) {
  const { lang, setLang, t } = useI18n()
  const [section, setSection] = useState<SectionId>('local-ai')
  const [theme, setTheme] = useState<UiTheme>('system')
  const [saveDir, setSaveDir] = useState('')
  const [channel, setChannel] = useState<'stable' | 'beta'>('stable')
  const [appVersion, setAppVersion] = useState('')
  const [lmStudioConfig, setLmStudioConfig] = useState<LmStudioConfig>({
    baseUrl: 'http://127.0.0.1:1234/v1',
    model: '',
    apiKey: '',
  })
  const [configLoading, setConfigLoading] = useState(true)
  const [configSaving, setConfigSaving] = useState(false)
  const [configError, setConfigError] = useState('')
  const [configSaved, setConfigSaved] = useState(false)
  const [modelMode, setModelMode] = useState<'automatic' | 'manual'>('automatic')

  useEffect(() => {
    let alive = true
    void window.aiOffice.getTheme?.().then((value) => {
      if (alive) setTheme(value)
    })
    void window.aiOffice.getDefaultSaveDir?.().then((value) => {
      if (alive && value) setSaveDir(value)
    })
    void window.aiOffice.getUpdateChannel?.().then((value) => {
      if (alive) setChannel(value)
    })
    void window.aiOffice.getAppVersion?.().then((value) => {
      if (alive && value) setAppVersion(value)
    })
    void window.aiOffice
      .getLmStudioConfig()
      .then((value) => {
        if (!alive) return
        setLmStudioConfig(value)
        setModelMode(value.model ? 'manual' : 'automatic')
      })
      .catch((error: unknown) => {
        if (alive) setConfigError(error instanceof Error ? error.message : 'load-failed')
      })
      .finally(() => {
        if (alive) setConfigLoading(false)
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

  const changeSaveDir = () => {
    void window.aiOffice.pickDefaultSaveDir?.().then((dir) => {
      if (dir) setSaveDir(dir)
    })
  }

  const statusState = lmStudioChecking ? 'checking' : (lmStudioStatus?.state ?? 'unreachable')
  const statusText = lmStudioChecking
    ? t('lmStudioChecking')
    : statusState === 'connected'
      ? lmStudioStatus?.selectedModel
        ? t('lmStudioConnectedModel', { model: lmStudioStatus.selectedModel })
        : t('lmStudioConnected')
      : statusState === 'no-models'
        ? t('lmStudioNoModels')
        : statusState === 'unauthorized'
          ? t('lmStudioUnauthorized')
          : t('lmStudioUnreachable')

  const effectiveLmStudioConfig: LmStudioConfig = {
    ...lmStudioConfig,
    model: modelMode === 'automatic' ? '' : lmStudioConfig.model,
  }

  const saveAndTestLmStudio = async () => {
    setConfigSaving(true)
    setConfigError('')
    setConfigSaved(false)
    if (modelMode === 'manual' && !lmStudioConfig.model.trim()) {
      setConfigError('model-required')
      setConfigSaving(false)
      return
    }
    try {
      const saved = await window.aiOffice.setLmStudioConfig(effectiveLmStudioConfig)
      setLmStudioConfig(saved)
      await onRefreshLmStudio()
      const resolved = await window.aiOffice.getLmStudioConfig()
      setLmStudioConfig(resolved)
      setModelMode(resolved.model ? 'manual' : 'automatic')
      setConfigSaved(true)
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : 'save-failed')
    } finally {
      setConfigSaving(false)
    }
  }

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
              <>
                <h3 className="set-pane-title">{t('setSecLocalAi')}</h3>
                <div
                  className={`set-ai-status ${statusState}`}
                  data-testid="lmstudio-settings-status"
                >
                  <span className={`set-ai-status-dot ${statusState}`} />
                  <div className="set-ai-status-copy">
                    <strong>LM Studio</strong>
                    <span>{statusText}</span>
                  </div>
                  <button
                    className="set-btn"
                    disabled={lmStudioChecking}
                    onClick={() => void onRefreshLmStudio(effectiveLmStudioConfig)}
                    data-testid="lmstudio-refresh"
                  >
                    {t('lmStudioRefresh')}
                  </button>
                </div>
                <label className="set-control" htmlFor="lmstudio-base-url">
                  <span className="set-field-label">{t('lmStudioEndpoint')}</span>
                  <input
                    id="lmstudio-base-url"
                    data-testid="lmstudio-base-url"
                    className="set-input"
                    type="url"
                    spellCheck={false}
                    disabled={configLoading || configSaving}
                    value={lmStudioConfig.baseUrl}
                    onChange={(event) => {
                      setConfigSaved(false)
                      setLmStudioConfig((current) => ({ ...current, baseUrl: event.target.value }))
                    }}
                  />
                  <span className="set-help">{t('lmStudioEndpointHint')}</span>
                </label>
                <div className="set-control">
                  <label className="set-field-label" htmlFor="lmstudio-model">
                    {t('lmStudioModel')}
                  </label>
                  <span className="set-model-mode" data-testid="lmstudio-model-mode">
                    <button
                      type="button"
                      className={modelMode === 'automatic' ? 'active' : ''}
                      aria-pressed={modelMode === 'automatic'}
                      onClick={() => {
                        setConfigSaved(false)
                        setModelMode('automatic')
                      }}
                    >
                      {t('lmStudioModelAutomatic')}
                    </button>
                    <button
                      type="button"
                      className={modelMode === 'manual' ? 'active' : ''}
                      aria-pressed={modelMode === 'manual'}
                      onClick={() => {
                        setConfigSaved(false)
                        setModelMode('manual')
                        if (!lmStudioConfig.model) {
                          const model =
                            lmStudioStatus?.selectedModel ?? lmStudioStatus?.models[0]?.id
                          if (model) setLmStudioConfig((current) => ({ ...current, model }))
                        }
                      }}
                    >
                      {t('lmStudioModelManual')}
                    </button>
                  </span>
                  {modelMode === 'manual' && (
                    <input
                      id="lmstudio-model"
                      data-testid="lmstudio-model"
                      className="set-input"
                      list="lmstudio-models"
                      spellCheck={false}
                      disabled={configLoading || configSaving}
                      value={lmStudioConfig.model}
                      onChange={(event) => {
                        setConfigSaved(false)
                        setLmStudioConfig((current) => ({ ...current, model: event.target.value }))
                      }}
                    />
                  )}
                  {modelMode === 'automatic' && (
                    <span className="set-help">{t('lmStudioModelAuto')}</span>
                  )}
                  <datalist id="lmstudio-models">
                    {lmStudioStatus?.models.map((model) => {
                      const tags = [
                        model.loaded ? t('lmStudioModelLoaded') : '',
                        model.toolCapable ? t('lmStudioModelTools') : '',
                        model.vision ? t('lmStudioModelVision') : '',
                      ].filter(Boolean)
                      return (
                        <option key={model.id} value={model.id}>
                          {tags.length
                            ? `${model.displayName} — ${tags.join(' · ')}`
                            : model.displayName}
                        </option>
                      )
                    })}
                  </datalist>
                </div>
                <label className="set-control" htmlFor="lmstudio-api-token">
                  <span className="set-field-label">{t('lmStudioApiToken')}</span>
                  <input
                    id="lmstudio-api-token"
                    data-testid="lmstudio-api-token"
                    className="set-input"
                    type="password"
                    autoComplete="off"
                    disabled={configLoading || configSaving}
                    value={lmStudioConfig.apiKey}
                    onChange={(event) => {
                      setConfigSaved(false)
                      setLmStudioConfig((current) => ({ ...current, apiKey: event.target.value }))
                    }}
                  />
                  <span className="set-help">{t('lmStudioApiTokenHint')}</span>
                </label>
                {configError && (
                  <div className="set-message error" role="alert">
                    {configError === 'load-failed' || configError === 'save-failed'
                      ? t('lmStudioSaveFailed')
                      : configError === 'model-required'
                        ? t('lmStudioModelRequired')
                        : configError}
                  </div>
                )}
                {configSaved && (
                  <div className="set-message success" data-testid="lmstudio-save-success">
                    {t('lmStudioSaved')}
                  </div>
                )}
                <div className="set-pane-footer">
                  <button
                    className="set-btn primary"
                    disabled={configLoading || configSaving}
                    onClick={() => void saveAndTestLmStudio()}
                    data-testid="lmstudio-save-test"
                  >
                    {configSaving ? t('lmStudioSaving') : t('lmStudioSaveTest')}
                  </button>
                </div>
              </>
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
                <div className="set-field">
                  <div className="set-field-text">
                    <label className="set-field-label" htmlFor="set-channel">
                      {t('updateChannel')}
                    </label>
                  </div>
                  <select
                    id="set-channel"
                    className="set-select"
                    value={channel}
                    onChange={(event) => {
                      const next = event.target.value === 'beta' ? 'beta' : 'stable'
                      setChannel(next)
                      void window.aiOffice.setUpdateChannel(next)
                    }}
                  >
                    {CHANNEL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
