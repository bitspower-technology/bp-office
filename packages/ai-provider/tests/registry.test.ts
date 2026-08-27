import { describe, expect, it } from 'vitest'
import { AI_PROVIDER_ADAPTERS, getProviderAdapter } from '../src/registry'
import { AI_PROVIDERS } from '../src/providers'
import type { AiProviderConfig, AiProviderId } from '../src/types'

function config(model: string, baseUrl?: string): AiProviderConfig {
  return { apiKey: 'k', model, baseUrl }
}

describe('provider registry', () => {
  it('covers every internal provider with matching metadata', () => {
    for (const meta of AI_PROVIDERS) {
      expect(AI_PROVIDER_ADAPTERS[meta.id].meta).toBe(meta)
    }
    // ChatGPT stays registered outside the catalog so legacy settings ids keep a known shape.
    expect(Object.keys(AI_PROVIDER_ADAPTERS).sort()).toEqual(
      [...AI_PROVIDERS.map((m) => m.id), 'chatgpt'].sort(),
    )
  })

  it('registers LM Studio as optional-auth OpenAI-compatible', () => {
    expect(
      AI_PROVIDER_ADAPTERS.lmstudio.resolveEndpoint({
        model: 'local-model',
        baseUrl: 'http://localhost:5555',
      }),
    ).toEqual({
      protocol: 'openai-compatible',
      baseUrl: 'http://localhost:5555/v1',
    })
    expect(AI_PROVIDER_ADAPTERS.lmstudio.capabilities).toEqual({
      auth: 'optional-token',
      vision: true,
      tools: true,
    })
  })

  it('keeps ChatGPT managed and outside direct HTTP routing', () => {
    expect(AI_PROVIDER_ADAPTERS.chatgpt.capabilities.auth).toBe('managed')
    expect(() => AI_PROVIDER_ADAPTERS.chatgpt.resolveEndpoint({ model: '' })).toThrow(
      /ChatGptProviderService/,
    )
  })

  it('resolves retained direct providers to official endpoints', () => {
    expect(AI_PROVIDER_ADAPTERS.anthropic.resolveEndpoint(config('claude-sonnet-5'))).toEqual({
      protocol: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
    })
    expect(AI_PROVIDER_ADAPTERS.gemini.resolveEndpoint(config('gemini-3.7-flash'))).toEqual({
      protocol: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    })
    expect(AI_PROVIDER_ADAPTERS.deepseek.resolveEndpoint(config('deepseek-v4-pro'))).toEqual({
      protocol: 'openai-compatible',
      baseUrl: 'https://api.deepseek.com/v1',
      bodyExtras: { thinking: { type: 'disabled' } },
    })
    expect(AI_PROVIDER_ADAPTERS.openai.resolveEndpoint(config('gpt-5.6-terra'))).toEqual({
      protocol: 'openai-compatible',
      baseUrl: 'https://api.openai.com/v1',
      omitTemperature: true,
    })
  })

  it('resolves all catalog additions through OpenAI-compatible endpoints', () => {
    const cases: Array<[AiProviderId, string, string]> = [
      ['glm', 'glm-5.3', 'https://open.bigmodel.cn/api/paas/v4'],
      ['qwen', 'qwen3.8-max', 'https://dashscope.aliyuncs.com/compatible-mode/v1'],
      ['doubao', 'doubao-seed-2-1-pro-260628', 'https://ark.cn-beijing.volces.com/api/v3'],
      ['minimax', 'MiniMax-M3', 'https://api.minimax.io/v1'],
      ['xai', 'grok-4.6', 'https://api.x.ai/v1'],
      ['mistral', 'mistral-large-latest', 'https://api.mistral.ai/v1'],
      ['openrouter', 'openrouter/auto', 'https://openrouter.ai/api/v1'],
    ]
    for (const [id, model, baseUrl] of cases) {
      expect(AI_PROVIDER_ADAPTERS[id].resolveEndpoint(config(model))).toEqual({
        protocol: 'openai-compatible',
        baseUrl,
      })
    }
  })

  it('preserves fixed sampling and configurable mirror behavior', () => {
    expect(AI_PROVIDER_ADAPTERS.kimi.resolveEndpoint(config('kimi-k3'))).toEqual({
      protocol: 'openai-compatible',
      baseUrl: 'https://api.moonshot.ai/v1',
      omitTemperature: true,
    })
    expect(AI_PROVIDER_ADAPTERS.openrouter.resolveEndpoint(config('openai/gpt-5.6-sol'))).toEqual({
      protocol: 'openai-compatible',
      baseUrl: 'https://openrouter.ai/api/v1',
      omitTemperature: true,
    })
    expect(
      AI_PROVIDER_ADAPTERS.kimi.resolveEndpoint(config('kimi-k3', 'https://api.moonshot.cn/v1')),
    ).toEqual({
      protocol: 'openai-compatible',
      baseUrl: 'https://api.moonshot.cn/v1',
      omitTemperature: true,
    })
  })

  it('requires a configured URL for custom and rejects unknown ids', () => {
    expect(
      AI_PROVIDER_ADAPTERS.custom.resolveEndpoint(config('m', 'http://localhost:1234/v1')),
    ).toEqual({ protocol: 'openai-compatible', baseUrl: 'http://localhost:1234/v1' })
    expect(() => AI_PROVIDER_ADAPTERS.custom.resolveEndpoint(config('m'))).toThrow(/Base URL/)
    expect(() => getProviderAdapter('nonsense' as AiProviderId)).toThrow(
      'Unknown provider: nonsense',
    )
  })
})
