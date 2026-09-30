import { describe, expect, it } from 'vitest'
import { AI_PROVIDERS, defaultAiSettings } from '../src/providers'
import type { AiProviderId } from '../src/types'
import {
  CHATGPT_SUBSCRIPTION_ENABLED,
  ENDPOINT_ONLY_EDITION,
  assertProductAiProviderEnabled,
  constrainAiSettingsToProduct,
  isProductAiProviderEnabled,
} from '../src/product-edition'

describe('OEM AI provider boundary', () => {
  it('enables only OpenAI Endpoint', () => {
    expect(ENDPOINT_ONLY_EDITION).toBe(true)
    expect(CHATGPT_SUBSCRIPTION_ENABLED).toBe(false)
    expect(isProductAiProviderEnabled('lmstudio')).toBe(true)
    expect(isProductAiProviderEnabled('chatgpt')).toBe(false)
    expect(isProductAiProviderEnabled('openai')).toBe(false)
    expect(() => assertProductAiProviderEnabled('chatgpt')).toThrow(/only OpenAI Endpoint/)
  })

  it('migrates unsupported active providers while preserving their stored settings', () => {
    const settings = defaultAiSettings()
    settings.provider = 'chatgpt'
    settings.providers.chatgpt.model = 'subscription-model'
    const constrained = constrainAiSettingsToProduct(settings)

    expect(constrained.provider).toBe('lmstudio')
    expect(constrained.providers.chatgpt.model).toBe('subscription-model')
    expect(settings.provider).toBe('chatgpt')
  })

  it.each([
    ...AI_PROVIDERS.filter((provider) => provider.id !== 'lmstudio').map((provider) => provider.id),
    'genspark',
    'unknown-provider',
  ])('cannot activate the persisted or renderer-supplied provider %s', (provider) => {
    const settings = { ...defaultAiSettings(), provider: provider as AiProviderId }
    expect(constrainAiSettingsToProduct(settings).provider).toBe('lmstudio')
    expect(() => assertProductAiProviderEnabled(provider as AiProviderId)).toThrow(
      /only OpenAI Endpoint/,
    )
    expect(settings.provider).toBe(provider)
  })
})
