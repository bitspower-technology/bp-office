import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LM_STUDIO_DEFAULT_BASE_URL,
  LM_STUDIO_STATUS_TIMEOUT_MS,
  checkLmStudioStatus,
  listLmStudioModels,
  normalizeLmStudioBaseUrl,
  resolveLmStudioModel,
  selectLmStudioModel,
} from '../src/lmstudio'
import type { LmStudioModel } from '../src/types'
import { errorResponse, jsonResponse } from './test-utils'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('normalizeLmStudioBaseUrl', () => {
  it('defaults to localhost, appends /v1 to server roots, and preserves /v1', () => {
    expect(normalizeLmStudioBaseUrl()).toBe(LM_STUDIO_DEFAULT_BASE_URL)
    expect(normalizeLmStudioBaseUrl('http://localhost:5555/')).toBe('http://localhost:5555/v1')
    expect(normalizeLmStudioBaseUrl('https://host.example/openai/v1/')).toBe(
      'https://host.example/openai/v1',
    )
  })

  it('rejects non-http protocols', () => {
    expect(() => normalizeLmStudioBaseUrl('file:///tmp/models')).toThrow(/HTTP or HTTPS/)
  })
})

describe('listLmStudioModels', () => {
  it('parses native metadata, filters embeddings, and sends Bearer auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        models: [
          {
            type: 'llm',
            key: 'tool-model',
            display_name: 'Tool Model',
            loaded_instances: [{ id: 'tool-model' }],
            capabilities: { vision: true, trained_for_tool_use: true },
          },
          {
            type: 'llm',
            key: 'idle-model',
            display_name: 'Idle Model',
            loaded_instances: [],
            capabilities: { vision: false, trained_for_tool_use: false },
          },
          { type: 'embedding', key: 'embed-model', display_name: 'Embed' },
        ],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      listLmStudioModels({ apiKey: 'test-key', model: '', baseUrl: 'http://localhost:1234' }),
    ).resolves.toEqual([
      {
        id: 'tool-model',
        displayName: 'Tool Model',
        loaded: true,
        toolCapable: true,
        vision: true,
      },
      {
        id: 'idle-model',
        displayName: 'Idle Model',
        loaded: false,
        toolCapable: false,
        vision: false,
      },
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:1234/api/v1/models',
      expect.objectContaining({ headers: { Authorization: 'Bearer test-key' } }),
    )
  })

  it('falls back to /v1/models for malformed native responses and filters embed ids', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ unexpected: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            { id: 'z-chat', object: 'model' },
            { id: 'nomic-embed-text', object: 'model' },
          ],
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      listLmStudioModels({ apiKey: 'token', model: '', baseUrl: 'http://localhost:1234/v1' }),
    ).resolves.toEqual([{ id: 'z-chat', displayName: 'z-chat', loaded: true }])
    expect(fetchMock.mock.calls[1]![0]).toBe('http://localhost:1234/v1/models')
    expect(fetchMock.mock.calls[1]![1].headers).toEqual({ Authorization: 'Bearer token' })
  })
})

describe('selectLmStudioModel', () => {
  const models: LmStudioModel[] = [
    { id: 'z-unloaded', displayName: 'Z', loaded: false },
    { id: 'b-loaded', displayName: 'B', loaded: true },
    { id: 'c-tool', displayName: 'C', loaded: true, toolCapable: true },
    { id: 'a-unloaded', displayName: 'A', loaded: false },
  ]

  it('uses configured, loaded tool-capable, loaded, then lexical order', () => {
    expect(selectLmStudioModel({ model: 'z-unloaded' }, models)).toBe('z-unloaded')
    expect(selectLmStudioModel({ model: '' }, models)).toBe('c-tool')
    expect(
      selectLmStudioModel(
        { model: '' },
        models.map((model) => ({ ...model, toolCapable: false })),
      ),
    ).toBe('b-loaded')
    expect(
      selectLmStudioModel(
        { model: '' },
        models.map((model) => ({ ...model, loaded: false })),
      ),
    ).toBe('a-unloaded')
  })

  it('resolves automatic selection and rejects embedding-only model lists', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            models: [
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
        .mockResolvedValueOnce(
          jsonResponse({ models: [{ type: 'embedding', key: 'embed-model' }] }),
        ),
    )

    await expect(resolveLmStudioModel({ apiKey: 'test-key', model: '' })).resolves.toBe(
      'tool-model',
    )
    await expect(resolveLmStudioModel({ apiKey: 'test-key', model: '' })).rejects.toThrow(
      /no chat models/i,
    )
  })
})

describe('checkLmStudioStatus', () => {
  it('returns connected with the selected discovered model', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
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
      ),
    )
    await expect(checkLmStudioStatus({ apiKey: 'test-key', model: '' })).resolves.toMatchObject({
      state: 'connected',
      selectedModel: 'local-model',
      baseUrl: LM_STUDIO_DEFAULT_BASE_URL,
    })
  })

  it('distinguishes no models, unauthorized, and unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ models: [] })))
    await expect(checkLmStudioStatus({ apiKey: 'test-key', model: '' })).resolves.toMatchObject({
      state: 'no-models',
      models: [],
    })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse(401, 'token required')))
    await expect(checkLmStudioStatus({ apiKey: 'bad-key', model: '' })).resolves.toMatchObject({
      state: 'unauthorized',
      models: [],
      error: expect.stringMatching(/401/),
    })

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')))
    await expect(checkLmStudioStatus({ apiKey: 'test-key', model: '' })).resolves.toMatchObject({
      state: 'unreachable',
      models: [],
      error: 'connection refused',
    })
  })

  it('falls back when a non-empty native list has an unrecognized schema', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ models: [{ type: 'llm', id: 'wrong-field' }] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'fallback-model' }] }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(checkLmStudioStatus({ apiKey: 'test-key', model: '' })).resolves.toMatchObject({
      state: 'connected',
      selectedModel: 'fallback-model',
    })
    expect(fetchMock.mock.calls[1]![0]).toBe(`${LM_STUDIO_DEFAULT_BASE_URL}/models`)
  })

  it('times out an unresponsive probe when no caller signal is supplied', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('probe aborted')))
        })
      }),
    )
    const status = checkLmStudioStatus({ apiKey: 'test-key', model: '' })
    await vi.advanceTimersByTimeAsync(LM_STUDIO_STATUS_TIMEOUT_MS)
    await expect(status).resolves.toMatchObject({ state: 'unreachable', error: 'probe aborted' })
  })
})
