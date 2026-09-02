import { describe, expect, it } from 'vitest'
import { defaultAiSettings } from '@genoffice/ai-provider'
import { isAgentProviderConfigured } from '../src/renderer/ai/provider-configuration'

describe('isAgentProviderConfigured', () => {
  it('allows dynamic models while still requiring the endpoint API key', () => {
    const chatGpt = defaultAiSettings()
    chatGpt.provider = 'chatgpt'
    chatGpt.providers.chatgpt.model = ''
    expect(isAgentProviderConfigured(chatGpt)).toBe(true)

    const lmStudio = defaultAiSettings()
    lmStudio.providers.lmstudio.model = ''
    lmStudio.providers.lmstudio.apiKey = ''
    expect(isAgentProviderConfigured(lmStudio)).toBe(false)

    lmStudio.providers.lmstudio.apiKey = 'client-key'
    expect(isAgentProviderConfigured(lmStudio)).toBe(true)
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
