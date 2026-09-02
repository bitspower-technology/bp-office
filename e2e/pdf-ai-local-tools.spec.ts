import { expect, test } from '@playwright/test'
import type { ElectronApplication } from '@playwright/test'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import productConfig from '../branding/product.json'
import {
  closeAndSaveVideo,
  createFileDropFixtureDir,
  launchShell,
  removeFileDropFixtureDir,
  removeScratchUserData,
  screenshotPath,
  waitForPageWithUrl,
} from './helpers'

test.skip(
  !productConfig.features.chatgptSubscription,
  'Requires a product edition with ChatGPT subscription support',
)

const DOCUMENT_TEXT = 'Revenue grew 25 percent and customer satisfaction improved.'
const OUTLINE_TITLE = 'Quarterly results'

/** A born-digital text PDF with one bookmark; no OCR or remote document is involved. */
function summaryPdf(): Buffer {
  const content = `BT /F1 16 Tf 72 720 Td (${DOCUMENT_TEXT}) Tj ET\n`
  const objects = [
    '<</Type/Catalog/Pages 2 0 R/Outlines 6 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
    `<</Length ${content.length}>>\nstream\n${content}endstream`,
    '<</Type/Outlines/First 7 0 R/Last 7 0 R/Count 1>>',
    `<</Title(${OUTLINE_TITLE})/Parent 6 0 R/Dest[3 0 R/Fit]>>`,
  ]
  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((object, index) => {
    offsets.push(body.length)
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`
  body += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(body, 'latin1')
}

interface RpcMessage {
  id?: string | number
  method?: string
  params?: Record<string, unknown>
  result?: {
    success?: boolean
    contentItems?: Array<{ type: string; text: string }>
  }
}

interface RpcTrace {
  spawnCount: number
  threadParams: Record<string, unknown> | null
  turnParams: Record<string, unknown> | null
  results: RpcMessage[]
  unexpectedMethods: string[]
}

/**
 * Replace only the child-process factory, not ai:stream or ai:tool-result IPC.
 * The real shared provider/client parses these RPC frames and round-trips each
 * mid-turn tool request through the PDF renderer before receiving its result.
 */
async function installLocalAppServer(app: ElectronApplication): Promise<void> {
  await app.evaluate(() => {
    // CDP-evaluated functions have no dynamic-import callback. Electron's Node
    // runtime exposes built-ins directly without requiring a module loader.
    const { EventEmitter } = process.getBuiltinModule('node:events')
    const { PassThrough } = process.getBuiltinModule('node:stream')
    const registry = globalThis as unknown as Record<symbol, unknown>
    const shared = registry[Symbol.for('niuoffice.chatgpt-provider-service')] as {
      service: {
        client: {
          process: unknown
          options: { spawnProcess?: () => unknown }
        }
      }
    }
    if (!shared?.service.client || shared.service.client.process) {
      throw new Error('Expected the isolated ChatGPT service to be unstarted before mocking')
    }
    const trace: RpcTrace = {
      spawnCount: 0,
      threadParams: null,
      turnParams: null,
      results: [],
      unexpectedMethods: [],
    }
    registry[Symbol.for('niuoffice.e2e.pdf-ai-local-tools')] = trace
    const server = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      killed: false,
      kill() {
        this.killed = true
        queueMicrotask(() => this.emit('exit', 0, null))
        return true
      },
    })
    const send = (frame: unknown) => server.stdout.write(`${JSON.stringify(frame)}\n`)
    const reply = (id: RpcMessage['id'], result: unknown) => send({ id, result })
    const threadId = 'pdf-local-thread'
    const turnId = 'pdf-local-turn'
    const requestTool = (tool: string, arguments_: Record<string, unknown>) => {
      send({
        id: `rpc-${tool}`,
        method: 'item/tool/call',
        params: {
          threadId,
          turnId,
          callId: `call-${tool}`,
          namespace: null,
          tool,
          arguments: arguments_,
        },
      })
    }
    let outline = ''
    let buffer = ''
    server.stdin.on('data', (chunk) => {
      buffer += String(chunk)
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line) continue
        const message = JSON.parse(line) as RpcMessage
        if (message.method === 'initialize') {
          reply(message.id, { userAgent: 'niuoffice-local-e2e' })
        } else if (message.method === 'initialized') {
          // Notification: no response is expected.
        } else if (message.method === 'account/read') {
          reply(message.id, { account: { type: 'chatgpt', planType: 'pro' } })
        } else if (message.method === 'model/list') {
          reply(message.id, { data: [], nextCursor: null })
        } else if (message.method === 'account/rateLimits/read') {
          reply(message.id, { rateLimits: {} })
        } else if (message.method === 'thread/start') {
          trace.threadParams = message.params ?? null
          reply(message.id, { thread: { id: threadId }, model: 'local-rpc-model' })
        } else if (message.method === 'turn/start') {
          trace.turnParams = message.params ?? null
          reply(message.id, { turn: { id: turnId, status: 'inProgress' } })
          queueMicrotask(() => {
            send({
              method: 'turn/started',
              params: { threadId, turn: { id: turnId, status: 'inProgress' } },
            })
            requestTool('get_outline', {})
          })
        } else if (message.id === 'rpc-get_outline' && message.result) {
          trace.results.push(message)
          outline = message.result.contentItems?.map((item) => item.text).join('\n') ?? ''
          requestTool('read_pages', { start: 1, end: 1 })
        } else if (message.id === 'rpc-read_pages' && message.result) {
          trace.results.push(message)
          const text = message.result.contentItems?.map((item) => item.text).join('\n') ?? ''
          // The answer is derived exclusively from real renderer tool outputs.
          send({
            method: 'item/agentMessage/delta',
            params: {
              threadId,
              turnId,
              itemId: 'summary',
              delta: `Local document summary:\n${text}\n\nOutline: ${outline}`,
            },
          })
          send({
            method: 'turn/completed',
            params: { threadId, turn: { id: turnId, status: 'completed', error: null } },
          })
        } else if (message.method) {
          trace.unexpectedMethods.push(message.method)
          send({ id: message.id, error: { code: -32601, message: 'Unexpected E2E RPC method' } })
        }
      }
    })
    shared.service.client.options.spawnProcess = () => {
      trace.spawnCount++
      return server
    }
  })
}

test('PDF summary reads local pages and outline through ChatGPT dynamic tools without credentials', async () => {
  const fixtureDir = await createFileDropFixtureDir()
  const pdfPath = join(fixtureDir, 'quarterly-results.pdf')
  await writeFile(pdfPath, summaryPdf())
  const launched = await launchShell({
    onboardingSeen: true,
    videoDir: 'pdf-ai-local-tools',
    openFile: pdfPath,
  })
  try {
    await installLocalAppServer(launched.app)
    await writeFile(
      join(launched.userDataDir, 'ai-settings.json'),
      JSON.stringify({
        provider: 'chatgpt',
        providers: { chatgpt: { model: 'local-rpc-model' } },
      }),
    )
    const pdf = await waitForPageWithUrl(launched.app, 'pdf/out')
    await expect(pdf.locator('.pdf-page').first()).toBeVisible()
    await pdf.getByRole('button', { name: 'View', exact: true }).click()
    await expect(pdf.getByRole('button', { name: 'Outline', exact: true })).toBeEnabled()
    await pdf.getByRole('button', { name: 'Home', exact: true }).click()
    await pdf.locator('.rb-big.ai-entry', { hasText: 'AI Summarize' }).click()

    await expect(pdf.locator('.ai-msg-user')).toContainText('summarize the main content')
    await expect(pdf.locator('.ai-msg-assistant').last()).toContainText(DOCUMENT_TEXT)
    await expect(pdf.locator('.ai-msg-assistant').last()).toContainText(OUTLINE_TITLE)
    await expect(pdf.locator('.ai-msg-error')).toHaveCount(0)
    await expect(pdf.locator('.ai-work-group-summary')).toContainText('2')
    await pdf.locator('.ai-work-group-summary').click()
    await expect(pdf.locator('.ai-step-row')).toHaveCount(2)
    await pdf.locator('.ai-step-title[data-tip="get_outline"]').click()
    await pdf.locator('.ai-step-title[data-tip="read_pages"]').click()
    await expect(pdf.locator('.ai-tool-output-pre').first()).toContainText(OUTLINE_TITLE)
    await expect(pdf.locator('.ai-tool-output-pre').last()).toContainText(DOCUMENT_TEXT)

    const trace = await launched.app.evaluate(() => {
      const registry = globalThis as unknown as Record<symbol, unknown>
      return registry[Symbol.for('niuoffice.e2e.pdf-ai-local-tools')] as RpcTrace
    })
    expect(trace.spawnCount).toBe(1)
    expect(trace.unexpectedMethods).toEqual([])
    expect(trace.threadParams).toMatchObject({ ephemeral: true, sandbox: 'read-only' })
    const tools = trace.threadParams?.dynamicTools as Array<{ name: string }>
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['read_pages', 'get_outline', 'search_text']),
    )
    expect(trace.turnParams?.input).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: expect.stringContaining('summarize the main content') }),
      ]),
    )
    expect(trace.results.map((message) => message.id)).toEqual([
      'rpc-get_outline',
      'rpc-read_pages',
    ])
    expect(trace.results.every((message) => message.result?.success === true)).toBe(true)
    expect(existsSync(join(launched.userDataDir, 'chatgpt', 'codex-home', 'auth.json'))).toBe(false)
    await expect(pdf.getByText('Genspark', { exact: false })).toHaveCount(0)
    await pdf.screenshot({ path: screenshotPath('pdf-ai-local-tools') })
  } finally {
    await closeAndSaveVideo(launched, 'pdf-ai-local-tools')
    await removeScratchUserData(launched.userDataDir)
    await removeFileDropFixtureDir(fixtureDir)
  }
})
