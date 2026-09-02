import { describe, expect, it } from 'vitest'
import {
  AI_PROVIDER_ADAPTERS,
  getProviderAdapter,
  modelEchoesReasoning,
  modelLacksVision,
} from '../src/registry'
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
    expect(Object.keys(AI_PROVIDER_ADAPTERS).sort()).toEqual(AI_PROVIDERS.map((m) => m.id).sort())
  })

  it('registers OpenAI Endpoint as API-key-authenticated OpenAI-compatible', () => {
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
      auth: 'api-key',
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
      useMaxCompletionTokens: true,
    })
  })

  it('marks the GPT-5 family as fixed-sampling (rejects any non-default temperature)', () => {
    for (const model of ['gpt-5.6', 'gpt-5.6-terra', 'gpt-5.5', 'gpt-5.4-mini']) {
      expect(AI_PROVIDER_ADAPTERS.openai.resolveEndpoint(config(model))).toEqual({
        protocol: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        omitTemperature: true,
        useMaxCompletionTokens: true,
      })
    }
  })

  it('resolves the catalog additions to their OpenAI-compatible endpoints', () => {
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

describe('fixed-sampling models on indirect routes', () => {
  it('omits temperature for kimi-k3 via OpenRouter and via a custom endpoint', () => {
    expect(AI_PROVIDER_ADAPTERS.openrouter.resolveEndpoint(config('moonshotai/kimi-k3'))).toEqual({
      protocol: 'openai-compatible',
      baseUrl: 'https://openrouter.ai/api/v1',
      omitTemperature: true,
    })
    expect(
      AI_PROVIDER_ADAPTERS.custom.resolveEndpoint(config('kimi-k3', 'https://api.moonshot.cn/v1')),
    ).toEqual({
      protocol: 'openai-compatible',
      baseUrl: 'https://api.moonshot.cn/v1',
      omitTemperature: true,
    })
    expect(AI_PROVIDER_ADAPTERS.openrouter.resolveEndpoint(config('openrouter/auto'))).toEqual({
      protocol: 'openai-compatible',
      baseUrl: 'https://openrouter.ai/api/v1',
    })
  })

  it('omits temperature for gpt-5 via OpenRouter and via a custom endpoint', () => {
    expect(AI_PROVIDER_ADAPTERS.openrouter.resolveEndpoint(config('openai/gpt-5.6-sol'))).toEqual({
      protocol: 'openai-compatible',
      baseUrl: 'https://openrouter.ai/api/v1',
      omitTemperature: true,
    })
    expect(
      AI_PROVIDER_ADAPTERS.custom.resolveEndpoint(config('gpt-5.6-terra', 'https://mirror/v1')),
    ).toEqual({
      protocol: 'openai-compatible',
      baseUrl: 'https://mirror/v1',
      omitTemperature: true,
    })
  })
})

describe('modelLacksVision', () => {
  it('flags text-only DeepSeek V4 models but not the vision branch', () => {
    expect(modelLacksVision('deep-seek-v4-flash')).toBe(true)
    expect(modelLacksVision('deep-seek-v4-flash-baseten')).toBe(true)
    expect(modelLacksVision('deepseek-v4-pro')).toBe(true)
    expect(modelLacksVision('deepseek-v4-flash')).toBe(true)
    expect(modelLacksVision('deepseek-v4-flash-vision-exp')).toBe(false)
    expect(modelLacksVision('deep-seek-v4-flash-vision-exp-openrouter')).toBe(false)
    expect(modelLacksVision('claude-opus-4-7')).toBe(false)
  })
})

describe('modelEchoesReasoning', () => {
  it('flags interleaved-thinking families on any route, case-insensitively', () => {
    expect(modelEchoesReasoning('MiniMax-M3')).toBe(true)
    expect(modelEchoesReasoning('minimax-m2p7')).toBe(true)
    expect(modelEchoesReasoning('deep-seek-v4-flash')).toBe(true)
    expect(modelEchoesReasoning('deepseek-v4-pro')).toBe(true)
    expect(modelEchoesReasoning('gpt-5.6-luna')).toBe(false)
    expect(modelEchoesReasoning('kimi-k3')).toBe(false)
  })
})
