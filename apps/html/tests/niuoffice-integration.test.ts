import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiSettings, AiStreamChunk } from '@genoffice/ai-provider'
import { defaultAiSettings } from '@genoffice/ai-provider'
import { createElectronTransport } from '../src/renderer/ai/transport'
import { createDocumentSkill } from '../src/renderer/ai/html-skill'
import { buildParseMap } from '../src/renderer/document/parse-map'
import { AI_CHANNELS, HTML_CHANNELS } from '../src/shared/ipc'

vi.mock('../src/renderer/i18n/locale', () => ({ t: (key: string) => key }))

afterEach(() => vi.unstubAllGlobals())

describe('NiuOffice HTML integration', () => {
  it('reads live provider settings for each run and bridges managed dynamic-tool replies', async () => {
    let settings: AiSettings = defaultAiSettings()
    let listener: ((chunk: AiStreamChunk) => void) | undefined
    const start = vi.fn()
    const reply = vi.fn().mockResolvedValue(undefined)
    const unsubscribe = vi.fn()
    vi.stubGlobal('window', {
      htmlApi: {
        onAiStream: (handler: (chunk: AiStreamChunk) => void) => {
          listener = handler
          return unsubscribe
        },
        aiStream: start,
        aiToolResult: reply,
        aiStreamCancel: vi.fn(),
      },
    })
    const transport = createElectronTransport(() => settings)
    const completed = vi.fn()
    const onToolResultSent = vi.fn()
    const callbacks = {
      onDelta: vi.fn(),
      onToolCall: vi.fn(),
      onDone: completed,
      onError: vi.fn(),
      onToolRequest: async (call: { id: string; name: string }) => ({
        id: call.id,
        name: call.name,
        output: 'document text',
      }),
      onToolResultSent,
    }
    const request = { system: 'HTML editor', messages: [], tools: [] }
    transport.stream(request, callbacks)
    expect(start.mock.calls[0]![0].settings.provider).toBe('lmstudio')
    listener!({ requestId: start.mock.calls[0]![0].requestId, type: 'done' })

    settings = { ...defaultAiSettings(), provider: 'chatgpt' }
    transport.stream(request, callbacks)
    const requestId = start.mock.calls[1]![0].requestId as string
    expect(start.mock.calls[1]![0].settings.provider).toBe('chatgpt')
    const toolCall = { id: 'read', name: 'read_source', input: {} }
    listener!({ requestId, type: 'tool-request', toolCall })
    await vi.waitFor(() =>
      expect(reply).toHaveBeenCalledWith({
        requestId,
        result: { id: 'read', name: 'read_source', output: 'document text' },
      }),
    )
    expect(onToolResultSent).toHaveBeenCalled()
    listener!({ requestId, type: 'done' })
    expect(completed).toHaveBeenCalledTimes(2)
    expect(unsubscribe).toHaveBeenCalledTimes(2)
  })

  it('keeps local document tools and NiuOffice prompts without removed network tools', () => {
    const text = '<html><body><h1>Local report</h1></body></html>'
    const skill = createDocumentSkill({
      getText: () => text,
      getVersion: () => 1,
      getMap: () => buildParseMap(text, 1),
      getLastManualVersion: () => 0,
      getFilePath: () => null,
      getSelectedSid: () => null,
      applyOps: () => ({ ok: true, ranges: [] }),
      replaceAll: () => {},
    })
    expect(skill.systemPrompt).toContain('NiuOffice AI')
    expect(skill.tools.map((tool) => tool.name)).toContain('read_source')
    expect(skill.tools.map((tool) => tool.name)).toContain('apply_ops')
    expect(JSON.stringify(skill.tools) + skill.systemPrompt).not.toMatch(
      /web_search|image_search|generate_image|analyze_media|Genspark|GenOffice/,
    )
  })

  it('exposes provider propagation but no MCP or unattended export IPC', () => {
    expect(AI_CHANNELS.settingsChanged).toBe('ai:settings-changed')
    expect(AI_CHANNELS.openSettings).toBe('ai:open-local-ai-settings')
    expect(AI_CHANNELS.toolResult).toBe('ai:tool-result')
    expect(JSON.stringify(HTML_CHANNELS)).not.toMatch(/headless|mcp|read-text|agent-run/i)
    for (const path of [
      '../src/shared/ipc.ts',
      '../src/preload/index.ts',
      '../src/main/html-main.ts',
    ]) {
      expect(readFileSync(new URL(path, import.meta.url), 'utf8')).not.toMatch(
        /headless|\bMCP\b|htmlSaveToPath|htmlReadText|outPath/,
      )
    }
  })
})
