import { afterEach, describe, expect, it, vi } from 'vitest'
import { chatForProvider } from '../src/chat'
import { assertAiContextBudget } from '../src/context-budget'
import { streamForProvider } from '../src/stream'

afterEach(() => vi.unstubAllGlobals())

describe('authorized model context', () => {
  it('allows inputs below 130K estimated tokens and rejects larger UTF-8 payloads', () => {
    expect(() => assertAiContextBudget({ text: 'a'.repeat(519_000) })).not.toThrow()
    expect(() => assertAiContextBudget({ text: 'a'.repeat(520_000) })).toThrow(/130K-token/)
    expect(() => assertAiContextBudget({ text: '字'.repeat(174_000) })).toThrow(/130K-token/)
  })

  it('blocks an oversized one-shot request before fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(
      await chatForProvider('lmstudio', { apiKey: 'key', model: 'm' }, 'sys', 'x'.repeat(520_000)),
    ).toMatchObject({ ok: false, error: expect.stringContaining('130K-token') })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('blocks an oversized streaming request including tool schemas before fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      streamForProvider(
        'lmstudio',
        { apiKey: 'key', model: 'm' },
        'sys',
        [],
        [{ name: 'tool', description: 'x'.repeat(520_000), inputSchema: { type: 'object' } }],
        32768,
        {
          signal: new AbortController().signal,
          onDelta: () => {},
          onToolCall: () => {},
        },
      ),
    ).rejects.toThrow(/130K-token/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
