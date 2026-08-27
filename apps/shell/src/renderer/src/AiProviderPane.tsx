import { useEffect, useState } from 'react'
import type {
  AiConnectionProvider,
  LmStudioConfig,
  LmStudioStatus,
} from '../../shared/home-api'
import { useI18n } from './locale'

export interface AiProviderPaneProps {
  aiProvider: AiConnectionProvider
  lmStudioStatus: LmStudioStatus | null
  lmStudioChecking: boolean
  onRefreshLmStudio: (config?: LmStudioConfig) => Promise<void>
  onAiProviderChange: (provider: AiConnectionProvider) => Promise<void>
}

export function AiProviderPane({
  aiProvider,
  lmStudioStatus,
  lmStudioChecking,
  onRefreshLmStudio,
  onAiProviderChange,
}: AiProviderPaneProps) {
  const { t } = useI18n()
  const [lmStudioConfig, setLmStudioConfig] = useState<LmStudioConfig>({
    baseUrl: 'http://127.0.0.1:1234/v1',
    model: '',
    apiKey: '',
  })
  const [lmStudioLoading, setLmStudioLoading] = useState(true)
  const [lmStudioSaving, setLmStudioSaving] = useState(false)
  const [lmStudioError, setLmStudioError] = useState('')
  const [lmStudioSaved, setLmStudioSaved] = useState(false)
  const [modelMode, setModelMode] = useState<'automatic' | 'manual'>('automatic')
  const [providerSwitching, setProviderSwitching] = useState(false)

  useEffect(() => {
    let alive = true
    void window.aiOffice
      .getLmStudioConfig()
      .then((value) => {
        if (!alive) return
        setLmStudioConfig(value)
        setModelMode(value.model ? 'manual' : 'automatic')
      })
      .catch(() => {
        if (alive) setLmStudioError('load-failed')
      })
      .finally(() => {
        if (alive) setLmStudioLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const effectiveLmStudioConfig: LmStudioConfig = {
    ...lmStudioConfig,
    model: modelMode === 'automatic' ? '' : lmStudioConfig.model,
  }

  const lmStudioState = lmStudioChecking ? 'checking' : (lmStudioStatus?.state ?? 'unreachable')
  const lmStudioStatusText = lmStudioChecking
    ? t('lmStudioChecking')
    : lmStudioState === 'connected'
      ? lmStudioStatus?.selectedModel
        ? t('lmStudioConnectedModel', { model: lmStudioStatus.selectedModel })
        : t('lmStudioConnected')
      : lmStudioState === 'no-models'
        ? t('lmStudioNoModels')
        : lmStudioState === 'unauthorized'
          ? t('lmStudioUnauthorized')
          : t('lmStudioUnreachable')

  const saveAndTestLmStudio = async () => {
    setLmStudioSaving(true)
    setLmStudioError('')
    setLmStudioSaved(false)
    if (modelMode === 'manual' && !lmStudioConfig.model.trim()) {
      setLmStudioError('model-required')
      setLmStudioSaving(false)
      return
    }
    try {
      const saved = await window.aiOffice.setLmStudioConfig(effectiveLmStudioConfig)
      setLmStudioConfig(saved)
      await onAiProviderChange('lmstudio')
      await onRefreshLmStudio()
      const resolved = await window.aiOffice.getLmStudioConfig()
      setLmStudioConfig(resolved)
      setModelMode(resolved.model ? 'manual' : 'automatic')
      setLmStudioSaved(true)
    } catch {
      setLmStudioError('save-failed')
    } finally {
      setLmStudioSaving(false)
    }
  }

  const changeProvider = async (provider: AiConnectionProvider) => {
    if (provider === aiProvider || providerSwitching) return
    setProviderSwitching(true)
    try {
      await onAiProviderChange(provider)
    } catch {
      // The shell keeps the previous selection; nothing to surface here.
    } finally {
      setProviderSwitching(false)
    }
  }

  return (
    <>
      <h3 className="set-pane-title">{t('setSecAiProvider')}</h3>
      <p className="set-pane-description">{t('aiProviderChoose')}</p>
      <div className="set-provider-picker" role="radiogroup" aria-label={t('setSecAiProvider')}>
        <button
          type="button"
          role="radio"
          aria-checked={aiProvider === 'lmstudio'}
          className={`set-provider-option${aiProvider === 'lmstudio' ? ' active' : ''}`}
          disabled={providerSwitching}
          onClick={() => void changeProvider('lmstudio')}
          data-testid="provider-lmstudio"
        >
          <strong>LM Studio</strong>
          <span>{t('aiProviderLmStudioHint')}</span>
        </button>
      </div>

      <>
          <div className={`set-ai-status ${lmStudioState}`} data-testid="lmstudio-settings-status">
            <span className={`set-ai-status-dot ${lmStudioState}`} />
            <div className="set-ai-status-copy">
              <strong>LM Studio</strong>
              <span>{lmStudioStatusText}</span>
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
              disabled={lmStudioLoading || lmStudioSaving}
              value={lmStudioConfig.baseUrl}
              onChange={(event) => {
                setLmStudioSaved(false)
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
                  setLmStudioSaved(false)
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
                  setLmStudioSaved(false)
                  setModelMode('manual')
                  if (!lmStudioConfig.model) {
                    const model = lmStudioStatus?.selectedModel ?? lmStudioStatus?.models[0]?.id
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
                disabled={lmStudioLoading || lmStudioSaving}
                value={lmStudioConfig.model}
                onChange={(event) => {
                  setLmStudioSaved(false)
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
                    {tags.length ? `${model.displayName} — ${tags.join(' · ')}` : model.displayName}
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
              disabled={lmStudioLoading || lmStudioSaving}
              value={lmStudioConfig.apiKey}
              onChange={(event) => {
                setLmStudioSaved(false)
                setLmStudioConfig((current) => ({ ...current, apiKey: event.target.value }))
              }}
            />
            <span className="set-help">{t('lmStudioApiTokenHint')}</span>
          </label>
          {lmStudioError && (
            <div className="set-message error" role="alert">
              {lmStudioError === 'load-failed' || lmStudioError === 'save-failed'
                ? t('lmStudioSaveFailed')
                : lmStudioError === 'model-required'
                  ? t('lmStudioModelRequired')
                  : lmStudioError}
            </div>
          )}
          {lmStudioSaved && (
            <div className="set-message success" data-testid="lmstudio-save-success">
              {t('lmStudioSaved')}
            </div>
          )}
          <div className="set-pane-footer">
            <button
              className="set-btn primary"
              disabled={lmStudioLoading || lmStudioSaving}
              onClick={() => void saveAndTestLmStudio()}
              data-testid="lmstudio-save-test"
            >
              {lmStudioSaving ? t('lmStudioSaving') : t('lmStudioSaveTest')}
            </button>
          </div>
        </>
    </>
  )
}
