import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../../apps/sheets/src/shared/ipc-channels'
import {
  AI_PROVIDERS,
  defaultAiSettings,
  maxOutputTokensOf,
  resolveAiSettings,
} from '../src/providers'
import { constrainAiSettingsToProduct } from '../src/product-edition'
import type { AiProviderId, AiSettings } from '../src/types'

type Handler = (event: unknown, input?: unknown) => unknown | Promise<unknown>
type Editor = 'docs' | 'sheets'

/** Execute the real IPC callback without importing an Electron window or document engine. */
function loadHandler(editor: Editor, channel: string, scope: Record<string, unknown>): Handler {
  const path = new URL(`../../../apps/${editor}/src/main/${editor}-main.ts`, import.meta.url)
  const source = ts.createSourceFile(
    path.pathname,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
  )
  let callback: ts.Expression | undefined
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === 'ipcMain.handle' &&
      node.arguments[0]?.getText(source) === channel
    ) {
      callback = node.arguments[1]
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (!callback) throw new Error(`Missing ${editor} IPC handler ${channel}`)
  const script = ts.transpileModule(`(${callback.getText(source)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText
  return runInNewContext(script, scope) as Handler
}

function harness(editor: Editor, provider: string, apiKey = 'test-oem-client-key') {
  const settings = defaultAiSettings()
  settings.provider = provider as AiProviderId
  settings.providers.lmstudio = { model: 'local-model', apiKey }
  const send = vi.fn()
  const write = vi.fn()
  const chat = vi.fn().mockResolvedValue({ ok: true, text: 'Endpoint answer' })
  const stream = vi.fn().mockResolvedValue(undefined)
  const chatGpt = vi.fn(() => {
    throw new Error('OEM must not create the ChatGPT runtime')
  })
  const event = {
    sender: { id: 42, isDestroyed: () => false, send, once: vi.fn(), removeListener: vi.fn() },
  }
  const scope = {
    AI_PROVIDERS,
    AI_IPC_ID_MAX: 128,
    IPC_CHANNELS,
    AbortController,
    defaultAiSettings,
    resolveAiSettings,
    maxOutputTokensOf,
    constrainAiSettingsToProduct,
    // These fixtures are already valid wire values. Sheets tests separately
    // cover schema parsing; here exercise the real post-validation authority.
    aiChatRequestSchema: { parse: (value: unknown) => value },
    aiSettingsInputSchema: { parse: (value: unknown) => value },
    aiStreamRequestSchema: { parse: (value: unknown) => value },
    SETTINGS_PATH: () => 'settings.json',
    readJson: () => settings,
    writeJsonAtomic: write,
    webContents: { getAllWebContents: () => [event.sender] },
    sheetsTabs: new Map([[42, { webContents: event.sender }]]),
    sessionFor: () => ({ aiStreams: new Map() }),
    activeAiStreams: new Map(),
    aiStreamKey: (sender: number, request: string) => `${sender}:${request}`,
    rejectPendingAiTools: vi.fn(),
    rejectPendingSheetsAiTools: vi.fn(),
    chatGptProvider: chatGpt,
    sheetsChatGptProvider: chatGpt,
    chatForProvider: chat,
    streamForProvider: stream,
    tm: (key: string) => key,
    isAiOverloadedError: () => false,
    isAiNetworkError: () => false,
    AiTimeoutError: class extends Error {},
  }
  const channels = {
    get: editor === 'docs' ? "'ai:get-settings'" : 'IPC_CHANNELS.aiGetSettings',
    set: editor === 'docs' ? "'ai:set-settings'" : 'IPC_CHANNELS.aiSetSettings',
    chat: editor === 'docs' ? "'ai:chat'" : 'IPC_CHANNELS.aiChat',
    stream: editor === 'docs' ? "'ai:stream'" : 'IPC_CHANNELS.aiStream',
  }
  return {
    settings,
    event,
    send,
    write,
    chat,
    stream,
    chatGpt,
    handler: (kind: keyof typeof channels) => loadHandler(editor, channels[kind], scope),
    chatRequest: {
      settings,
      system: 'Summarize the open document.',
      user: 'Summarize it.',
    },
    request: {
      requestId: 'oem-boundary',
      settings,
      system: 'Summarize the open document.',
      messages: [{ role: 'user', text: 'Summarize it.' }],
      tools: [],
    },
  }
}

describe.each<Editor>(['docs', 'sheets'])('%s OEM main-process authority', (editor) => {
  it('migrates persisted and written ChatGPT settings before broadcast', async () => {
    const h = harness(editor, 'chatgpt')
    const restored = (await h.handler('get')(h.event)) as AiSettings
    expect(restored.provider).toBe('lmstudio')
    await h.handler('set')(h.event, h.settings)
    expect(h.write).toHaveBeenCalledWith(
      'settings.json',
      expect.objectContaining({ provider: 'lmstudio' }),
    )
    expect(h.send).toHaveBeenCalledWith(
      'ai:settings-changed',
      expect.objectContaining({ provider: 'lmstudio' }),
    )
    expect(h.chatGpt).not.toHaveBeenCalled()
  })

  it.each(['chatgpt', 'openai', 'custom', 'unknown-provider'])(
    'constrains forged %s chat and streaming IPC to Endpoint',
    async (provider) => {
      const h = harness(editor, provider)
      expect(await h.handler('chat')(h.event, h.chatRequest)).toEqual({
        ok: true,
        text: 'Endpoint answer',
      })
      await h.handler('stream')(h.event, h.request)
      expect(h.chat.mock.calls[0]?.[0]).toBe('lmstudio')
      expect(h.stream.mock.calls[0]?.[0]).toBe('lmstudio')
      expect(h.chat.mock.calls[0]?.[1].apiKey).toBe('test-oem-client-key')
      expect(h.stream.mock.calls[0]?.[1].apiKey).toBe('test-oem-client-key')
      expect(h.send).toHaveBeenCalledWith(
        'ai:stream-chunk',
        expect.objectContaining({ type: 'done' }),
      )
      expect(h.chatGpt).not.toHaveBeenCalled()
    },
  )

  it('cannot use keyless ChatGPT to bypass the endpoint key requirement', async () => {
    const h = harness(editor, 'chatgpt', '')
    expect(await h.handler('chat')(h.event, h.chatRequest)).toEqual({
      ok: false,
      error: 'errNoApiKey',
    })
    await h.handler('stream')(h.event, h.request)
    expect(h.chat).not.toHaveBeenCalled()
    expect(h.stream).not.toHaveBeenCalled()
    expect(h.chatGpt).not.toHaveBeenCalled()
    expect(h.send).toHaveBeenCalledWith(
      'ai:stream-chunk',
      expect.objectContaining({ type: 'error' }),
    )
  })
})

it('routes new HTML AI through the constrained shared Docs handlers', async () => {
  const channels = readFileSync(
    new URL('../../../apps/html/src/shared/ipc.ts', import.meta.url),
    'utf8',
  )
  expect(channels).toContain("getSettings: 'ai:get-settings'")
  expect(channels).toContain("stream: 'ai:stream'")
  expect(channels).toContain("toolResult: 'ai:tool-result'")
  const preload = readFileSync(
    new URL('../../../apps/html/src/preload/index.ts', import.meta.url),
    'utf8',
  )
  for (const key of ['getSettings', 'stream', 'toolResult']) {
    expect(preload).toContain(`ipcRenderer.invoke(AI_CHANNELS.${key}`)
  }
  const h = harness('docs', 'chatgpt')
  await h.handler('stream')(h.event, h.request)
  expect(h.stream.mock.calls[0]?.[0]).toBe('lmstudio')
  expect(h.chatGpt).not.toHaveBeenCalled()
})
