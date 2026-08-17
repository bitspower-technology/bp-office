import { describe, expect, it } from 'vitest'
import { aiSettingsInputSchema } from '../src/shared/desktop-api'

describe('aiSettingsInputSchema', () => {
  it('defaults an omitted LM Studio token to an empty string', () => {
    const settings = aiSettingsInputSchema.parse({
      provider: 'lmstudio',
      providers: {
        lmstudio: {
          model: 'local-model',
          baseUrl: 'http://127.0.0.1:1234/v1',
        },
      },
    })

    expect(settings.providers.lmstudio?.apiKey).toBe('')
  })

  it('preserves an optional LM Studio token when supplied', () => {
    const settings = aiSettingsInputSchema.parse({
      provider: 'lmstudio',
      providers: {
        lmstudio: {
          apiKey: 'local-token',
          model: 'local-model',
        },
      },
    })

    expect(settings.providers.lmstudio?.apiKey).toBe('local-token')
  })
})
