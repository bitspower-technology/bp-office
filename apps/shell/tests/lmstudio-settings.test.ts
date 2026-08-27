import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  normalizeLmStudioBaseUrl,
  parseAiConnectionProvider,
  parseChatGptConfig,
  parseLmStudioConfig,
  redactLmStudioStatusError,
  readAiConnectionProvider,
  readChatGptConfig,
  readLmStudioConfig,
  writeAiConnectionProvider,
  writeChatGptConfig,
  writeLmStudioConfig,
} from '../src/main/lmstudio-settings'

let dir = ''

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = ''
})

function settingsPath(): string {
  dir = mkdtempSync(join(tmpdir(), 'lmstudio-settings-'))
  return join(dir, 'ai-settings.json')
}

describe('LM Studio shell settings', () => {
  it('normalizes a bare local origin to the OpenAI-compatible /v1 root', () => {
    expect(normalizeLmStudioBaseUrl(' http://127.0.0.1:1234/ ')).toBe('http://127.0.0.1:1234/v1')
    expect(normalizeLmStudioBaseUrl('https://studio.example.test/api/v1/')).toBe(
      'https://studio.example.test/api/v1',
    )
    expect(normalizeLmStudioBaseUrl('https://studio.example.test/api/')).toBe(
      'https://studio.example.test/api/v1',
    )
  })

  it('rejects unsafe or malformed renderer input', () => {
    expect(() => normalizeLmStudioBaseUrl('file:///tmp/models')).toThrow(/http or https/)
    expect(() => normalizeLmStudioBaseUrl('http://user:pass@localhost:1234/v1')).toThrow(
      /credentials/,
    )
    expect(() => normalizeLmStudioBaseUrl('http://localhost:1234/v1?token=secret')).toThrow(/query/)
    expect(() => parseLmStudioConfig({ baseUrl: 'not a url', model: '', apiKey: '' })).toThrow(
      /Invalid LM Studio base URL/,
    )
    expect(() =>
      parseLmStudioConfig({ baseUrl: 'http://localhost:1234', model: 'm'.repeat(513), apiKey: '' }),
    ).toThrow(/model is too long/)
    expect(() =>
      parseLmStudioConfig({
        baseUrl: 'http://localhost:1234',
        model: '',
        apiKey: 't'.repeat(8193),
      }),
    ).toThrow(/token is too long/)
  })

  it('defaults missing settings and activates LM Studio without dropping other providers', () => {
    const path = settingsPath()
    expect(readLmStudioConfig(path)).toEqual({
      baseUrl: 'http://127.0.0.1:1234/v1',
      model: '',
      apiKey: '',
    })

    writeFileSync(
      path,
      JSON.stringify({
        provider: 'openai',
        providers: { openai: { apiKey: 'keep-me', model: 'gpt-test' } },
      }),
    )
    expect(
      writeLmStudioConfig(path, {
        baseUrl: 'http://localhost:1234/v1/',
        model: 'local-model',
        apiKey: 'token',
      }),
    ).toEqual({
      baseUrl: 'http://localhost:1234/v1',
      model: 'local-model',
      apiKey: 'token',
    })

    const stored = JSON.parse(readFileSync(path, 'utf8')) as {
      provider?: unknown
      providers?: Record<string, unknown>
    }
    expect(stored.provider).toBe('lmstudio')
    expect(stored.providers?.openai).toEqual({ apiKey: 'keep-me', model: 'gpt-test' })
    expect(stored.providers?.lmstudio).toEqual({
      baseUrl: 'http://localhost:1234/v1',
      model: 'local-model',
      apiKey: 'token',
    })
  })

  it('preserves automatic model selection as an empty saved model', () => {
    const path = settingsPath()
    writeLmStudioConfig(path, {
      baseUrl: 'http://localhost:1234',
      model: '',
      apiKey: '',
    })

    expect(readLmStudioConfig(path).model).toBe('')
    const stored = JSON.parse(readFileSync(path, 'utf8')) as {
      provider?: unknown
      providers?: Record<string, unknown>
    }
    expect(stored.provider).toBe('lmstudio')
    expect(stored.providers?.lmstudio).toMatchObject({ model: '' })
  })

  it('redacts an echoed API token from status errors', () => {
    const status = redactLmStudioStatusError(
      {
        state: 'unauthorized',
        baseUrl: 'http://localhost:1234/v1',
        models: [],
        error: 'Authorization failed for secret-token at the server',
      },
      'secret-token',
    )
    expect(status.error).toBe('Authorization failed for [redacted] at the server')
    expect(JSON.stringify(status)).not.toContain('secret-token')
  })
})

describe('AI connection provider shell settings', () => {
  it('defaults the shell selector to LM Studio and validates provider input', () => {
    const path = settingsPath()
    expect(readAiConnectionProvider(path)).toBe('lmstudio')
    expect(parseAiConnectionProvider('chatgpt')).toBe('chatgpt')
    expect(() => parseAiConnectionProvider('openai')).toThrow(/Invalid AI provider/)
  })

  it('surfaces LM Studio for a stored ChatGPT selection and migrates writes', () => {
    const path = settingsPath()
    writeFileSync(
      path,
      JSON.stringify({
        provider: 'chatgpt',
        providers: {
          lmstudio: { baseUrl: 'http://localhost:1234/v1', model: 'local', apiKey: '' },
        },
      }),
    )

    expect(readAiConnectionProvider(path)).toBe('lmstudio')
    expect(writeAiConnectionProvider(path, 'chatgpt')).toBe('lmstudio')

    const stored = JSON.parse(readFileSync(path, 'utf8')) as { provider?: unknown }
    expect(stored.provider).toBe('lmstudio')
  })

  it('persists ChatGPT model selection without dropping LM Studio or retained providers', () => {
    const path = settingsPath()
    writeFileSync(
      path,
      JSON.stringify({
        provider: 'lmstudio',
        providers: {
          lmstudio: { baseUrl: 'http://localhost:1234/v1', model: 'local', apiKey: '' },
          openai: { apiKey: 'keep-me', model: 'gpt-test' },
        },
      }),
    )

    expect(writeChatGptConfig(path, { model: 'gpt-subscription' })).toEqual({
      model: 'gpt-subscription',
    })
    expect(readChatGptConfig(path)).toEqual({ model: 'gpt-subscription' })

    const stored = JSON.parse(readFileSync(path, 'utf8')) as {
      provider?: unknown
      providers?: Record<string, unknown>
    }
    expect(stored.provider).toBe('chatgpt')
    expect(stored.providers?.lmstudio).toMatchObject({ model: 'local' })
    expect(stored.providers?.openai).toEqual({ apiKey: 'keep-me', model: 'gpt-test' })
    expect(stored.providers?.chatgpt).toMatchObject({ model: 'gpt-subscription' })
  })

  it('switches providers without changing their saved configurations', () => {
    const path = settingsPath()
    writeLmStudioConfig(path, {
      baseUrl: 'http://localhost:1234',
      model: 'local-model',
      apiKey: '',
    })
    writeChatGptConfig(path, { model: 'chatgpt-model' })

    expect(writeAiConnectionProvider(path, 'lmstudio')).toBe('lmstudio')
    expect(readAiConnectionProvider(path)).toBe('lmstudio')
    expect(readLmStudioConfig(path).model).toBe('local-model')
    expect(readChatGptConfig(path).model).toBe('chatgpt-model')
  })

  it('rejects malformed or oversized ChatGPT configuration input', () => {
    expect(() => parseChatGptConfig(null)).toThrow(/Invalid ChatGPT configuration/)
    expect(() => parseChatGptConfig({ model: 42 })).toThrow(/must be a string/)
    expect(() => parseChatGptConfig({ model: 'm'.repeat(513) })).toThrow(/too long/)
  })
})
