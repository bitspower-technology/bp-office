import { afterEach, describe, expect, it, vi } from 'vitest'
import { chatForProvider } from '../src/chat'
import { errorResponse, jsonResponse } from './test-utils'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('chatForProvider', () => {
  it('anthropic: extracts joined text content blocks', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          content: [
            { type: 'text', text: 'hello ' },
            { type: 'text', text: 'world' },
          ],
        }),
      ),
    )
    const result = await chatForProvider(
      'anthropic',
      { apiKey: 'k', model: 'claude-sonnet-5' },
      'sys',
      'hi',
    )
    expect(result).toEqual({ ok: true, content: 'hello world' })
  })

  it('anthropic: surfaces HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse(401, 'bad key')))
    const result = await chatForProvider('anthropic', { apiKey: 'k', model: 'm' }, 'sys', 'hi')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/Claude HTTP 401/)
  })

  it('anthropic: replaces an HTML error body with a readable note', async () => {
    const html =
      '<!doctype html>\n<html>\n<head><title>Provider</title></head><body>app shell</body></html>'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse(403, html)))
    const result = await chatForProvider('anthropic', { apiKey: 'k', model: 'm' }, 'sys', 'hi')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/Claude HTTP 403/)
    expect(result.error).toMatch(/web page instead of an API response/)
    expect(result.error).not.toContain('<!doctype')
  })

  it('gemini: extracts joined parts text', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ candidates: [{ content: { parts: [{ text: 'hi there' }] } }] }),
        ),
    )
    const result = await chatForProvider(
      'gemini',
      { apiKey: 'k', model: 'gemini-2.5-flash' },
      'sys',
      'hi',
    )
    expect(result).toEqual({ ok: true, content: 'hi there' })
  })

  it('deepseek and openai hit their fixed base URLs', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }))
    vi.stubGlobal('fetch', fetchMock)
    await chatForProvider('deepseek', { apiKey: 'k', model: 'deepseek-chat' }, 'sys', 'hi')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepseek.com/v1/chat/completions',
      expect.anything(),
    )
  })

  it('custom: uses the configured base URL', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }))
    vi.stubGlobal('fetch', fetchMock)
    await chatForProvider(
      'custom',
      { apiKey: 'k', model: 'm', baseUrl: 'https://my-endpoint.example.com/v1' },
      'sys',
      'hi',
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'https://my-endpoint.example.com/v1/chat/completions',
      expect.anything(),
    )
  })

  it('custom: rejects without a base URL, without calling fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const result = await chatForProvider('custom', { apiKey: 'k', model: 'm' }, 'sys', 'hi')
    expect(result).toEqual({ ok: false, error: 'A custom provider requires a Base URL' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('lmstudio: uses the local OpenAI-compatible endpoint without auth by default', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          models: [
            {
              type: 'llm',
              key: 'local-model',
              display_name: 'Local Model',
              loaded_instances: [{ id: 'local-model' }],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: 'ok' } }] }))
    vi.stubGlobal('fetch', fetchMock)
    await chatForProvider('lmstudio', { model: 'local-model' }, 'sys', 'hi')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:1234/v1/chat/completions',
      expect.anything(),
    )
    expect(fetchMock.mock.calls.every((call) => !('Authorization' in call[1].headers))).toBe(true)
  })

  it('lmstudio: normalizes a server root and sends optional token auth', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          models: [
            {
              type: 'llm',
              key: 'local-model',
              display_name: 'Local Model',
              loaded_instances: [{ id: 'local-model' }],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: 'ok' } }] }))
    vi.stubGlobal('fetch', fetchMock)
    await chatForProvider(
      'lmstudio',
      { apiKey: 'local-token', model: 'local-model', baseUrl: 'http://localhost:5555' },
      'sys',
      'hi',
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:5555/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer local-token' }),
      }),
    )
    expect(
      fetchMock.mock.calls.every((call) => call[1].headers.Authorization === 'Bearer local-token'),
    ).toBe(true)
  })

  it('lmstudio: resolves an empty automatic model to a loaded tool-capable LLM', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          models: [
            {
              type: 'llm',
              key: 'plain-model',
              display_name: 'Plain Model',
              loaded_instances: [{ id: 'plain-model' }],
              capabilities: { trained_for_tool_use: false },
            },
            {
              type: 'llm',
              key: 'tool-model',
              display_name: 'Tool Model',
              loaded_instances: [{ id: 'tool-model' }],
              capabilities: { trained_for_tool_use: true },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: 'ok' } }] }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(chatForProvider('lmstudio', { model: '' }, 'sys', 'hi')).resolves.toEqual({
      ok: true,
      content: 'ok',
    })
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body as string)).toMatchObject({
      model: 'tool-model',
    })
  })

  it('treats an empty response body as an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: {} }] })))
    const result = await chatForProvider(
      'openai',
      { apiKey: 'k', model: 'gpt-4.1-mini' },
      'sys',
      'hi',
    )
    expect(result).toEqual({ ok: false, error: 'AI returned an empty response' })
  })
})
