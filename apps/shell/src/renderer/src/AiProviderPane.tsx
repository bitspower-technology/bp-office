import { useEffect, useMemo, useState } from 'react'
import type {
  AiConnectionProvider,
  ChatGptConfig,
  ChatGptRateLimit,
  ChatGptRateLimitWindow,
  ChatGptStatus,
  LmStudioConfig,
  LmStudioStatus,
} from '../../shared/home-api'
import {
  chatGptPlanLabel,
  clampChatGptUsagePercent,
  formatChatGptResetTime,
  formatChatGptWindowDuration,
} from './chatgpt-display'
import { useI18n } from './locale'
import { CHATGPT_SUBSCRIPTION_ENABLED } from '../../shared/product-config'

export interface AiProviderPaneProps {
  aiProvider: AiConnectionProvider
  lmStudioStatus: LmStudioStatus | null
  lmStudioChecking: boolean
  chatGptStatus: ChatGptStatus | null
  chatGptChecking: boolean
  onRefreshLmStudio: (config?: LmStudioConfig) => Promise<void>
  onRefreshChatGpt: (config?: ChatGptConfig) => Promise<void>
  onAiProviderChange: (provider: AiConnectionProvider) => Promise<void>
}

type PendingAction = 'provider' | 'login' | 'cancel-login' | 'logout' | 'model' | null

function rateLimitLabel(limit: ChatGptRateLimit, fallback: string): string {
  return limit.limitName?.trim() || fallback
}

export function AiProviderPane({
  aiProvider,
  lmStudioStatus,
  lmStudioChecking,
  chatGptStatus,
  chatGptChecking,
  onRefreshLmStudio,
  onRefreshChatGpt,
  onAiProviderChange,
}: AiProviderPaneProps) {
  const { t, dateLocale } = useI18n()
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
  const [chatGptConfig, setChatGptConfig] = useState<ChatGptConfig>({ model: '' })
  const [chatGptConfigLoading, setChatGptConfigLoading] = useState(true)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [loginId, setLoginId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

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
    if (CHATGPT_SUBSCRIPTION_ENABLED) {
      void window.aiOffice
        .getChatGptConfig()
        .then((value) => {
          if (alive) setChatGptConfig(value)
        })
        .catch(() => {
          if (alive) setActionError('load-failed')
        })
        .finally(() => {
          if (alive) setChatGptConfigLoading(false)
        })
    } else {
      setChatGptConfigLoading(false)
    }
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!CHATGPT_SUBSCRIPTION_ENABLED) return
    return window.aiOffice.onChatGptLoginCompleted((result) => {
      setLoginId(null)
      setPendingAction(null)
      setActionError(result.success ? '' : result.error || 'login-failed')
      void onRefreshChatGpt()
    })
  }, [onRefreshChatGpt])

  useEffect(() => {
    if (chatGptStatus?.state === 'connected') {
      setLoginId(null)
      setPendingAction(null)
      setActionError('')
    }
  }, [chatGptStatus?.state])

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

  const rateLimitReached = chatGptStatus?.rateLimits.some((limit) => limit.reached) ?? false
  const chatGptState = chatGptChecking
    ? 'checking'
    : chatGptStatus?.state === 'connected' && rateLimitReached
      ? 'rate-limited'
      : (chatGptStatus?.state ?? 'unavailable')
  const chatGptStatusText = loginId
    ? t('chatGptSigningIn')
    : chatGptChecking
      ? t('lmStudioChecking')
      : chatGptState === 'connected'
        ? chatGptStatus?.account?.planType
          ? t('chatGptConnectedPlan', {
              plan: chatGptPlanLabel(chatGptStatus.account.planType),
            })
          : t('lmStudioConnected')
        : chatGptState === 'rate-limited'
          ? t('chatGptRateLimited')
          : chatGptState === 'signed-out'
            ? t('chatGptSignedOut')
            : chatGptState === 'unavailable'
              ? t('chatGptUnavailable')
              : t('chatGptOperationFailed')

  const chatGptModels = useMemo(() => {
    const models = [...(chatGptStatus?.models ?? [])]
    if (
      chatGptConfig.model &&
      !models.some(
        (model) => model.id === chatGptConfig.model || model.model === chatGptConfig.model,
      )
    ) {
      models.unshift({
        id: chatGptConfig.model,
        model: chatGptConfig.model,
        displayName: chatGptConfig.model,
        isDefault: false,
        inputModalities: ['text'],
      })
    }
    return models
  }, [chatGptConfig.model, chatGptStatus?.models])
  const chatGptModelValue = chatGptConfig.model
    ? (chatGptModels.find(
        (model) => model.id === chatGptConfig.model || model.model === chatGptConfig.model,
      )?.model ?? chatGptConfig.model)
    : ''

  const rateLimitWindows = useMemo(
    () =>
      (chatGptStatus?.rateLimits ?? []).flatMap((limit, limitIndex) => {
        const windows: Array<{
          key: string
          limit: ChatGptRateLimit
          window: ChatGptRateLimitWindow
          kind: 'primary' | 'secondary'
        }> = []
        if (limit.primary) {
          windows.push({
            key: `${limitIndex}-primary`,
            limit,
            window: limit.primary,
            kind: 'primary',
          })
        }
        if (limit.secondary) {
          windows.push({
            key: `${limitIndex}-secondary`,
            limit,
            window: limit.secondary,
            kind: 'secondary',
          })
        }
        return windows
      }),
    [chatGptStatus?.rateLimits],
  )

  const saveAndTestLmStudio = async () => {
    setLmStudioSaving(true)
    setLmStudioError('')
    setLmStudioSaved(false)
    if (!lmStudioConfig.apiKey.trim()) {
      setLmStudioError('api-key-required')
      setLmStudioSaving(false)
      return
    }
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
    if (provider === 'chatgpt' && !CHATGPT_SUBSCRIPTION_ENABLED) return
    if (provider === aiProvider || pendingAction) return
    setPendingAction('provider')
    setActionError('')
    try {
      await onAiProviderChange(provider)
    } catch {
      setActionError('provider-failed')
    } finally {
      setPendingAction(null)
    }
  }

  const changeChatGptModel = async (model: string) => {
    const previous = chatGptConfig
    const next = { model }
    setChatGptConfig(next)
    setPendingAction('model')
    setActionError('')
    try {
      const saved = await window.aiOffice.setChatGptConfig(next)
      setChatGptConfig(saved)
      await onAiProviderChange('chatgpt')
      await onRefreshChatGpt(saved)
    } catch {
      setChatGptConfig(previous)
      setActionError('model-failed')
    } finally {
      setPendingAction(null)
    }
  }

  const startLogin = async () => {
    setPendingAction('login')
    setActionError('')
    try {
      const session = await window.aiOffice.startChatGptLogin()
      setLoginId(session.loginId)
    } catch {
      setActionError('login-failed')
    } finally {
      setPendingAction(null)
    }
  }

  const cancelLogin = async () => {
    if (!loginId) return
    setPendingAction('cancel-login')
    setActionError('')
    try {
      await window.aiOffice.cancelChatGptLogin(loginId)
      setLoginId(null)
      await onRefreshChatGpt()
    } catch {
      setActionError('cancel-failed')
    } finally {
      setPendingAction(null)
    }
  }

  const logout = async () => {
    setPendingAction('logout')
    setActionError('')
    try {
      await window.aiOffice.chatGptLogout()
      setLoginId(null)
      await onRefreshChatGpt()
    } catch {
      setActionError('logout-failed')
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <>
      <h3 className="set-pane-title">{t('setSecAiProvider')}</h3>
      <p className="set-pane-description">
        {CHATGPT_SUBSCRIPTION_ENABLED ? t('aiProviderChoose') : t('lmStudioEndpointHint')}
      </p>
      <div className="set-provider-picker" role="radiogroup" aria-label={t('setSecAiProvider')}>
        <button
          type="button"
          role="radio"
          aria-checked={aiProvider === 'lmstudio'}
          className={`set-provider-option${aiProvider === 'lmstudio' ? ' active' : ''}`}
          disabled={pendingAction === 'provider'}
          onClick={() => void changeProvider('lmstudio')}
          data-testid="provider-lmstudio"
        >
          <strong>OpenAI Endpoint</strong>
          <span>{t('aiProviderLmStudioHint')}</span>
        </button>
        {CHATGPT_SUBSCRIPTION_ENABLED && (
          <button
            type="button"
            role="radio"
            aria-checked={aiProvider === 'chatgpt'}
            className={`set-provider-option${aiProvider === 'chatgpt' ? ' active' : ''}`}
            disabled={pendingAction === 'provider'}
            onClick={() => void changeProvider('chatgpt')}
            data-testid="provider-chatgpt"
          >
            <strong>ChatGPT</strong>
            <span>{t('aiProviderChatGptHint')}</span>
          </button>
        )}
      </div>

      {aiProvider === 'lmstudio' || !CHATGPT_SUBSCRIPTION_ENABLED ? (
        <>
          <div className={`set-ai-status ${lmStudioState}`} data-testid="lmstudio-settings-status">
            <span className={`set-ai-status-dot ${lmStudioState}`} />
            <div className="set-ai-status-copy">
              <strong>OpenAI Endpoint</strong>
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
              required
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
                : lmStudioError === 'api-key-required'
                  ? t('lmStudioUnauthorized')
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
      ) : (
        <>
          <div
            className={`set-ai-status ${chatGptState}`}
            data-testid="chatgpt-settings-status"
            aria-live="polite"
          >
            <span className={`set-ai-status-dot ${chatGptState}`} />
            <div className="set-ai-status-copy">
              <strong>ChatGPT</strong>
              <span>{chatGptStatusText}</span>
            </div>
            <button
              className="set-btn"
              disabled={chatGptChecking || pendingAction !== null}
              onClick={() => void onRefreshChatGpt(chatGptConfig)}
              data-testid="chatgpt-refresh"
            >
              {t('lmStudioRefresh')}
            </button>
          </div>
          <p className="set-provider-explanation">{t('chatGptDescription')}</p>

          {chatGptStatus?.state === 'connected' && (
            <>
              <div className="set-chatgpt-account">
                <div>
                  <span>{t('chatGptAccount')}</span>
                  <strong>{chatGptStatus.account?.email || 'ChatGPT'}</strong>
                </div>
                <div>
                  <span>{t('chatGptPlan')}</span>
                  <strong>
                    {chatGptStatus.account?.planType
                      ? chatGptPlanLabel(chatGptStatus.account.planType)
                      : 'ChatGPT'}
                  </strong>
                </div>
              </div>
              <label className="set-control" htmlFor="chatgpt-model">
                <span className="set-field-label">{t('lmStudioModel')}</span>
                <select
                  id="chatgpt-model"
                  className="set-select set-select-wide"
                  data-testid="chatgpt-model"
                  disabled={chatGptConfigLoading || pendingAction !== null}
                  value={chatGptModelValue}
                  onChange={(event) => void changeChatGptModel(event.target.value)}
                >
                  <option value="">{t('lmStudioModelAutomatic')}</option>
                  {chatGptModels.map((model) => (
                    <option key={model.id} value={model.model}>
                      {model.displayName}
                    </option>
                  ))}
                </select>
                <span className="set-help">
                  {chatGptConfig.model || chatGptStatus.selectedModel || t('lmStudioModelAuto')}
                </span>
              </label>
              {rateLimitWindows.length > 0 && (
                <section className="set-chatgpt-usage" aria-label={t('chatGptUsage')}>
                  <h4>{t('chatGptUsage')}</h4>
                  {rateLimitWindows.map(({ key, limit, window, kind }) => {
                    const percent = clampChatGptUsagePercent(window.usedPercent)
                    const duration = formatChatGptWindowDuration(
                      window.windowDurationMins,
                      dateLocale,
                    )
                    const reset = formatChatGptResetTime(window.resetsAt, dateLocale)
                    return (
                      <div className="set-usage-row" key={key}>
                        <div className="set-usage-labels">
                          <strong>
                            {rateLimitLabel(limit, 'ChatGPT')} ·{' '}
                            {t(
                              kind === 'primary' ? 'chatGptPrimaryLimit' : 'chatGptSecondaryLimit',
                            )}
                            {duration ? ` · ${duration}` : ''}
                          </strong>
                          <span>
                            {limit.reached
                              ? t('chatGptRateLimited')
                              : t('chatGptUsagePercent', { percent })}
                          </span>
                        </div>
                        <progress max={100} value={percent} />
                        {reset && <small>{t('chatGptResetsAt', { time: reset })}</small>}
                      </div>
                    )
                  })}
                </section>
              )}
            </>
          )}

          {actionError && (
            <div className="set-message error" role="alert" data-testid="chatgpt-action-error">
              {t('chatGptOperationFailed')}
            </div>
          )}
          <div className="set-pane-footer">
            {loginId ? (
              <button
                className="set-btn"
                disabled={pendingAction !== null}
                onClick={() => void cancelLogin()}
                data-testid="chatgpt-cancel-login"
              >
                {t('cancel')}
              </button>
            ) : chatGptStatus?.state === 'connected' ? (
              <button
                className="set-btn danger"
                disabled={pendingAction !== null}
                onClick={() => void logout()}
                data-testid="chatgpt-sign-out"
              >
                {t('chatGptSignOut')}
              </button>
            ) : chatGptStatus?.state !== 'unavailable' ? (
              <button
                className="set-btn primary"
                disabled={pendingAction !== null}
                onClick={() => void startLogin()}
                data-testid="chatgpt-sign-in"
              >
                {pendingAction === 'login' ? t('lmStudioChecking') : t('chatGptSignIn')}
              </button>
            ) : null}
          </div>
        </>
      )}
    </>
  )
}
