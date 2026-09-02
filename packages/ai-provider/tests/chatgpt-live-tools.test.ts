import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ChatGptAppServerClient, resolveInstalledChatGptExecutable } from '../src/chatgpt-main'

// Explicit opt-in: this consumes a request on the NiuOffice-connected ChatGPT
// subscription. Use its existing CODEX_HOME normally; never copy credentials.
// Only synthetic document text is sent, and no editor/user files are touched.
const codexHome = process.env.NIUOFFICE_CHATGPT_LIVE_HOME
const model = process.env.NIUOFFICE_CHATGPT_LIVE_MODEL

describe.runIf(Boolean(codexHome && model))('connected ChatGPT local document tools', () => {
  it('reads synthetic PDF outline and page text through the real runtime', async () => {
    if (!codexHome || !isAbsolute(codexHome) || !model) {
      throw new Error('An absolute NiuOffice ChatGPT home and explicit model are required')
    }
    const executablePath =
      process.env.NIUOFFICE_CODEX_SMOKE_PATH ?? resolveInstalledChatGptExecutable()
    if (!executablePath) throw new Error('Official @openai/codex runtime is not installed')
    const root = await mkdtemp(join(tmpdir(), 'niuoffice-chatgpt-live-tools-'))
    const marker = `NIU-${randomUUID()}`
    const calls: string[] = []
    let answer = ''
    const client = new ChatGptAppServerClient({
      codexHome,
      workingDirectory: root,
      executablePath,
      requestTimeoutMs: 30_000,
      startTimeoutMs: 30_000,
      turnIdleTimeoutMs: 60_000,
      clientInfo: {
        name: 'niuoffice-live-tools-test',
        title: 'NiuOffice Tool Test',
        version: '0.0.0',
      },
    })
    try {
      expect(await client.readAccount()).not.toBeNull()
      const { threadId } = await client.startThread({
        model,
        system:
          'You are a PDF assistant. The document has one page. You must read its outline ' +
          'with get_outline and its page text with read_pages before summarizing it. ' +
          'Use only these supplied local document tools. Never infer document content.',
        tools: [
          {
            name: 'get_outline',
            description: 'Read the local PDF document outline.',
            inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          },
          {
            name: 'read_pages',
            description: 'Read local PDF text. Page numbers are 1-based; there is one page.',
            inputSchema: {
              type: 'object',
              properties: {
                start: { type: 'integer', minimum: 1, maximum: 1 },
                end: { type: 'integer', minimum: 1, maximum: 1 },
              },
              required: ['start', 'end'],
              additionalProperties: false,
            },
          },
        ],
      })
      const result = await client.streamTurn(
        threadId,
        [
          {
            type: 'text',
            text: 'Read the outline and page 1, then summarize this PDF in one sentence. Include its validation marker exactly.',
            text_elements: [],
          },
        ],
        {
          onDelta: (text) => {
            answer += text
          },
          onDynamicToolCall: async ({ call }) => {
            calls.push(call.name)
            if (call.name === 'get_outline') {
              return { id: call.id, name: call.name, output: 'Local document validation — page 1' }
            }
            expect(call.name).toBe('read_pages')
            expect(call.input).toEqual({ start: 1, end: 1 })
            return {
              id: call.id,
              name: call.name,
              output: `[Page 1]\nNiuOffice reads this synthetic document using local editor tools, without GenOffice cloud services. Validation marker: ${marker}`,
            }
          },
        },
      )
      expect(result.status).toBe('completed')
      expect(calls).toEqual(expect.arrayContaining(['get_outline', 'read_pages']))
      expect(answer).toContain(marker)
      expect(answer).not.toMatch(/tool.{0,30}unavailable|code.mode host is disabled/i)
    } finally {
      await client.dispose()
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  }, 120_000)
})
