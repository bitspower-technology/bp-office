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

describe('OpenAI Endpoint shell settings', () => {
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
    expect(() =>
      parseLmStudioConfig({ baseUrl: 'not a url', model: '', apiKey: 'test-key' }),
    ).toThrow(/Invalid OpenAI Endpoint base URL/)
    expect(() =>
      parseLmStudioConfig({
        baseUrl: 'http://localhost:1234',
        model: 'm'.repeat(513),
        apiKey: 'test-key',
      }),
    ).toThrow(/model is too long/)
    expect(() =>
      parseLmStudioConfig({ baseUrl: 'http://localhost:1234', model: '', apiKey: '' }),
    ).toThrow(/API key is required/)
    expect(() =>
      parseLmStudioConfig({
        baseUrl: 'http://localhost:1234',
        model: '',
        apiKey: 't'.repeat(8193),
      }),
    ).toThrow(/API key is too long/)
  })

  it('defaults missing settings and activates OpenAI Endpoint without dropping other providers', () => {
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
      apiKey: 'client-key',
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
  it('defaults the shell selector to OpenAI Endpoint and validates provider input', () => {
    const path = settingsPath()
    expect(readAiConnectionProvider(path)).toBe('lmstudio')
    expect(() => parseAiConnectionProvider('chatgpt')).toThrow(/only OpenAI Endpoint/)
    expect(() => parseAiConnectionProvider('openai')).toThrow(/Invalid AI provider/)
  })

  it('migrates ChatGPT to OpenAI Endpoint without deleting saved provider configurations', () => {
    const path = settingsPath()
    writeFileSync(
      path,
      JSON.stringify({
        provider: 'chatgpt',
        providers: {
          lmstudio: {
            baseUrl: 'http://localhost:1234/v1',
            model: 'local',
            apiKey: 'client-key',
          },
          chatgpt: { model: 'subscription-model' },
          openai: { apiKey: 'keep-me', model: 'gpt-test' },
        },
      }),
    )

    expect(readAiConnectionProvider(path)).toBe('lmstudio')
    expect(readLmStudioConfig(path)).toMatchObject({ model: 'local', apiKey: 'client-key' })
    expect(readChatGptConfig(path)).toEqual({ model: 'subscription-model' })
    expect(() => writeChatGptConfig(path, { model: 'gpt-subscription' })).toThrow(
      /only OpenAI Endpoint/,
    )
    const unchanged = JSON.parse(readFileSync(path, 'utf8')) as {
      provider?: unknown
      providers?: Record<string, unknown>
    }
    expect(unchanged.provider).toBe('chatgpt')
    expect(unchanged.providers?.openai).toEqual({ apiKey: 'keep-me', model: 'gpt-test' })
  })

  it('allows activating only OpenAI Endpoint', () => {
    const path = settingsPath()
    writeLmStudioConfig(path, {
      baseUrl: 'http://localhost:1234',
      model: 'local-model',
      apiKey: 'client-key',
    })
    expect(writeAiConnectionProvider(path, 'lmstudio')).toBe('lmstudio')
    expect(readAiConnectionProvider(path)).toBe('lmstudio')
    expect(readLmStudioConfig(path).model).toBe('local-model')
    expect(() => writeAiConnectionProvider(path, 'chatgpt')).toThrow(/only OpenAI Endpoint/)
  })

  it('rejects malformed or oversized ChatGPT configuration input', () => {
    expect(() => parseChatGptConfig(null)).toThrow(/Invalid ChatGPT configuration/)
    expect(() => parseChatGptConfig({ model: 42 })).toThrow(/must be a string/)
    expect(() => parseChatGptConfig({ model: 'm'.repeat(513) })).toThrow(/too long/)
  })
})
