import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveInstalledChatGptExecutable } from '../src/chatgpt-main'

const enabled = process.env.NIUOFFICE_CHATGPT_SMOKE === '1'
const PROBE_TIMEOUT_MS = 8_000

interface WireToolDefinition {
  name: string
  tool_name: { name: string; namespace: null }
  description: string
  kind: 'function'
  input_schema: Record<string, unknown>
  output_schema: null
}

interface ProbeMessage {
  type: string
  id?: number
  result?: {
    status: string
    message?: string
    value?: {
      Result?: {
        content_items: Array<{ type: string; text?: string }>
        error_text: string | null
      }
    }
  }
}

/** Exercise the pinned helper directly: no app-server, account, model, or user profile. */
async function runCodeModeCell(
  source: string,
  tools: WireToolDefinition[] = [],
): Promise<string[]> {
  const codexExecutable =
    process.env.NIUOFFICE_CODEX_SMOKE_PATH ?? resolveInstalledChatGptExecutable()
  if (!codexExecutable) throw new Error('Official @openai/codex runtime is not installed')
  const executable = join(
    dirname(codexExecutable),
    process.platform === 'win32' ? 'codex-code-mode-host.exe' : 'codex-code-mode-host',
  )
  const child = spawn(executable, ['--listen', 'stdio'], {
    windowsHide: true,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    // Do not inherit credentials, routing overrides, or a personal CODEX_HOME.
    env: process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot } : {},
  })
  const sessionId = randomUUID()
  let stderr = ''
  child.stderr.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-8_192)
  })
  const closed = new Promise<void>((resolve) => child.once('close', () => resolve()))
  const send = (message: unknown) => {
    const body = Buffer.from(JSON.stringify(message))
    const prefix = Buffer.alloc(4)
    // Exact 0.147.0 stdio wire format: little-endian length, then JSON bytes.
    prefix.writeUInt32LE(body.length)
    child.stdin.write(Buffer.concat([prefix, body]))
  }
  try {
    return await new Promise<string[]>((resolve, reject) => {
      let settled = false
      let buffered = Buffer.alloc(0)
      const finish = (error?: Error, values?: string[]) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (error) reject(error)
        else resolve(values ?? [])
      }
      const timer = setTimeout(
        () => finish(new Error(`Code Mode probe timed out: ${stderr}`)),
        PROBE_TIMEOUT_MS,
      )
      child.once('error', (error) => finish(error))
      child.once('exit', (code) => {
        if (!settled) finish(new Error(`Code Mode helper exited (${code}): ${stderr}`))
      })
      child.stdin.on('error', (error) => finish(error))
      child.stdout.on('data', (chunk: Buffer) => {
        try {
          buffered = Buffer.concat([buffered, chunk])
          while (buffered.length >= 4) {
            const length = buffered.readUInt32LE(0)
            if (length > 2 * 1024 * 1024) throw new Error('Oversized Code Mode probe frame')
            if (buffered.length < 4 + length) break
            const message = JSON.parse(buffered.subarray(4, 4 + length).toString()) as ProbeMessage
            buffered = buffered.subarray(4 + length)
            if (message.type === 'connection/ready') {
              send({
                type: 'operation/request',
                id: 1,
                request: {
                  method: 'session/open',
                  sessionId,
                  cellExecutionLimits: {
                    maxYieldTimeMs: 1_000,
                    maxHeapSizeBytes: 32 * 1024 * 1024,
                  },
                },
              })
            } else if (message.type === 'operation/response' && message.id === 1) {
              if (message.result?.status !== 'ok') throw new Error(JSON.stringify(message))
              send({
                type: 'operation/request',
                id: 2,
                request: {
                  method: 'session/execute',
                  sessionId,
                  request: {
                    tool_call_id: 'niuoffice-isolation-probe',
                    enabled_tools: tools,
                    source,
                    max_output_tokens: 1_600,
                    yield_time_ms: 1_000,
                  },
                },
              })
            } else if (message.type === 'execute/initialResponse') {
              const result = message.result?.value?.Result
              if (message.result?.status !== 'ok' || !result || result.error_text) {
                throw new Error(JSON.stringify(message))
              }
              finish(
                undefined,
                result.content_items
                  .filter((item) => item.type === 'input_text')
                  .map((item) => item.text ?? ''),
              )
            } else if (message.type === 'delegate/request') {
              throw new Error('The isolation probe unexpectedly attempted a delegated tool call')
            }
          }
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)))
        }
      })
      send({
        type: 'connection/hello',
        supportedVersions: [1],
        requiredCapabilities: [],
        optionalCapabilities: [],
      })
    })
  } finally {
    // Terminate only this test-owned helper, never a running application/provider.
    if (child.exitCode === null) child.kill()
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      closed,
      new Promise<void>((resolve) => {
        cleanupTimer = setTimeout(resolve, 2_000)
      }),
    ])
    clearTimeout(cleanupTimer)
  }
}

describe.runIf(enabled)('official Code Mode host isolation smoke', () => {
  it('has no OS/network globals and rejects Node and URL imports', async () => {
    const values = await runCodeModeCell(`
      const names = ['process', 'require', 'fetch', 'Deno', 'WebSocket', 'XMLHttpRequest',
        'Buffer', 'console', 'Atomics', 'SharedArrayBuffer', 'WebAssembly'];
      text(Object.fromEntries(names.map(name => [name, typeof globalThis[name]])));
      text({ processViaConstructor: Function('return typeof process')(),
        fetchViaConstructor: Function('return typeof fetch')(), tools: Object.keys(tools),
        metadata: ALL_TOOLS });
      for (const module of ['node:fs', 'node:child_process', 'https://example.invalid/module.js']) {
        try { await import(module); text({module, imported: true}); }
        catch (error) { text({module, error: String(error)}); }
      }
    `)
    expect(Object.values(JSON.parse(values[0]!))).toEqual(Array(11).fill('undefined'))
    expect(JSON.parse(values[1]!)).toEqual({
      processViaConstructor: 'undefined',
      fetchViaConstructor: 'undefined',
      tools: [],
      metadata: [],
    })
    expect(values.slice(2).map((value) => JSON.parse(value))).toEqual([
      { module: 'node:fs', error: 'unsupported import in exec' },
      { module: 'node:child_process', error: 'unsupported import in exec' },
      { module: 'https://example.invalid/module.js', error: 'unsupported import in exec' },
    ])
  }, 15_000)

  it('exposes only declared editor-tool names and no ambient shell tool', async () => {
    const values = await runCodeModeCell(
      `text({tools: Object.keys(tools), metadata: ALL_TOOLS,
        allowed: typeof tools.smoke_noop, undeclared: typeof tools.exec_command});`,
      [
        {
          name: 'smoke_noop',
          tool_name: { name: 'smoke_noop', namespace: null },
          description: 'Synthetic no-op',
          kind: 'function',
          input_schema: { type: 'object', properties: {}, additionalProperties: false },
          output_schema: null,
        },
      ],
    )
    expect(values.map((value) => JSON.parse(value))).toEqual([
      {
        tools: ['smoke_noop'],
        metadata: [{ name: 'smoke_noop', description: 'Synthetic no-op' }],
        allowed: 'function',
        undeclared: 'undefined',
      },
    ])
  }, 15_000)
})
