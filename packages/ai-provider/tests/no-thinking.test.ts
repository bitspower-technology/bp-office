import { afterEach, describe, expect, it, vi } from 'vitest'
import { streamForProvider } from '../src/stream'
import { chatForProvider } from '../src/chat'
import { openAiNoThinkingFields, rejectsNoThinkingField } from '../src/no-thinking'
import { okResponse, sseStream, errorResponse } from './test-utils'

afterEach(() => {
  vi.unstubAllGlobals()
})

function sentBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  return JSON.parse(String(call[1].body)) as Record<string, unknown>
}

const okTurn = () =>
  okResponse(sseStream(['data: {"choices":[{"delta":{"content":"hi"},"finish_reason":"stop"}]}']))

/** Gemini and Claude stream their own event shapes, so each needs its own fixture. */
const okGeminiTurn = () =>
  okResponse(
    sseStream([
      'data: {"candidates":[{"content":{"parts":[{"text":"hi"}]},"finishReason":"STOP"}]}',
    ]),
  )

const okClaudeTurn = () =>
  okResponse(
    sseStream([
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}',
    ]),
  )

describe('no-thinking request policy', () => {
  it('maps each model family to the switch its vendor documents', () => {
    expect(openAiNoThinkingFields('gpt-5.6-terra')).toEqual({ reasoning_effort: 'none' })
    expect(openAiNoThinkingFields('openai/gpt-5.6-sol')).toEqual({ reasoning_effort: 'none' })
    expect(openAiNoThinkingFields('deepseek-v4-pro')).toEqual({ thinking: { type: 'disabled' } })
    expect(openAiNoThinkingFields('glm-5.3')).toEqual({ thinking: { type: 'disabled' } })
    expect(openAiNoThinkingFields('kimi-k3')).toEqual({ thinking: { type: 'disabled' } })
    expect(openAiNoThinkingFields('qwen3.8-max')).toEqual({
      enable_thinking: false,
      chat_template_kwargs: { enable_thinking: false },
    })
    // an unrecognised local model still gets the standard field
    expect(openAiNoThinkingFields('my-local-thing')).toEqual({ reasoning_effort: 'none' })
  })

  it('sends reasoning_effort=none on an OpenAI turn', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(okTurn()))
    vi.stubGlobal('fetch', fetchMock)
    await streamForProvider('openai', { apiKey: 'k', model: 'gpt-5.6' }, 'sys', [], [], 100, {
      signal: new AbortController().signal,
      onDelta: () => {},
      onToolCall: () => {},
    })
    expect(sentBody(fetchMock).reasoning_effort).toBe('none')
  })

  it('sends the thinking object to DeepSeek and keeps its registry extras', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(okTurn()))
    vi.stubGlobal('fetch', fetchMock)
    await streamForProvider(
      'deepseek',
      { apiKey: 'k', model: 'deepseek-v4-pro' },
      'sys',
      [],
      [],
      100,
      {
        signal: new AbortController().signal,
        onDelta: () => {},
        onToolCall: () => {},
      },
    )
    expect(sentBody(fetchMock).thinking).toEqual({ type: 'disabled' })
  })

  it('sends thinkingConfig on a Gemini turn', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(okGeminiTurn()))
    vi.stubGlobal('fetch', fetchMock)
    await streamForProvider(
      'gemini',
      { apiKey: 'k', model: 'gemini-3.7-flash' },
      'sys',
      [],
      [],
      100,
      {
        signal: new AbortController().signal,
        onDelta: () => {},
        onToolCall: () => {},
      },
    )
    expect(sentBody(fetchMock).generationConfig).toEqual({
      temperature: 0.3,
      maxOutputTokens: 100,
      includeThoughts: false,
      thinkingBudget: 0,
    })
  })

  it('sends thinking=disabled on a Claude turn', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(okClaudeTurn()))
    vi.stubGlobal('fetch', fetchMock)
    await streamForProvider(
      'anthropic',
      { apiKey: 'k', model: 'claude-sonnet-5' },
      'sys',
      [],
      [],
      100,
      {
        signal: new AbortController().signal,
        onDelta: () => {},
        onToolCall: () => {},
      },
    )
    expect(sentBody(fetchMock).thinking).toEqual({ type: 'disabled' })
  })

  it('retries once without the hint when an endpoint rejects the field', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() =>
        Promise.resolve(errorResponse(400, '{"error":"Unknown parameter: reasoning_effort"}')),
      )
      .mockImplementationOnce(() => Promise.resolve(okTurn()))
    vi.stubGlobal('fetch', fetchMock)
    const deltas: string[] = []
    await streamForProvider('openai', { apiKey: 'k', model: 'gpt-4o' }, 'sys', [], [], 100, {
      signal: new AbortController().signal,
      onDelta: (t) => deltas.push(t),
      onToolCall: () => {},
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(deltas).toEqual(['hi'])
    const retry = JSON.parse(
      String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body),
    ) as Record<string, unknown>
    expect(retry.reasoning_effort).toBeUndefined()
  })

  it('still surfaces an unrelated 400 instead of retrying', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(errorResponse(400, 'quota exceeded')))
    vi.stubGlobal('fetch', fetchMock)
    const res = await chatForProvider('openai', { apiKey: 'k', model: 'gpt-5.6' }, 'sys', 'hi')
    expect(res.ok).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('recognises the vendor spellings of a thinking-field rejection', () => {
    expect(rejectsNoThinkingField("Unsupported value: 'reasoning_effort'")).toBe(true)
    expect(rejectsNoThinkingField('thinking.enabled: disabled not supported')).toBe(true)
    expect(rejectsNoThinkingField('chat_template_kwargs is not accepted here')).toBe(true)
    expect(rejectsNoThinkingField('generationConfig.thinking_budget must be positive')).toBe(true)
    expect(rejectsNoThinkingField('invalid api key')).toBe(false)
  })
})
