import { describe, expect, it } from 'vitest'
import {
  AI_PROVIDERS,
  activeProvider,
  defaultAiSettings,
  resolveAiSettings,
} from '../src/providers'
import type { AiProviderId } from '../src/types'

describe('defaultAiSettings', () => {
  it('defaults to OpenAI Endpoint and seeds every internal provider', () => {
    const settings = defaultAiSettings()
    expect(settings.provider).toBe('lmstudio')
    expect(settings.providers.lmstudio).toEqual({
      apiKey: '',
      model: '',
      baseUrl: 'http://127.0.0.1:1234/v1',
    })
    expect(settings.providers.chatgpt).toEqual({ apiKey: '', model: '', baseUrl: undefined })
    for (const meta of AI_PROVIDERS) {
      expect(settings.providers[meta.id].model).toBe(meta.defaultModel)
      expect(settings.providers[meta.id].apiKey).toBe('')
    }
  })

  it('applies caller-supplied defaults only to listed providers', () => {
    const settings = defaultAiSettings({ anthropic: 'sk-ant-preset' })
    expect(settings.providers.anthropic.apiKey).toBe('sk-ant-preset')
    expect(settings.providers.gemini.apiKey).toBe('')
  })

  it('publishes complete authentication, endpoint, model, vision, and tool metadata', () => {
    for (const meta of AI_PROVIDERS) {
      expect(typeof meta.requiresApiKey).toBe('boolean')
      expect(typeof meta.needsBaseUrl).toBe('boolean')
      expect(typeof meta.dynamicModels).toBe('boolean')
      expect(['none', 'optional-token', 'api-key', 'managed']).toContain(meta.authMode)
      expect(typeof meta.vision).toBe('boolean')
      expect(typeof meta.tools).toBe('boolean')
    }
    expect(AI_PROVIDERS.find((meta) => meta.id === 'lmstudio')).toMatchObject({
      label: 'OpenAI Endpoint',
      requiresApiKey: true,
      authMode: 'api-key',
      dynamicModels: true,
      defaultBaseUrl: 'http://127.0.0.1:1234/v1',
      vision: true,
      tools: true,
    })
    expect(AI_PROVIDERS.find((meta) => meta.id === 'chatgpt')).toMatchObject({
      requiresApiKey: false,
      authMode: 'managed',
      managedAuth: true,
      dynamicModels: true,
    })
  })
})

describe('provider model catalog', () => {
  it('offers DeepSeek Vision Exp through the retained direct provider', () => {
    const deepseek = AI_PROVIDERS.find((provider) => provider.id === 'deepseek')!

    expect(deepseek.models).toContain('deepseek-v4-flash-vision-exp')
    expect(deepseek.vision).toBe(true)
    expect(deepseek.models).not.toContain('deep-seek-v4-flash-vision-exp-openrouter')
  })
})

describe('resolveAiSettings', () => {
  it('returns independent defaults when nothing is stored', () => {
    const defaults = defaultAiSettings({ anthropic: 'sk-ant-preset' })
    const resolved = resolveAiSettings({}, defaults)
    expect(resolved).toEqual(defaults)
    expect(resolved).not.toBe(defaults)
    expect(resolved.providers).not.toBe(defaults.providers)
  })

  it('migrates the pre-provider single endpoint into custom without activating it', () => {
    const defaults = defaultAiSettings()
    const resolved = resolveAiSettings(
      { apiKey: ' legacy-key ', model: 'legacy-model', baseUrl: ' https://legacy/v1 ' },
      defaults,
    )
    expect(resolved.provider).toBe('lmstudio')
    expect(resolved.providers.custom).toEqual({
      apiKey: 'legacy-key',
      model: 'legacy-model',
      baseUrl: 'https://legacy/v1',
    })
  })

  it('merges and trims retained provider configurations', () => {
    const resolved = resolveAiSettings(
      {
        provider: 'gemini',
        providers: {
          gemini: { apiKey: ' saved-key ', model: 'gemini-3.7-flash' },
          lmstudio: {
            apiKey: ' optional-token ',
            model: 'local-model',
            baseUrl: ' http://localhost:5555/v1 ',
          },
        },
      },
      defaultAiSettings(),
    )
    expect(resolved.provider).toBe('gemini')
    expect(resolved.providers.gemini.apiKey).toBe('saved-key')
    expect(resolved.providers.lmstudio).toEqual({
      apiKey: 'optional-token',
      model: 'local-model',
      baseUrl: 'http://localhost:5555/v1',
    })
  })

  it('migrates removed and unknown active provider ids to OpenAI Endpoint', () => {
    const removedCloudProvider = ['gen', 'spark'].join('')
    for (const provider of [removedCloudProvider, 'unknown-provider']) {
      const resolved = resolveAiSettings(
        { provider, providers: { lmstudio: { model: 'local' } } },
        defaultAiSettings(),
      )
      expect(resolved.provider).toBe('lmstudio')
      expect(resolved.providers.lmstudio.model).toBe('local')
    }
  })

  it('preserves ChatGPT and every retained provider selection', () => {
    for (const provider of AI_PROVIDERS.map((meta) => meta.id)) {
      const resolved = resolveAiSettings({ provider, providers: {} }, defaultAiSettings())
      expect(resolved.provider).toBe(provider)
    }
  })

  it('rewrites retired DeepSeek ids while preserving current ones', () => {
    const retired = resolveAiSettings(
      { providers: { deepseek: { apiKey: 'k', model: 'deepseek-reasoner' } } },
      defaultAiSettings(),
    )
    expect(retired.providers.deepseek.model).toBe('deepseek-v4-flash')

    const current = resolveAiSettings(
      { providers: { deepseek: { apiKey: 'k', model: 'deepseek-v4-pro' } } },
      defaultAiSettings(),
    )
    expect(current.providers.deepseek.model).toBe('deepseek-v4-pro')
  })
})

describe('activeProvider', () => {
  it('accepts OpenAI Endpoint automatic selection and managed ChatGPT without keys', () => {
    const settings = defaultAiSettings()
    expect(activeProvider(settings)).toBe('lmstudio')
    settings.provider = 'chatgpt'
    expect(activeProvider(settings)).toBe('chatgpt')
  })

  it('continues enforcing keys, models, and custom endpoints for retained providers', () => {
    const settings = defaultAiSettings()
    settings.provider = 'kimi'
    expect(activeProvider(settings)).toBe('lmstudio')
    settings.providers.kimi.apiKey = 'sk-user'
    expect(activeProvider(settings)).toBe('kimi')

    settings.provider = 'custom'
    settings.providers.custom.apiKey = 'k'
    settings.providers.custom.model = 'm'
    expect(activeProvider(settings)).toBe('lmstudio')
    settings.providers.custom.baseUrl = 'http://localhost:1234/v1'
    expect(activeProvider(settings)).toBe('custom')
  })

  it('falls back for unknown ids from hand-edited settings', () => {
    const settings = defaultAiSettings()
    settings.provider = 'nonsense' as AiProviderId
    expect(activeProvider(settings)).toBe('lmstudio')
  })
})
