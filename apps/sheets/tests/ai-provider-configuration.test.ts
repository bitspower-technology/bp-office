import { describe, expect, it } from 'vitest'
import { defaultAiSettings } from '@genoffice/ai-provider'
import { isAgentProviderConfigured } from '../src/renderer/ai/provider-configuration'

describe('isAgentProviderConfigured', () => {
  it('allows LM Studio to choose its model dynamically', () => {
    const lmStudio = defaultAiSettings()
    lmStudio.providers.lmstudio.model = ''
    expect(isAgentProviderConfigured(lmStudio)).toBe(true)

    // ChatGPT left the provider list, so a legacy selection has no catalog
    // slot and reads as unconfigured until settings resolve it to LM Studio.
    const chatGpt = defaultAiSettings()
    chatGpt.provider = 'chatgpt'
    expect(isAgentProviderConfigured(chatGpt)).toBe(false)
  })

  it('still requires a model and key for keyed cloud adapters', () => {
    const openAi = defaultAiSettings()
    openAi.provider = 'openai'
    openAi.providers.openai.model = ''
    openAi.providers.openai.apiKey = ''
    expect(isAgentProviderConfigured(openAi)).toBe(false)

    openAi.providers.openai.model = 'gpt-5'
    openAi.providers.openai.apiKey = 'test-key'
    expect(isAgentProviderConfigured(openAi)).toBe(true)
  })
})
