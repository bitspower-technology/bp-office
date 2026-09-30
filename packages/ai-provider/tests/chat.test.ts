import { afterEach, describe, expect, it, vi } from 'vitest'
import { chatForProvider } from '../src/chat'
import { MAX_RESPONSE_BODY_BYTES } from '../src/protocols/shared'
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
      '<!doctype html>\n<html>\n<head><title>Service</title></head><body>app shell</body></html>'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse(403, html)))
    const result = await chatForProvider('anthropic', { apiKey: 'k', model: 'm' }, 'sys', 'hi')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/Claude HTTP 403/)
    expect(result.error).toMatch(/web page.*instead of an API response/)
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
    await chatForProvider('deepseek', { apiKey: 'k', model: 'deepseek-v4-pro' }, 'sys', 'hi')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepseek.com/v1/chat/completions',
      expect.anything(),
    )
  })

  it('deepseek: sends the listed V4.1 Flash name under the vendor wire id', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }))
    vi.stubGlobal('fetch', fetchMock)
    await chatForProvider('deepseek', { apiKey: 'k', model: 'deep-seek-v4.1-flash' }, 'sys', 'hi')
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.model).toBe('deepseek-flash')
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

  it('OpenAI Endpoint requires an API key before model discovery', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(chatForProvider('lmstudio', { model: '' }, 'sys', 'hi')).resolves.toEqual({
      ok: false,
      error: 'OpenAI Endpoint requires an API key',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('OpenAI Endpoint discovers the model and authenticates every request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          models: [
            {
              type: 'llm',
              key: 'local-model',
              loaded_instances: [{ id: 'instance' }],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: 'local reply' } }] }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await chatForProvider(
      'lmstudio',
      { apiKey: 'client-key', model: '' },
      'sys',
      'hi',
    )
    expect(result).toEqual({ ok: true, content: 'local reply' })
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://127.0.0.1:1234/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer client-key' }),
      }),
    )
    expect(
      fetchMock.mock.calls.every((call) => call[1].headers.Authorization === 'Bearer client-key'),
    ).toBe(true)
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body as string).model).toBe('local-model')
  })

  it('OpenAI Endpoint sends the configured API key', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          models: [
            {
              type: 'llm',
              key: 'local-model',
              loaded_instances: [{ id: 'instance' }],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: 'ok' } }] }))
    vi.stubGlobal('fetch', fetchMock)
    await chatForProvider(
      'lmstudio',
      { apiKey: ' local-token ', model: 'local-model' },
      'sys',
      'hi',
    )
    for (const call of fetchMock.mock.calls) {
      expect(call[1].headers).toMatchObject({ Authorization: 'Bearer local-token' })
    }
  })

  it('opencode: a one-shot call gets its own x-opencode-session', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => jsonResponse({ choices: [{ message: { content: 'ok' } }] }))
    vi.stubGlobal('fetch', fetchMock)
    await chatForProvider('opencode-go', { apiKey: 'k', model: 'kimi-k2.7-code' }, 'sys', 'hi')
    await chatForProvider('opencode-go', { apiKey: 'k', model: 'kimi-k2.7-code' }, 'sys', 'hi')
    const first = (fetchMock.mock.calls[0]![1].headers as Record<string, string>)[
      'x-opencode-session'
    ]
    const second = (fetchMock.mock.calls[1]![1].headers as Record<string, string>)[
      'x-opencode-session'
    ]
    expect(first).toMatch(/^[0-9a-f-]{36}$/)
    expect(second).not.toBe(first)
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

  it('returns a capped error for an oversized one-shot body', async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_RESPONSE_BODY_BYTES + 1))
      },
      cancel() {
        cancelled = true
      },
    })
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(body, { headers: { 'content-type': 'application/json' } })),
    )

    const result = await chatForProvider(
      'openai',
      { apiKey: 'k', model: 'gpt-4.1-mini' },
      'sys',
      'hi',
    )

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/Response body exceeded/) })
    expect(cancelled).toBe(true)
  })

  it('anthropic: a 200 with an HTML body is an error, not a thrown SyntaxError', async () => {
    const html = '<!doctype html><html><body>gateway</body></html>'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(html, { status: 200 })))
    const result = await chatForProvider('anthropic', { apiKey: 'k', model: 'm' }, 'sys', 'hi')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/non-JSON response/)
    expect(result.error).toMatch(/web page.*instead of an API response/)
  })

  it('openai: a 200 with an empty body is an error, not a thrown SyntaxError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 200 })))
    const result = await chatForProvider(
      'openai',
      { apiKey: 'k', model: 'gpt-4.1-mini' },
      'sys',
      'hi',
    )
    expect(result).toEqual({ ok: false, error: 'AI returned a non-JSON response: ' })
  })
})
