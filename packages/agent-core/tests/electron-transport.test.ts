import { describe, expect, it, vi } from 'vitest'
import {
  createIpcTransport,
  IPC_STREAM_SILENCE_TIMEOUT_MS,
  type IpcStreamChunk,
  type IpcStreamStart,
  type IpcToolResult,
} from '../src'

interface FakeSettings {
  provider: string
}

function setup(
  startImpl?: (request: IpcStreamStart<FakeSettings>) => void | Promise<unknown>,
  replyImpl?: (payload: IpcToolResult) => void | Promise<unknown>,
  networkErrorText?: () => string,
) {
  let listener: ((chunk: IpcStreamChunk) => void) | undefined
  const unsubscribe = vi.fn(() => {
    listener = undefined
  })
  const started: IpcStreamStart<FakeSettings>[] = []
  const cancelled: string[] = []
  const replied: IpcToolResult[] = []
  const transport = createIpcTransport<FakeSettings>({
    onStream: (l) => {
      listener = l
      return unsubscribe
    },
    start: (request) => {
      started.push(request)
      return startImpl?.(request)
    },
    cancel: (requestId) => cancelled.push(requestId),
    replyTool: (payload) => {
      replied.push(payload)
      return replyImpl?.(payload)
    },
    getSettings: () => ({ provider: 'lmstudio' }),
    unknownErrorText: () => 'unknown error',
    timeoutErrorText: () => 'timed out',
    ...(networkErrorText ? { networkErrorText } : {}),
  })
  const cb = {
    onDelta: vi.fn(),
    onReasoning: vi.fn(),
    onToolCall: vi.fn(),
    onToolRequest: vi.fn(async (call) => ({
      id: call.id,
      name: call.name,
      output: 'local result',
    })),
    onToolResultSent: vi.fn(),
    onStopReason: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
  }
  const handle = transport.stream({ system: 'sys', messages: [], tools: [] }, cb)
  const emit = (chunk: Omit<IpcStreamChunk, 'requestId'> & { requestId?: string }) =>
    listener?.({ requestId: started[0]!.requestId, ...chunk })
  return { started, cancelled, replied, cb, handle, emit, unsubscribe }
}

describe('createIpcTransport', () => {
  it('starts one request with settings and forwards deltas and tool calls', () => {
    const { started, cb, emit } = setup()
    expect(started).toHaveLength(1)
    expect(started[0]!.settings).toEqual({ provider: 'lmstudio' })
    expect(started[0]!.system).toBe('sys')

    emit({ type: 'delta', text: 'hi' })
    emit({ type: 'delta' })
    emit({ type: 'tool-call', toolCall: { id: 'c1', name: 'read', input: {} } })
    expect(cb.onDelta).toHaveBeenNthCalledWith(1, 'hi')
    expect(cb.onDelta).toHaveBeenNthCalledWith(2, '')
    expect(cb.onToolCall).toHaveBeenCalledWith({ id: 'c1', name: 'read', input: {} })
  })

  it('runs a mid-turn tool request and replies on the same stream request', async () => {
    const { started, replied, cb, emit } = setup()
    emit({ type: 'tool-request', toolCall: { id: 'c1', name: 'read', input: { page: 2 } } })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(cb.onToolRequest).toHaveBeenCalledWith({
      id: 'c1',
      name: 'read',
      input: { page: 2 },
    })
    expect(replied).toEqual([
      {
        requestId: started[0]!.requestId,
        result: { id: 'c1', name: 'read', output: 'local result' },
      },
    ])
    expect(cb.onToolCall).not.toHaveBeenCalled()
  })

  it('normalizes rejected or synchronously thrown tool executors into error results', async () => {
    const { replied, cb, emit } = setup()
    cb.onToolRequest.mockRejectedValueOnce(new Error('tool failed'))
    emit({ type: 'tool-request', toolCall: { id: 'c2', name: 'write', input: {} } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(replied[0]!.result).toMatchObject({ id: 'c2', output: 'tool failed', isError: true })

    cb.onToolRequest.mockImplementationOnce(() => {
      throw new Error('sync failure')
    })
    emit({ type: 'tool-request', toolCall: { id: 'c3', name: 'write', input: {} } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(replied[1]!.result).toMatchObject({ id: 'c3', output: 'sync failure', isError: true })
  })

  it('reports delivery only after the main process accepts the tool result', async () => {
    let acceptReply: (() => void) | undefined
    const { replied, cb, emit } = setup(
      undefined,
      () =>
        new Promise<void>((resolve) => {
          acceptReply = resolve
        }),
    )
    const call = { id: 'delivered', name: 'read', input: {} }
    emit({ type: 'tool-request', toolCall: call })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(replied).toHaveLength(1)
    expect(cb.onToolResultSent).not.toHaveBeenCalled()
    acceptReply!()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(cb.onToolResultSent).toHaveBeenCalledWith(call, replied[0]!.result)
  })

  it('cancels the stream if returning a mid-turn result fails', async () => {
    const { started, cancelled, cb, emit } = setup(undefined, () =>
      Promise.reject(new Error('late result')),
    )
    emit({ type: 'tool-request', toolCall: { id: 'c4', name: 'read', input: {} } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(cancelled).toEqual([started[0]!.requestId])
    expect(cb.onError).toHaveBeenCalledWith('late result')
    expect(cb.onToolResultSent).not.toHaveBeenCalled()
  })

  it('forwards reasoning chunks separately from text deltas', () => {
    const { cb, emit } = setup()
    emit({ type: 'reasoning', text: 'thinking…' })
    emit({ type: 'reasoning' }) // payload-less chunk carries nothing
    expect(cb.onReasoning).toHaveBeenCalledTimes(1)
    expect(cb.onReasoning).toHaveBeenCalledWith('thinking…')
    expect(cb.onDelta).not.toHaveBeenCalled()
  })

  it('ignores chunks for other requestIds', () => {
    const { cb, emit } = setup()
    emit({ requestId: 'someone-else', type: 'delta', text: 'nope' })
    expect(cb.onDelta).not.toHaveBeenCalled()
  })

  it('unsubscribes on done', () => {
    const { cb, emit, unsubscribe } = setup()
    emit({ type: 'done' })
    expect(cb.onDone).toHaveBeenCalledTimes(1)
    expect(cb.onStopReason).not.toHaveBeenCalled()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('forwards a stopReason carried on the done chunk before onDone', () => {
    const { cb, emit } = setup()
    emit({ type: 'done', stopReason: 'max_tokens' })
    expect(cb.onStopReason).toHaveBeenCalledWith('max_tokens')
    expect(cb.onDone).toHaveBeenCalledTimes(1)
  })

  it('maps error chunks to onError with the localized fallback', () => {
    const { cb, emit, unsubscribe } = setup()
    emit({ type: 'error' })
    expect(cb.onError).toHaveBeenCalledWith('unknown error')
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('cancel forwards the requestId to the bridge', () => {
    const { started, cancelled, handle } = setup()
    handle.cancel()
    expect(cancelled).toEqual([started[0]!.requestId])
  })

  it('maps a timeout error code to the localized timeout message', () => {
    const { cb, emit } = setup()
    emit({ type: 'error', error: 'AI request timed out: no data received', errorCode: 'timeout' })
    expect(cb.onError).toHaveBeenCalledWith('timed out')
  })

  it('maps a network error code to the localized network message', () => {
    const { cb, emit } = setup(undefined, undefined, () => 'network problem')
    emit({
      type: 'error',
      error: 'Claude fetch failed: fetch failed cause=ECONNRESET',
      errorCode: 'network',
    })
    expect(cb.onError).toHaveBeenCalledWith('network problem')
  })

  it('a network error code without networkErrorText falls back to the carried text', () => {
    const { cb, emit } = setup()
    emit({
      type: 'error',
      error: 'Claude fetch failed: fetch failed cause=ECONNRESET',
      errorCode: 'network',
    })
    expect(cb.onError).toHaveBeenCalledWith('Claude fetch failed: fetch failed cause=ECONNRESET')
  })

  it('fails the run after prolonged silence; pings re-arm the watchdog', () => {
    vi.useFakeTimers()
    try {
      const { cb, emit, started, cancelled } = setup()
      emit({ type: 'delta', text: 'x' })
      vi.advanceTimersByTime(IPC_STREAM_SILENCE_TIMEOUT_MS - 1)
      emit({ type: 'ping' })
      vi.advanceTimersByTime(IPC_STREAM_SILENCE_TIMEOUT_MS - 1)
      expect(cb.onError).not.toHaveBeenCalled()
      vi.advanceTimersByTime(IPC_STREAM_SILENCE_TIMEOUT_MS)
      expect(cb.onError).toHaveBeenCalledWith('timed out')
      expect(cancelled).toEqual([started[0]!.requestId])
    } finally {
      vi.useRealTimers()
    }
  })

  it('done disarms the silence watchdog', () => {
    vi.useFakeTimers()
    try {
      const { cb, emit } = setup()
      emit({ type: 'done' })
      vi.advanceTimersByTime(IPC_STREAM_SILENCE_TIMEOUT_MS * 2)
      expect(cb.onError).not.toHaveBeenCalled()
      expect(cb.onDone).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a rejected start fails the run instead of leaving it pending', async () => {
    const { cb } = setup(() => Promise.reject(new Error('no handler registered')))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(cb.onError).toHaveBeenCalledWith('no handler registered')
    expect(cb.onDone).not.toHaveBeenCalled()
  })
})
