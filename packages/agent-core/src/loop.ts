import type { AgentSkill, ExecutedToolCall } from './skill'
import type {
  AgentImage,
  AgentMessage,
  AgentStreamHandle,
  AgentToolCall,
  AgentToolResult,
  AgentTransport,
  ToolExecution,
} from './types'

export interface ToolExecutedEvent<TSnapshot> {
  call: AgentToolCall
  execution: ToolExecution
  /**
   * Snapshot captured just before this tool ran; present only on the first
   * mutating tool of a run (hook for one-click rollback UIs).
   */
  snapshotBefore?: TSnapshot | undefined
}

export interface AgentRunResult {
  /** final assistant text of the run ('' when cut off) */
  text: string
  cancelled: boolean
  /** true when maxTurns was reached; text is the partial answer from the no-tools finalizing turn */
  turnLimit: boolean
  /** the final turn hit the token limit (stop_reason max_tokens): text is incomplete; set only when true */
  truncated?: boolean
}

export interface AgentLoopEvents<TSnapshot> {
  /** cumulative assistant text of the current turn (call per delta) */
  onText?(text: string): void
  /** a tool is about to execute (UI shows a live "running" indicator; onToolExecuted always follows) */
  onToolStart?(call: AgentToolCall): void
  onToolExecuted?(event: ToolExecutedEvent<TSnapshot>): void
  /** a turn requested tools and they ran; the loop is going back to the model */
  onTurnEnd?(): void
  onDone?(result: AgentRunResult): void
  onError?(error: string): void
}

/** Context compaction config (budget tracked in UTF-8 bytes rather than message count) */
export interface CompactionOptions {
  /** History size that triggers compaction (default 1 MiB, roughly 256K tokens) */
  maxBytes?: number
  /** Recent history kept after compaction (default 384 KiB, cut at a user boundary) */
  keepRecentBytes?: number
  /** Disable LLM summarization and use only the mechanical digest (for tests/offline) */
  disableLlmSummary?: boolean
}

export interface AgentLoopOptions<TSnapshot = unknown> {
  transport: AgentTransport
  skill: AgentSkill
  events?: AgentLoopEvents<TSnapshot>
  /** hard cap on model round-trips and managed-provider tool attempts per run */
  maxTurns?: number
  /** history cap in messages, trimmed at user-turn boundaries (default 512) */
  maxHistory?: number
  /** Context compaction; false disables it (enabled by default with default thresholds) */
  compaction?: CompactionOptions | false
  /** capture rollback state; invoked right before tools run (see snapshotBefore) */
  captureSnapshot?(): TSnapshot
  /** wrap instruction + skill context into the user message text */
  formatUserMessage?(instruction: string, context: string): string
  /** appended to the system prompt each turn (e.g. reply-language directive following the UI language) */
  systemSuffix?(): string
}

/** Tool-call round budget used by the shipped document editors. */
export const EDITOR_AGENT_MAX_TURNS = 200

// Approximate 256K model tokens at four UTF-8 bytes per token while retaining
// roughly the newest 96K tokens verbatim after compaction.
const COMPACT_MAX_BYTES = 1024 * 1024
const COMPACT_KEEP_RECENT_BYTES = 384 * 1024
/** Pre-truncation of each tool output in the summary request (the compaction request itself must not blow up on huge outputs) */
const SUMMARIZE_TOOL_OUTPUT_MAX = 2_000
const SUMMARIZE_TIMEOUT_MS = 30_000
/** When over budget mid-run, keep the last N tool messages verbatim and truncate earlier outputs to this length */
const STALE_TOOL_KEEP_RECENT = 2
const STALE_TOOL_OUTPUT_MAX = 1_000

/** Cap on consecutive tool-input parse failures (a successful parse resets it); abort beyond it (keeps the model from burning turns on bad JSON) */
const MAX_INPUT_PARSE_RETRIES = 3

/**
 * Backoff schedule for in-place same-turn retries on empty-stream errors.
 * The "(empty stream)" suffix is a cross-layer contract with the ai-provider
 * protocols: the gateway closed the SSE stream without content, tool calls, or
 * message framing — a transient soft-failure. The turn produced nothing and
 * history is untouched, so re-sending the identical request is idempotent;
 * retrying here keeps one gateway hiccup from killing a long multi-tool run.
 */
const EMPTY_STREAM_RETRY_DELAYS_MS = [1_000, 3_000]

const TURN_LIMIT_NOTE =
  '[System] The tool-call turn limit for this request has been reached; no more tools may be called this turn. ' +
  'Answer directly from the information already gathered; if the task is unfinished, briefly state what is done and what remains.'

const DYNAMIC_TOOL_LIMIT_RESULT =
  'The tool-call limit for this request has been reached; this tool was not executed. ' +
  'Do not call any more tools. Answer directly from the information already gathered; if the task is unfinished, briefly state what is done and what remains.'

/**
 * Terminal assistant text when tools mutated the artifact (or an edits-only
 * turn was restored) and the model returned no prose. Must be non-empty so
 * provider message converters never emit empty assistant content, which breaks
 * multi-turn follow-ups (see finishTurn / restore).
 * Exported so apps can substitute a localized / tool-derived summary in the UI.
 */
export const COMPLETED_VIA_TOOLS_TEXT = '(completed tool actions; no text reply)'

const SUMMARIZE_SYSTEM =
  'You are a conversation compressor. Compress this editing session between the user and the AI assistant into a concise summary so later turns can continue with context. ' +
  "Keep: the user's goals and key instructions, completed changes (which files/pages/elements were modified), important facts and data, and outstanding items. " +
  'For specific figures/statistics, mark their provenance: figures from the user or tool results keep their source; figures the assistant produced without a source must be marked "(unverified)" so later turns do not treat them as established facts. ' +
  'Omit: pleasantries, tool-call details, and intermediate trial and error. Use a bullet list of at most 400 words. Write the summary in the same language as the conversation. Output only the summary body, with no preamble.'

/** Prefix of the synthetic user message that carries the compacted-history summary */
const COMPACT_SUMMARY_PREFIX = '[Summary of earlier conversation'
const COMPACT_SUMMARY_HEADER = '[Summary of earlier conversation (auto-compacted)]'
const COMPACT_SUMMARY_ACK = 'Understood, continuing from the progress so far.'

function contextBudgetError(totalBytes: number, maxBytes: number): string {
  const limit =
    maxBytes % (1024 * 1024) === 0
      ? `${maxBytes / (1024 * 1024)} MiB`
      : maxBytes % 1024 === 0
        ? `${maxBytes / 1024} KiB`
        : `${maxBytes} bytes`
  return (
    `This AI request is too large for the ${limit} context budget ` +
    `(${totalBytes} estimated bytes), even after compacting earlier history. ` +
    'Shorten the instruction, reduce attached images, or narrow the document/context, then try again.'
  )
}

/** Approximate UTF-8 byte count (ASCII 1 byte, CJK etc. 3; surrogate pairs count as 6 — slight overestimate is harmless) */
function utf8Size(s: string): number {
  let n = 0
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : 3
  }
  return n
}

/** Approximate byte cost of one message (text + tool inputs/outputs + image base64) */
function messageSize(m: AgentMessage): number {
  if (m.role === 'tool') {
    return m.results.reduce((n, r) => n + utf8Size(r.output) + 40, 0)
  }
  let n = utf8Size(m.text)
  if (m.role === 'user' && m.images) {
    n += m.images.reduce((s, img) => s + img.base64.length, 0)
  }
  if (m.role === 'assistant' && m.toolCalls) {
    for (const c of m.toolCalls) {
      try {
        n += utf8Size(JSON.stringify(c.input)) + 40
      } catch {
        n += 40
      }
    }
  }
  return n
}

function historySize(messages: readonly AgentMessage[]): number {
  return messages.reduce((n, m) => n + messageSize(m), 0)
}

/** Mechanical digest when LLM summarization is unavailable: bullet list of user instructions + final replies */
function mechanicalDigest(dropped: readonly AgentMessage[]): string {
  const lines: string[] = []
  for (const m of dropped) {
    if (m.role === 'user' && !m.text.startsWith(COMPACT_SUMMARY_PREFIX)) {
      lines.push(`- User: ${m.text.slice(0, 200)}`)
    } else if (m.role === 'assistant' && m.text && !m.toolCalls?.length) {
      lines.push(`  Reply: ${m.text.slice(0, 200)}`)
    }
  }
  return lines.join('\n').slice(0, 4_000) || '(earlier conversation omitted)'
}

/**
 * Generic ReAct loop: user message -> model turn (text + tool calls) ->
 * execute tools -> feed results back -> repeat until the model answers with
 * plain text. History persists across runs, so follow-up questions work.
 */
export class AgentLoop<TSnapshot = unknown> {
  private readonly options: AgentLoopOptions<TSnapshot>
  private history: AgentMessage[] = []
  private handle: AgentStreamHandle | null = null
  private running = false
  private cancelled = false
  private turns = 0
  /** Finalizing turn after hitting the turn limit: no tools, let the model answer from what it has read */
  private finalizing = false
  private mutationSeen = false
  private inputParseFails = 0
  /** client-executed tool attempts within the current provider-managed turn */
  private dynamicToolExecutions = 0
  /** suppress repeated history/UI spam if a model ignores the hard-limit result */
  private dynamicLimitReported = false
  /** over-limit replies whose confirmed delivery must terminate the managed turn */
  private dynamicLimitStopCallIds = new Set<string>()
  /** the managed provider turn is being interrupted after an over-limit reply */
  private dynamicLimitStopping = false
  /** preserve the editors' established sequential tool execution semantics */
  private dynamicToolQueue: Promise<void> = Promise.resolve()
  /** invalidates queued dynamic calls when this run moves to a new provider turn */
  private turnSerial = 0
  private turnStopReason: string | null = null
  private turnText = ''
  private toolCalls: AgentToolCall[] = []
  /** tools actually executed during this run, fed to skill.verifyResponse */
  private executedCalls: ExecutedToolCall[] = []
  /** verifyResponse may force one extra corrective turn per run — never more */
  private verifyRetryUsed = false
  /** user message of the in-flight run; a failed run rolls it (and everything after) back out of history */
  private runUserMsg: AgentMessage | null = null
  /** invalidates stale transport callbacks after cancel/reset */
  private generation = 0
  /** per-run abort: aborted on cancel(); long tools use it to break internal loops */
  private abortController: AbortController | null = null

  constructor(options: AgentLoopOptions<TSnapshot>) {
    this.options = options
  }

  get busy(): boolean {
    return this.running
  }

  get messages(): readonly AgentMessage[] {
    return this.history
  }

  /**
   * Seed the conversation with restored history (e.g. transcript reloaded from
   * disk when a document reopens), so follow-up instructions keep their context.
   * No-op unless the loop is idle with an empty history.
   * Old messages over the compaction budget fold into a mechanical digest
   * (no LLM request on restore, guaranteeing zero latency).
   */
  restore(messages: readonly AgentMessage[]): void {
    if (this.running || this.history.length > 0 || messages.length === 0) return
    // Edits-only runs persist an assistant message with no text; give it a placeholder
    // so the turn stays paired and providers never see an empty assistant content block
    const normalized = messages.map((m) =>
      m.role === 'assistant' && !m.text ? { ...m, text: COMPLETED_VIA_TOOLS_TEXT } : m,
    )
    // Unanswered user messages (a failed or interrupted run persisted them without a
    // reply) must not re-enter the model context: trailing ones would pair with the
    // next instruction as one turn, adjacent ones read as a combined instruction
    this.history = normalized.filter(
      (m, i) => m.role !== 'user' || (normalized[i + 1] && normalized[i + 1]!.role !== 'user'),
    )
    if (this.history.length === 0) return
    if (this.compactionEnabled()) {
      const { maxBytes, keepRecentBytes } = this.compactBudget()
      if (historySize(this.history) > maxBytes) {
        const cut = this.findCompactCut(keepRecentBytes)
        if (cut > 0) {
          const digest = mechanicalDigest(this.history.slice(0, cut))
          this.history = [
            { role: 'user', text: `${COMPACT_SUMMARY_HEADER}\n${digest}` },
            { role: 'assistant', text: COMPACT_SUMMARY_ACK },
            ...this.history.slice(cut),
          ]
        }
      }
    }
    this.trimHistory()
  }

  /** images: inline attachments for this user turn (vision input; see AgentImage) */
  run(instruction: string, images?: AgentImage[]): void {
    if (this.running || !instruction) return
    this.running = true
    this.cancelled = false
    this.turns = 0
    this.finalizing = false
    this.mutationSeen = false
    this.inputParseFails = 0
    this.dynamicToolExecutions = 0
    this.dynamicLimitReported = false
    this.dynamicLimitStopCallIds.clear()
    this.dynamicLimitStopping = false
    this.dynamicToolQueue = Promise.resolve()
    this.executedCalls = []
    this.verifyRetryUsed = false
    this.abortController = new AbortController()
    const context = this.options.skill.buildContext?.() ?? ''
    const format =
      this.options.formatUserMessage ??
      ((instr: string, ctx: string) => (ctx ? `${instr}\n\n${ctx}` : instr))
    const userMsg: AgentMessage = {
      role: 'user',
      text: format(instruction, context),
      ...(images?.length ? { images } : {}),
    }
    void this.beginRun(userMsg)
  }

  /** Compact (if needed), account for the pending user/context message, then start the turn. */
  private async beginRun(userMsg: AgentMessage): Promise<void> {
    const generation = this.generation
    if (userMsg.role === 'user') {
      userMsg = { ...userMsg, text: sanitizeAgentPayload(userMsg.text) }
    }
    try {
      await this.maybeCompact(userMsg)
    } catch {
      // Mechanical fallback normally keeps compaction non-throwing. The final
      // projected-size check below fails closed if an unexpected error leaves
      // the outbound request above budget.
    }
    if (generation !== this.generation) return // reset during compaction
    if (this.cancelled) {
      this.running = false
      this.options.events?.onDone?.({ text: '', cancelled: true, turnLimit: false })
      return
    }
    // Leftover unanswered user message (a previous run failed before replying):
    // drop it so the model never sees two adjacent user turns as one combined instruction
    while (this.history.at(-1)?.role === 'user') this.history.pop()
    this.trimHistory()
    if (this.compactionEnabled()) {
      const { maxBytes } = this.compactBudget()
      const totalBytes = historySize(this.history) + messageSize(userMsg)
      if (totalBytes > maxBytes) {
        this.running = false
        this.runUserMsg = null
        this.options.events?.onError?.(contextBudgetError(totalBytes, maxBytes))
        return
      }
    }
    this.runUserMsg = userMsg
    this.history.push(userMsg)
    this.startTurn()
  }

  /**
   * A run failed: remove its user message and every message after it, so the
   * failed instruction can't be silently re-executed by the next run.
   */
  private rollbackFailedRun(): void {
    const msg = this.runUserMsg
    this.runUserMsg = null
    if (!msg) return
    const i = this.history.lastIndexOf(msg)
    if (i >= 0) this.history.splice(i)
  }

  // ── Context compaction: fold old conversation into a summary, keep recent messages verbatim ──

  private compactionEnabled(): boolean {
    return this.options.compaction !== false
  }

  private compactBudget(): { maxBytes: number; keepRecentBytes: number } {
    const opt = this.options.compaction === false ? undefined : this.options.compaction
    return {
      maxBytes: opt?.maxBytes ?? COMPACT_MAX_BYTES,
      keepRecentBytes: opt?.keepRecentBytes ?? COMPACT_KEEP_RECENT_BYTES,
    }
  }

  /**
   * Find the compaction cut at a user boundary: accumulate from the tail up to keepRecentBytes.
   * Returns the start index of the kept segment; if no suitable boundary exists,
   * fall back to keeping the last user turn.
   */
  private findCompactCut(keepRecentBytes: number): number {
    let kept = 0
    let cut = -1
    for (let i = this.history.length - 1; i >= 0; i--) {
      kept += messageSize(this.history[i]!)
      if (kept > keepRecentBytes && cut >= 0) break
      if (this.history[i]!.role === 'user') cut = i
    }
    if (cut < 0) {
      for (let i = this.history.length - 1; i >= 0; i--) {
        if (this.history[i]!.role === 'user') return i
      }
    }
    return cut
  }

  private async maybeCompact(pendingMessage?: AgentMessage): Promise<void> {
    if (!this.compactionEnabled()) return
    const { maxBytes, keepRecentBytes } = this.compactBudget()
    const projectedBytes =
      historySize(this.history) + (pendingMessage ? messageSize(pendingMessage) : 0)
    if (projectedBytes <= maxBytes) return
    const cut = this.findCompactCut(keepRecentBytes)
    if (cut < 0 || this.history.length === 0) return
    // A single prior turn can itself be larger than the verbatim-retention
    // target. Once a pending message tips the projected request over budget,
    // fold that whole turn instead of rejecting an otherwise compactable
    // follow-up. The final projected-size check still fails closed when the
    // pending editor context alone is too large.
    const foldAll = cut === 0 && pendingMessage !== undefined
    if (cut === 0 && !foldAll) return
    const dropped = foldAll ? this.history : this.history.slice(0, cut)
    const opt = this.options.compaction === false ? undefined : this.options.compaction
    let summary: string | null = null
    if (!opt?.disableLlmSummary) summary = await this.summarizeViaLlm(dropped)
    if (!summary) summary = mechanicalDigest(dropped)
    this.history = [
      { role: 'user', text: `${COMPACT_SUMMARY_HEADER}\n${summary}` },
      { role: 'assistant', text: COMPACT_SUMMARY_ACK },
      ...(foldAll ? [] : this.history.slice(cut)),
    ]
  }

  /** Hand the folded conversation to the model for a summary; returns null on failure/timeout (falls back to the mechanical digest). */
  private summarizeViaLlm(dropped: readonly AgentMessage[]): Promise<string | null> {
    // Slim down the summary request itself: pre-truncate tool outputs, strip images
    const slim: AgentMessage[] = dropped.map((m) => {
      if (m.role === 'tool') {
        return {
          role: 'tool' as const,
          results: m.results.map((r) => ({
            ...r,
            output: r.output.slice(0, SUMMARIZE_TOOL_OUTPUT_MAX),
          })),
        }
      }
      if (m.role === 'user' && m.images?.length) return { role: 'user' as const, text: m.text }
      return m
    })
    return new Promise((resolve) => {
      let text = ''
      let settled = false
      const finish = (v: string | null) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(v)
      }
      const timer = setTimeout(() => finish(null), SUMMARIZE_TIMEOUT_MS)
      try {
        // Attach to this.handle so cancel() can abort the summary request when the user clicks stop
        this.handle = this.options.transport.stream(
          {
            system: SUMMARIZE_SYSTEM,
            messages: [
              ...slim,
              { role: 'user', text: 'Compress the conversation above as instructed.' },
            ],
            tools: [],
          },
          {
            onDelta: (t) => {
              text += t
            },
            onToolCall: () => {
              /* the summary turn gets no tools */
            },
            onDone: () => finish(text.trim() || null),
            onError: () => finish(null),
          },
        )
      } catch {
        finish(null)
      }
    })
  }

  /**
   * When over budget mid-run (between tool turns), truncate stale tool outputs:
   * keep structure (tool_use/tool_result pairs intact), cut content only,
   * and keep the most recent N verbatim.
   */
  private squashStaleToolOutputs(): void {
    if (!this.compactionEnabled()) return
    const { maxBytes } = this.compactBudget()
    if (historySize(this.history) <= maxBytes) return
    let recent = 0
    for (let i = this.history.length - 1; i >= 0; i--) {
      const m = this.history[i]!
      if (m.role !== 'tool') continue
      recent++
      if (recent <= STALE_TOOL_KEEP_RECENT) continue
      m.results = m.results.map((r) =>
        r.output.length > STALE_TOOL_OUTPUT_MAX
          ? {
              ...r,
              output: `${r.output.slice(0, STALE_TOOL_OUTPUT_MAX)}\n…(output truncated: too long)`,
            }
          : r,
      )
    }
  }

  cancel(): void {
    if (!this.running) return
    this.cancelled = true
    // abort lets long tools mid-execution (internal LLM loops etc.) stop promptly
    this.abortController?.abort()
    // the transport emits onDone after aborting, which finalizes the run
    this.handle?.cancel()
  }

  /** drop the conversation (e.g. when a different document is opened) */
  reset(): void {
    this.generation++
    this.abortController?.abort()
    this.handle?.cancel()
    this.handle = null
    this.running = false
    this.cancelled = false
    this.history = []
    this.runUserMsg = null
    this.dynamicToolExecutions = 0
    this.dynamicLimitReported = false
    this.dynamicLimitStopCallIds.clear()
    this.dynamicLimitStopping = false
    this.dynamicToolQueue = Promise.resolve()
  }

  /** Runs at run boundaries only (restore / before a new user message): a long run's tail is all assistant/tool messages, and cutting mid-run would empty the request. */
  private trimHistory(): void {
    const max = this.options.maxHistory ?? 512
    if (this.history.length <= max) return
    // cut only at a user message so tool_use/tool_result pairs stay intact
    let i = this.history.length - max
    while (i < this.history.length && this.history[i]!.role !== 'user') i++
    if (i >= this.history.length) return // no user boundary in the window: keep history over budget
    const next = this.history.slice(i)
    if (this.runUserMsg && !next.includes(this.runUserMsg)) return
    this.history = next
  }

  private startTurn(retriesUsed = 0): void {
    const generation = this.generation
    const turnSerial = ++this.turnSerial
    this.turnText = ''
    this.toolCalls = []
    this.turnStopReason = null
    // Some transports emit an extra onDone after cancel — this turn may finalize only once
    let settled = false
    this.handle = this.options.transport.stream(
      {
        system: this.options.skill.systemPrompt + (this.options.systemSuffix?.() ?? ''),
        messages: [...this.history],
        tools: this.finalizing ? [] : this.options.skill.tools,
      },
      {
        onDelta: (text) => {
          if (generation !== this.generation || settled) return
          this.turnText += text
          this.options.events?.onText?.(this.turnText)
        },
        onToolCall: (call) => {
          if (generation !== this.generation || settled) return
          this.toolCalls.push(call)
        },
        onToolRequest: (call) => {
          if (generation !== this.generation || settled) {
            return Promise.resolve({
              id: call.id,
              name: call.name,
              output: '(the run ended before this tool could execute)',
              isError: true,
            })
          }
          return this.enqueueDynamicTool(call, generation, turnSerial)
        },
        onToolResultSent: (call) => {
          if (generation !== this.generation || turnSerial !== this.turnSerial || settled) return
          if (!this.dynamicLimitStopCallIds.delete(call.id) || this.dynamicLimitStopping) return
          this.dynamicLimitStopping = true
          // Interrupt only after the denial crosses IPC, so app-server is never
          // left waiting for the result that unblocks its tool request.
          this.handle?.cancel()
        },
        onStopReason: (reason) => {
          if (generation !== this.generation || settled) return
          this.turnStopReason = reason
        },
        onDone: () => {
          if (generation !== this.generation || settled) return
          settled = true
          void this.finishTurn()
        },
        onError: (error) => {
          if (generation !== this.generation || settled) return
          settled = true
          const delay = EMPTY_STREAM_RETRY_DELAYS_MS[retriesUsed]
          // The no-partial-output guard keeps the retry idempotent (an empty
          // stream never emits deltas, but a mislabeled error must not replay
          // a turn whose text/tool calls the UI already saw)
          if (
            delay !== undefined &&
            error.includes('(empty stream)') &&
            !this.cancelled &&
            !this.turnText &&
            this.toolCalls.length === 0
          ) {
            setTimeout(() => {
              if (generation !== this.generation) return
              // Stopped during the backoff window: finalize like a normal cancel
              if (this.cancelled) {
                void this.finishTurn()
                return
              }
              this.startTurn(retriesUsed + 1)
            }, delay)
            return
          }
          this.running = false
          this.rollbackFailedRun()
          this.options.events?.onError?.(error)
        },
      },
    )
  }

  /** Serialize mid-turn provider tool requests and deterministic snapshot capture. */
  private enqueueDynamicTool(
    call: AgentToolCall,
    generation: number,
    turnSerial: number,
  ): Promise<AgentToolResult> {
    const pending = this.dynamicToolQueue.then(
      () => this.executeDynamicTool(call, generation, turnSerial),
      () => this.executeDynamicTool(call, generation, turnSerial),
    )
    this.dynamicToolQueue = pending.then(
      () => undefined,
      () => undefined,
    )
    return pending
  }

  /** Execute and record one managed-provider tool without using the ordinary turn-end list. */
  private async executeDynamicTool(
    call: AgentToolCall,
    generation: number,
    turnSerial: number,
  ): Promise<AgentToolResult> {
    if (generation !== this.generation || turnSerial !== this.turnSerial || !this.running) {
      return {
        id: call.id,
        name: call.name,
        output: '(the run ended before this tool could execute)',
        isError: true,
      }
    }

    const limit = this.options.maxTurns ?? 8
    if (this.dynamicToolExecutions >= limit) {
      const execution: ToolExecution = {
        output: DYNAMIC_TOOL_LIMIT_RESULT,
        isError: true,
        summary: call.name,
      }
      const result: AgentToolResult = {
        id: call.id,
        name: call.name,
        output: execution.output,
        isError: true,
      }
      this.dynamicLimitStopCallIds.add(call.id)
      if (!this.dynamicLimitReported) {
        this.dynamicLimitReported = true
        this.options.events?.onToolExecuted?.({ call, execution })
        this.recordDynamicTool(call, result)
      } else if (!this.dynamicLimitStopping) {
        // A provider can queue several requests before delivery acknowledgement.
        // The second denial is a hard fallback against an unbounded queue.
        this.dynamicLimitStopping = true
        this.handle?.cancel()
      }
      return result
    }

    // Reserve before execution: errors and malformed arguments still consume
    // the user's hard tool-attempt budget.
    this.dynamicToolExecutions++
    const outcome = await this.executeOneTool(call, generation)
    if (!outcome.active || turnSerial !== this.turnSerial) return outcome.result
    this.recordDynamicTool(call, outcome.result)
    return outcome.result
  }

  private recordDynamicTool(call: AgentToolCall, result: AgentToolResult): void {
    // Each app-server stream uses an ephemeral thread reconstructed from this
    // portable history on future user turns and after provider switches.
    const { id, name, input } = call
    this.history.push({ role: 'assistant', text: '', toolCalls: [{ id, name, input }] })
    this.history.push({ role: 'tool', results: [result] })
  }

  /** Shared local executor for ordinary turn-boundary and managed mid-turn tools. */
  private async executeOneTool(
    call: AgentToolCall,
    generation: number,
  ): Promise<{ result: AgentToolResult; active: boolean }> {
    const { events, skill, captureSnapshot } = this.options
    if (this.cancelled) {
      return {
        active: true,
        result: {
          id: call.id,
          name: call.name,
          output: '(the user stopped the run; this tool was not executed)',
          isError: true,
        },
      }
    }

    if (call.truncated || call.inputError) {
      this.inputParseFails++
      const output = call.truncated
        ? 'Tool arguments were cut off by the output length limit; the tool was not executed. Split this operation into several smaller tool calls (less content per call) and try again.'
        : `Tool input JSON failed to parse; the tool was not executed: ${call.inputError}\nFix the arguments (make sure quotes inside strings are escaped) and call again.`
      const execution: ToolExecution = { output, isError: true, summary: call.name }
      events?.onToolExecuted?.({ call, execution })
      return {
        active: true,
        result: { id: call.id, name: call.name, output, isError: true },
      }
    }

    this.inputParseFails = 0
    events?.onToolStart?.(call)
    const snapshot = !this.mutationSeen ? captureSnapshot?.() : undefined
    let execution: ToolExecution
    try {
      execution = await skill.executeTool(call, this.abortController?.signal)
    } catch (error) {
      execution = {
        output: error instanceof Error ? error.message : String(error),
        isError: true,
        summary: call.name,
      }
    }
    if (generation !== this.generation || !this.running) {
      return {
        active: false,
        result: {
          id: call.id,
          name: call.name,
          output: '(the run ended while this tool was executing)',
          isError: true,
        },
      }
    }
    this.executedCalls.push({ name: call.name, ok: !execution.isError })
    const firstMutation = !!execution.mutated && !this.mutationSeen
    if (execution.mutated) this.mutationSeen = true
    events?.onToolExecuted?.({
      call,
      execution,
      snapshotBefore: firstMutation ? snapshot : undefined,
    })
    return {
      active: true,
      result: {
        id: call.id,
        name: call.name,
        output: execution.output,
        isError: execution.isError,
      },
    }
  }

  private async finishTurn(): Promise<void> {
    const { events, skill } = this.options
    const toolCalls = this.toolCalls

    // A managed provider hit the hard tool cap. Its denial was delivered and
    // the current turn interrupted; continue once with tools disabled so the
    // user still receives a bounded final answer.
    if (this.dynamicLimitStopping && !this.cancelled && !this.finalizing) {
      this.dynamicLimitStopping = false
      this.dynamicLimitStopCallIds.clear()
      if (this.turnText) this.history.push({ role: 'assistant', text: this.turnText })
      this.finalizing = true
      this.history.push({ role: 'user', text: TURN_LIMIT_NOTE })
      events?.onTurnEnd?.()
      this.startTurn()
      return
    }
    this.dynamicLimitStopping = false
    this.dynamicLimitStopCallIds.clear()

    // Claimed-action guard: before accepting a final text turn, let the skill
    // check the claims in it against the tools that actually ran this run.
    // A returned correction forces one more model turn (tools stay available,
    // so the model can perform the missing action or reword its claim).
    if (toolCalls.length === 0 && !this.cancelled && !this.finalizing) {
      // snapshot copy: the live array keeps growing if the corrective turn
      // runs more tools, and the hook must see the state at check time
      const correction =
        !this.verifyRetryUsed && this.turnText && skill.verifyResponse
          ? skill.verifyResponse(this.turnText, [...this.executedCalls])
          : null
      if (correction) {
        this.verifyRetryUsed = true
        this.history.push({ role: 'assistant', text: this.turnText })
        this.history.push({ role: 'user', text: correction })
        // No onTurnEnd here: UIs use it to seal the current assistant bubble,
        // which would keep the rejected claim visible. Without it, the
        // corrective turn's cumulative onText overwrites the bubble in place.
        this.startTurn()
        return
      }
    }

    // final turn: no tools requested, the user stopped the run, or the
    // no-tools finalizing turn after hitting the limit
    // (a cancelled turn drops its tool calls — no results would follow)
    if (toolCalls.length === 0 || this.cancelled || this.finalizing) {
      // Models often end a tool-using run with an empty text turn ("I'm done").
      // Leaving assistant text empty in history then poisons the next user
      // prompt: Anthropic rejects empty content arrays, Gemini rejects empty
      // parts, and OpenAI-compatible routes send content:null with no tool_calls —
      // all of which make follow-up turns fail or return empty again (see
      // genoffice#12 / #22: first prompt works, second shows "no summary").
      // Same normalization as restore(), applied unconditionally: cancelled and
      // read-only empty turns poison follow-ups just the same. onDone still
      // reports the raw turn text so app UIs keep their localized fallbacks
      // instead of surfacing this English placeholder.
      this.history.push({ role: 'assistant', text: this.turnText || COMPLETED_VIA_TOOLS_TEXT })
      this.running = false
      this.runUserMsg = null
      events?.onDone?.({
        text: this.turnText,
        cancelled: this.cancelled,
        turnLimit: this.finalizing,
        // set only when true so exact-shape consumers/tests stay unaffected
        ...(this.turnStopReason === 'max_tokens' && !this.cancelled ? { truncated: true } : {}),
      })
      return
    }

    // Strip turn-local execution hints (inputError/truncated) from the stored
    // history: they are not model context, and transports with strict message
    // schemas (the Electron IPC bridge) reject unknown tool-call keys when the
    // history is echoed back on the next turn. The OpenAI-compatible stream
    // paths attach `inputError: undefined` on every parsed call, so without
    // this the second turn of any custom-provider agent run fails validation.
    this.history.push({
      role: 'assistant',
      text: this.turnText,
      toolCalls: toolCalls.map(({ id, name, input }) => ({ id, name, input })),
    })
    const generation = this.generation
    const results: AgentToolResult[] = []
    for (const call of toolCalls) {
      const outcome = await this.executeOneTool(call, generation)
      if (!outcome.active) return
      results.push(outcome.result)
    }
    this.history.push({ role: 'tool', results })

    // Cancelled while tools were executing: finish immediately, no further model request
    if (this.cancelled) {
      this.running = false
      this.runUserMsg = null
      events?.onDone?.({ text: this.turnText, cancelled: true, turnLimit: false })
      return
    }

    // Bad-input retries hit the cap: abort instead of burning more turns
    if (this.inputParseFails >= MAX_INPUT_PARSE_RETRIES) {
      this.running = false
      this.rollbackFailedRun()
      events?.onError?.(
        `Tool input was unusable (unparseable or truncated) ${MAX_INPUT_PARSE_RETRIES} times in a row; retries stopped, please send the request again`,
      )
      return
    }

    this.turns++
    if (this.turns >= (this.options.maxTurns ?? 8)) {
      // Don't throw away the context already gathered: append one no-tools turn for a partial answer
      this.finalizing = true
      this.history.push({ role: 'user', text: TURN_LIMIT_NOTE })
    }
    // Long runs (e.g. page-by-page generation) over budget mid-way: truncate stale tool outputs so each turn doesn't resend a huge payload
    this.squashStaleToolOutputs()
    events?.onTurnEnd?.()
    this.startTurn()
  }
}

/**
 * Redact secret-looking tokens from an outgoing user message so accidentally
 * pasted API keys, URL credentials, and password assignments don't reach
 * remote model APIs verbatim.
 *
 * Imported from public PR #32 (BuiltByHarshil), with the credential pattern
 * narrowed to URL userinfo (scheme://user:pass@host) so ordinary "a:b@c"
 * prose is never rewritten.
 */
export function sanitizeAgentPayload(payload: string): string {
  return (
    payload
      .replace(/\b(?:sk-|AIza|ghp_|secret_)[A-Za-z0-9_-]{16,}/g, '[REDACTED_API_KEY]')
      // The leading boundary prevents a long ordinary word from being retried at
      // every character while the engine looks for "://" (quadratic on large
      // editor contexts). URI schemes start at a word boundary in valid input.
      .replace(/\b([a-z][a-z0-9+.-]*:\/\/[^\s:@/]+):[^\s@/]+@/gi, '$1:[REDACTED_CREDENTIALS]@')
      .replace(
        /(password|passwd|secret_key|private_key)(\s*[:=]\s*)["'][^"']+["']/gi,
        '$1$2"[REDACTED_SECURE_TOKEN]"',
      )
  )
}
