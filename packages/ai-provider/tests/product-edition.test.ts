import { describe, expect, it } from 'vitest'
import { defaultAiSettings } from '../src/providers'
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
})
