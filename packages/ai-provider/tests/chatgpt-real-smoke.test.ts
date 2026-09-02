import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ChatGptAppServerClient, resolveInstalledChatGptExecutable } from '../src/chatgpt-main'

const enabled = process.env.NIUOFFICE_CHATGPT_SMOKE === '1'

async function readRuntimeEvidence(directory: string): Promise<string> {
  let evidence = ''
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      evidence += await readRuntimeEvidence(path)
    } else if (entry.isFile()) {
      evidence += (await readFile(path)).toString('latin1')
    }
  }
  return evidence
}

describe.runIf(enabled)('official Codex app-server smoke', () => {
  it('initializes against a fresh isolated home without starting login', async () => {
    const root = await mkdtemp(join(tmpdir(), 'niuoffice-chatgpt-smoke-'))
    const executablePath =
      process.env.NIUOFFICE_CODEX_SMOKE_PATH ?? resolveInstalledChatGptExecutable()
    if (!executablePath) throw new Error('Official @openai/codex runtime is not installed')
    const codexHome = join(root, 'codex-home')
    const client = new ChatGptAppServerClient({
      codexHome,
      workingDirectory: join(root, 'empty-workspace'),
      executablePath,
      requestTimeoutMs: 30_000,
      startTimeoutMs: 30_000,
      clientInfo: { name: 'niuoffice-smoke', title: 'NiuOffice Smoke Test', version: '0.0.0' },
    })
    try {
      await expect(client.readAccount()).resolves.toBeNull()
      await expect(client.listModels()).resolves.toEqual(expect.any(Array))
      await expect(client.getStatus()).resolves.toMatchObject({
        state: 'signed-out',
        models: [],
        rateLimits: [],
      })
      try {
        const thread = await client.startThread({
          system: 'Smoke-test protocol validation only.',
          tools: [
            {
              name: 'smoke_noop',
              description: 'A no-op used only to validate the dynamic-tool schema.',
              inputSchema: { type: 'object', properties: {}, additionalProperties: false },
            },
          ],
        })
        expect(thread.threadId).toEqual(expect.any(String))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        expect(message).not.toMatch(/invalid params|unknown field|method not found/i)
        expect(message).toMatch(/auth|sign.?in|login|unauthorized/i)
      }
    } finally {
      await client.dispose()
      try {
        const evidence = await readRuntimeEvidence(codexHome)
        expect(evidence).not.toMatch(
          /plugins\/featured|openai\/plugins|plugins\/export\/curated|remote control websocket|remote_control_url/i,
        )
        expect(evidence).not.toMatch(
          /deprecated because web search|web search is enabled by default/i,
        )
      } finally {
        await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
      }
    }
  }, 60_000)
})
