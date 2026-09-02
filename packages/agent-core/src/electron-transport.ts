import type {
  AgentStreamRequest,
  AgentToolCall,
  AgentToolDef,
  AgentToolResult,
  AgentTransport,
  AgentMessage,
} from './types'

/**
 * One streamed chunk pushed back over an Electron IPC bridge. Structurally
 * identical to ai-provider's AiStreamChunk; declared here so this package
 * stays dependency-free.
 */
export interface IpcStreamChunk {
  requestId: string
  /** 'ping' = wire-level keepalive; re-arms the silence watchdog and carries no payload;
   * 'reasoning' = model thinking delta (text carries it) */
  type: 'delta' | 'reasoning' | 'tool-call' | 'tool-request' | 'done' | 'error' | 'ping'
  text?: string
  toolCall?: AgentToolCall
  error?: string
  /** machine-readable error cause; maps to a localized timeout/network message */
  errorCode?: 'timeout' | 'network'
  /** normalized stop reason on 'done' ('max_tokens' = cut off by the token limit) */
  stopReason?: string
}

/** The request forwarded to the main process to start one streaming turn. */
export interface IpcStreamStart<S> {
  requestId: string
  settings: S
  system: string
  messages: AgentMessage[]
  tools: AgentToolDef[]
}

/** Result of a mid-turn tool request returned to the main-process provider. */
export interface IpcToolResult {
  requestId: string
  result: AgentToolResult
}

/**
 * Renderer-side silence watchdog: the main process re-arms it with keepalive
 * pings on wire activity, so firing means the turn is dead (main-process stall,
 * lost chunks) and the run must fail instead of leaving the UI busy forever.
 * Longer than the main-process idle timeout (180s) so that one (localized) wins.
 */
export const IPC_STREAM_SILENCE_TIMEOUT_MS = 240_000

export interface IpcTransportOptions<S> {
  /** subscribe to stream chunks; returns the unsubscribe function */
  onStream(listener: (chunk: IpcStreamChunk) => void): () => void
  /** forward the start request to the main process; a returned promise reports handler failure */
  start(request: IpcStreamStart<S>): void | Promise<unknown>
  /** abort the in-flight turn in the main process */
  cancel(requestId: string): void
  /** resolve a provider's mid-turn local tool request */
  replyTool?(payload: IpcToolResult): void | Promise<unknown>
  getSettings(): S
  /** localized fallback when an error chunk carries no message */
  unknownErrorText(): string
  /** localized message for timeouts (errorCode 'timeout' and the silence watchdog) */
  timeoutErrorText?(): string
  /** localized message for network connectivity failures (errorCode 'network') */
  networkErrorText?(): string
}

/**
 * AgentTransport over an Electron IPC bridge: the main process talks to the
 * LLM providers (avoids renderer CORS) and streams chunks back per requestId.
 * Each app wires in its own preload bridge and i18n via the options.
 */
export function createIpcTransport<S>(options: IpcTransportOptions<S>): AgentTransport {
  const timeoutText = () => options.timeoutErrorText?.() ?? options.unknownErrorText()
  return {
    stream(request: AgentStreamRequest, cb) {
      const requestId = crypto.randomUUID()
      let settled = false
      let silenceTimer: ReturnType<typeof setTimeout> | undefined
      const settle = () => {
        settled = true
        clearTimeout(silenceTimer)
        unsubscribe()
      }
      const fail = (error: string) => {
        if (settled) return
        settle()
        cb.onError(error)
      }
      const armSilence = () => {
        clearTimeout(silenceTimer)
        silenceTimer = setTimeout(() => {
          options.cancel(requestId)
          fail(timeoutText())
        }, IPC_STREAM_SILENCE_TIMEOUT_MS)
      }
      const unsubscribe = options.onStream((chunk) => {
        if (chunk.requestId !== requestId || settled) return
        if (chunk.type === 'ping') {
          armSilence()
        } else if (chunk.type === 'delta') {
          armSilence()
          cb.onDelta(chunk.text ?? '')
        } else if (chunk.type === 'reasoning') {
          armSilence()
          if (chunk.text) cb.onReasoning?.(chunk.text)
        } else if (chunk.type === 'tool-call') {
          armSilence()
          if (chunk.toolCall) cb.onToolCall(chunk.toolCall)
        } else if (chunk.type === 'tool-request') {
          // The provider waits for this response before continuing the same
          // turn. Pause wire-silence detection while the local editor tool runs.
          clearTimeout(silenceTimer)
          const call = chunk.toolCall
          if (!call) {
            options.cancel(requestId)
            fail(options.unknownErrorText())
            return
          }
          let run: Promise<AgentToolResult>
          try {
            run = cb.onToolRequest
              ? Promise.resolve(cb.onToolRequest(call))
              : Promise.resolve({
                  id: call.id,
                  name: call.name,
                  output: 'This client cannot execute mid-turn tool requests.',
                  isError: true,
                })
          } catch (err) {
            run = Promise.resolve({
              id: call.id,
              name: call.name,
              output: err instanceof Error ? err.message : String(err),
              isError: true,
            })
          }
          run
            .catch((err: unknown): AgentToolResult => ({
              id: call.id,
              name: call.name,
              output: err instanceof Error ? err.message : String(err),
              isError: true,
            }))
            .then((result) => {
              if (settled) return
              if (!options.replyTool) {
                options.cancel(requestId)
                fail(options.unknownErrorText())
                return
              }
              return Promise.resolve(options.replyTool({ requestId, result })).then(() => {
                cb.onToolResultSent?.(call, result)
                if (!settled) armSilence()
              })
            })
            .catch((err: unknown) => {
              if (!settled) {
                options.cancel(requestId)
                fail(err instanceof Error ? err.message : options.unknownErrorText())
              }
            })
        } else if (chunk.type === 'done') {
          settle()
          if (chunk.stopReason) cb.onStopReason?.(chunk.stopReason)
          cb.onDone()
        } else {
          settle()
          cb.onError(
            chunk.errorCode === 'timeout'
              ? timeoutText()
              : chunk.errorCode === 'network'
                ? (options.networkErrorText?.() ?? chunk.error ?? options.unknownErrorText())
                : (chunk.error ?? options.unknownErrorText()),
          )
        }
      })
      armSilence()
      try {
        // a rejected/thrown start would otherwise leave the run pending until the watchdog
        Promise.resolve(
          options.start({
            requestId,
            settings: options.getSettings(),
            system: request.system,
            messages: request.messages,
            tools: request.tools,
          }),
        ).catch((err: unknown) => {
          fail(err instanceof Error ? err.message : options.unknownErrorText())
        })
      } catch (err) {
        fail(err instanceof Error ? err.message : options.unknownErrorText())
      }
      return { cancel: () => options.cancel(requestId) }
    },
  }
}
