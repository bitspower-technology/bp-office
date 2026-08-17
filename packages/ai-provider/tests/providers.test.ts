import { describe, expect, it } from 'vitest'
import { LM_STUDIO_DEFAULT_BASE_URL } from '../src/lmstudio'
import { AI_PROVIDERS, defaultAiSettings, resolveAiSettings } from '../src/providers'

describe('defaultAiSettings', () => {
  it('uses local LM Studio with dynamic models and optional authentication', () => {
    const settings = defaultAiSettings()
    expect(settings.provider).toBe('lmstudio')
    expect(settings.providers.lmstudio).toEqual({
      apiKey: '',
      model: '',
      baseUrl: LM_STUDIO_DEFAULT_BASE_URL,
    })
    expect(AI_PROVIDERS.find((provider) => provider.id === 'lmstudio')).toMatchObject({
      requiresApiKey: false,
      dynamicModels: true,
    })
    for (const meta of AI_PROVIDERS) {
      expect(settings.providers[meta.id].apiKey).toBe('')
      expect(settings.providers[meta.id].model).toBe(meta.defaultModel)
    }
  })

  it('applies caller-supplied default keys only to listed providers', () => {
    const settings = defaultAiSettings({ anthropic: 'sk-ant-preset' })
    expect(settings.providers.anthropic.apiKey).toBe('sk-ant-preset')
    expect(settings.providers.lmstudio.apiKey).toBe('')
  })
})

describe('resolveAiSettings', () => {
  it('returns a detached copy of fresh defaults when nothing is stored', () => {
    const defaults = defaultAiSettings({ anthropic: 'sk-ant-preset' })
    const resolved = resolveAiSettings({}, defaults)
    expect(resolved).toEqual(defaults)
    expect(resolved).not.toBe(defaults)
    expect(resolved.providers).not.toBe(defaults.providers)
  })

  it('migrates the pre-provider single-endpoint shape into custom', () => {
    const defaults = defaultAiSettings()
    const resolved = resolveAiSettings(
      { apiKey: 'legacy-key', model: 'legacy-model', baseUrl: 'https://legacy.example.com/v1' },
      defaults,
    )
    expect(resolved.providers.custom).toEqual({
      apiKey: 'legacy-key',
      model: 'legacy-model',
      baseUrl: 'https://legacy.example.com/v1',
    })
    expect(resolved.provider).toBe('lmstudio')
  })

  it('migrates removed and unknown provider ids to LM Studio without carrying their model', () => {
    for (const provider of ['genspark', 'future-cloud']) {
      const resolved = resolveAiSettings(
        {
          provider,
          providers: {
            [provider]: { apiKey: 'cloud-key', model: 'cloud-model' },
          },
        },
        defaultAiSettings(),
      )
      expect(resolved.provider).toBe('lmstudio')
      expect(resolved.providers.lmstudio.model).toBe('')
      expect(resolved.providers.lmstudio.apiKey).toBe('')
    }
  })

  it('preserves a stored LM Studio config while migrating the selected provider', () => {
    const resolved = resolveAiSettings(
      {
        provider: 'genspark',
        providers: {
          genspark: { apiKey: 'old', model: 'cloud-model' },
          lmstudio: {
            apiKey: 'local-token',
            model: 'local-model',
            baseUrl: 'http://localhost:5555/v1',
          },
        },
      },
      defaultAiSettings(),
    )
    expect(resolved.provider).toBe('lmstudio')
    expect(resolved.providers.lmstudio).toEqual({
      apiKey: 'local-token',
      model: 'local-model',
      baseUrl: 'http://localhost:5555/v1',
    })
  })

  it('preserves known selected providers and merges their saved config', () => {
    const defaults = defaultAiSettings({ anthropic: 'preset-key' })
    const resolved = resolveAiSettings(
      {
        provider: 'gemini',
        providers: { gemini: { apiKey: 'stored-key', model: 'gemini-2.5-pro' } },
      },
      defaults,
    )
    expect(resolved.provider).toBe('gemini')
    expect(resolved.providers.gemini).toEqual({
      apiKey: 'stored-key',
      model: 'gemini-2.5-pro',
      baseUrl: undefined,
    })
    expect(resolved.providers.anthropic.apiKey).toBe('preset-key')
  })
})
