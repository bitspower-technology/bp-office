import { describe, expect, it } from 'vitest'
import {
  AI_PROVIDERS,
  DEFAULT_MAX_OUTPUT_TOKENS,
  MAX_MAX_OUTPUT_TOKENS,
  MIN_MAX_OUTPUT_TOKENS,
  activeProvider,
  clampMaxOutputTokens,
  defaultAiSettings,
  maxOutputTokensOf,
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
  it('offers DeepSeek V4.1 Flash through the retained direct provider', () => {
    const deepseek = AI_PROVIDERS.find((provider) => provider.id === 'deepseek')!

    expect(deepseek.models).toContain('deep-seek-v4.1-flash')
    expect(deepseek.vision).toBe(true)
    expect(deepseek.models).not.toContain('deep-seek-v4-flash-vision-exp-openrouter')
  })

  it('does not register cloud login or unisolated CLI providers', () => {
    expect(AI_PROVIDERS.map((provider) => provider.id)).not.toContain(['gen', 'spark'].join(''))
    expect(AI_PROVIDERS.map((provider) => provider.id)).not.toContain('codex')
  })

  it('keeps Responses-only models out of the OpenCode tiers (no such protocol yet)', () => {
    for (const id of ['opencode-zen', 'opencode-go'] as const) {
      const meta = AI_PROVIDERS.find((provider) => provider.id === id)!
      expect(meta.models).toContain(meta.defaultModel)
      expect(meta.needsBaseUrl).toBe(false)
      for (const model of meta.models) {
        expect(model).not.toMatch(/^(gpt-|grok-|muse-spark-)/)
      }
    }
  })

  it('seeds Requesty with managed policy ids (short names, no vendor prefix)', () => {
    const requesty = AI_PROVIDERS.find((provider) => provider.id === 'requesty')!
    expect(requesty.models).toContain(requesty.defaultModel)
    expect(requesty.needsBaseUrl).toBe(false)
    for (const model of requesty.models) {
      expect(model).not.toContain('/')
    }
  })

  it('seeds Opper with pool ids (bare names, no vendor prefix)', () => {
    const opper = AI_PROVIDERS.find((provider) => provider.id === 'opper')!
    expect(opper.models).toContain(opper.defaultModel)
    expect(opper.needsBaseUrl).toBe(false)
    for (const model of opper.models) {
      expect(model).not.toContain('/')
    }
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
    expect(retired.providers.deepseek.model).toBe('deep-seek-v4.1-flash')

    const current = resolveAiSettings(
      { providers: { deepseek: { apiKey: 'k', model: 'deepseek-v4-pro' } } },
      defaultAiSettings(),
    )
    expect(current.providers.deepseek.model).toBe('deepseek-v4-pro')
  })

  it('carries a stored output cap and clamps a hand-edited one', () => {
    // a multi-provider file (the legacy single-endpoint shape returns defaults wholesale)
    const stored = { providers: {} as never }
    expect(
      resolveAiSettings({ ...stored, maxOutputTokens: 32768 }, defaultAiSettings()).maxOutputTokens,
    ).toBe(32768)
    // a settings file edited by hand must not forward an absurd budget to the endpoint
    expect(
      resolveAiSettings({ ...stored, maxOutputTokens: 1 }, defaultAiSettings()).maxOutputTokens,
    ).toBe(MIN_MAX_OUTPUT_TOKENS)
    expect(
      resolveAiSettings({ ...stored, maxOutputTokens: 1e9 }, defaultAiSettings()).maxOutputTokens,
    ).toBe(MAX_MAX_OUTPUT_TOKENS)
    // absent stays absent: pre-existing settings files keep the default behaviour
    expect('maxOutputTokens' in resolveAiSettings(stored, defaultAiSettings())).toBe(false)
  })
})

describe('maxOutputTokensOf', () => {
  it('falls back to the default when the setting is absent or unusable', () => {
    expect(maxOutputTokensOf({})).toBe(DEFAULT_MAX_OUTPUT_TOKENS)
    expect(maxOutputTokensOf(undefined)).toBe(DEFAULT_MAX_OUTPUT_TOKENS)
    expect(maxOutputTokensOf({ maxOutputTokens: Number.NaN })).toBe(DEFAULT_MAX_OUTPUT_TOKENS)
    expect(maxOutputTokensOf({ maxOutputTokens: '8192' as unknown as number })).toBe(
      DEFAULT_MAX_OUTPUT_TOKENS,
    )
  })

  it('honors a stored cap inside the bounds', () => {
    expect(maxOutputTokensOf({ maxOutputTokens: 16384 })).toBe(16384)
    expect(maxOutputTokensOf({ maxOutputTokens: 3.7 })).toBe(MIN_MAX_OUTPUT_TOKENS)
    expect(maxOutputTokensOf({ maxOutputTokens: 20000 })).toBe(20000)
  })
})

describe('clampMaxOutputTokens', () => {
  it('floors, bounds and defaults whatever the settings field or the input box held', () => {
    expect(clampMaxOutputTokens(16384.9)).toBe(16384)
    expect(clampMaxOutputTokens(0)).toBe(MIN_MAX_OUTPUT_TOKENS)
    expect(clampMaxOutputTokens(5e6)).toBe(MAX_MAX_OUTPUT_TOKENS)
    expect(clampMaxOutputTokens(Number.POSITIVE_INFINITY)).toBe(DEFAULT_MAX_OUTPUT_TOKENS)
    expect(clampMaxOutputTokens(undefined)).toBe(DEFAULT_MAX_OUTPUT_TOKENS)
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
