import { expect, test } from '@playwright/test'
import type { ElectronApplication } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import productConfig from '../branding/product.json'
import {
  closeAndSaveVideo,
  createFileDropFixtureDir,
  launchShell,
  removeFileDropFixtureDir,
  removeScratchUserData,
  waitForPageWithUrl,
} from './helpers'

test.skip(
  !productConfig.features.chatgptSubscription,
  'Requires a product edition with ChatGPT subscription support',
)

const ORIGINAL_TITLE = 'Starting point'
const UPDATED_TITLE = '季度結果 — 第二頁'
const CREATED_TITLE = '附錄 ✓'

/** A born-digital two-page PDF with one initial bookmark; no user document is involved. */
function bookmarkPdf(): Buffer {
  const firstContent = 'BT /F1 16 Tf 72 720 Td (First synthetic page) Tj ET\n'
  const secondContent = 'BT /F1 16 Tf 72 720 Td (Second synthetic page) Tj ET\n'
  const objects = [
    '<</Type/Catalog/Pages 2 0 R/Outlines 8 0 R>>',
    '<</Type/Pages/Kids[3 0 R 4 0 R]/Count 2>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 7 0 R>>>>/Contents 5 0 R>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 7 0 R>>>>/Contents 6 0 R>>',
    `<</Length ${firstContent.length}>>\nstream\n${firstContent}endstream`,
    `<</Length ${secondContent.length}>>\nstream\n${secondContent}endstream`,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
    '<</Type/Outlines/First 9 0 R/Last 9 0 R/Count 1>>',
    `<</Title(${ORIGINAL_TITLE})/Parent 8 0 R/Dest[3 0 R/Fit]>>`,
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

interface RpcResult {
  success?: boolean
  contentItems?: Array<{ type: string; text: string }>
}

interface RpcMessage {
  id?: string | number
  method?: string
  params?: Record<string, unknown>
  result?: RpcResult
}

interface RpcTrace {
  results: RpcMessage[]
  unexpectedMethods: string[]
}

/** Drive a deterministic get -> update -> create sequence through the real dynamic-tool bridge. */
async function installBookmarkAppServer(app: ElectronApplication): Promise<void> {
  await app.evaluate(() => {
    const updatedTitle = '季度結果 — 第二頁'
    const createdTitle = '附錄 ✓'
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

    const trace: RpcTrace = { results: [], unexpectedMethods: [] }
    registry[Symbol.for('niuoffice.e2e.pdf-ai-bookmarks')] = trace
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
    const threadId = 'pdf-bookmark-thread'
    const turnId = 'pdf-bookmark-turn'
    const requestTool = (id: string, tool: string, arguments_: Record<string, unknown>) => {
      send({
        id,
        method: 'item/tool/call',
        params: {
          threadId,
          turnId,
          callId: `call-${id}`,
          namespace: null,
          tool,
          arguments: arguments_,
        },
      })
    }

    let buffer = ''
    server.stdin.on('data', (chunk) => {
      buffer += String(chunk)
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line) continue
        const message = JSON.parse(line) as RpcMessage
        if (message.method === 'initialize') {
          reply(message.id, { userAgent: 'niuoffice-bookmark-e2e' })
        } else if (message.method === 'initialized') {
          // Notification: no response is expected.
        } else if (message.method === 'account/read') {
          reply(message.id, { account: { type: 'chatgpt', planType: 'pro' } })
        } else if (message.method === 'model/list') {
          reply(message.id, { data: [], nextCursor: null })
        } else if (message.method === 'account/rateLimits/read') {
          reply(message.id, { rateLimits: {} })
        } else if (message.method === 'thread/start') {
          reply(message.id, { thread: { id: threadId }, model: 'local-rpc-model' })
        } else if (message.method === 'turn/start') {
          reply(message.id, { turn: { id: turnId, status: 'inProgress' } })
          queueMicrotask(() => {
            send({
              method: 'turn/started',
              params: { threadId, turn: { id: turnId, status: 'inProgress' } },
            })
            requestTool('rpc-outline', 'get_outline', {})
          })
        } else if (message.id === 'rpc-outline' && message.result) {
          trace.results.push(message)
          requestTool('rpc-update', 'edit_bookmark', {
            action: 'update',
            path: '1',
            title: updatedTitle,
            page: 2,
            bold: true,
          })
        } else if (message.id === 'rpc-update' && message.result) {
          trace.results.push(message)
          requestTool('rpc-create', 'edit_bookmark', {
            action: 'create',
            title: createdTitle,
            page: 1,
            italic: true,
          })
        } else if (message.id === 'rpc-create' && message.result) {
          trace.results.push(message)
          send({
            method: 'item/agentMessage/delta',
            params: {
              threadId,
              turnId,
              itemId: 'bookmark-result',
              delta: 'Updated and created the requested local PDF bookmarks.',
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
    shared.service.client.options.spawnProcess = () => server
  })
}

async function readPersistedOutline(
  path: string,
): Promise<Array<{ title: string; page: number; bold: boolean; italic: boolean }>> {
  const loadingTask = getDocument({ data: new Uint8Array(await readFile(path)) })
  const doc = await loadingTask.promise
  try {
    const outline = await doc.getOutline()
    if (!outline) return []
    return await Promise.all(
      outline.map(async (item) => {
        const destination =
          typeof item.dest === 'string' ? await doc.getDestination(item.dest) : item.dest
        if (!Array.isArray(destination)) throw new Error(`Missing destination for ${item.title}`)
        const pageRef = destination[0]
        const pageIndex =
          typeof pageRef === 'number'
            ? pageRef
            : await doc.getPageIndex(pageRef as Parameters<(typeof doc)['getPageIndex']>[0])
        return {
          title: item.title,
          page: pageIndex + 1,
          bold: item.bold,
          italic: item.italic,
        }
      }),
    )
  } finally {
    await loadingTask.destroy()
  }
}

test('PDF AI bookmark edits persist through save and reopen without a cloud document service', async () => {
  const fixtureDir = await createFileDropFixtureDir()
  const pdfPath = join(fixtureDir, 'bookmark-edit.pdf')
  await writeFile(pdfPath, bookmarkPdf())
  const launched = await launchShell({
    onboardingSeen: true,
    videoDir: 'pdf-ai-bookmarks',
    openFile: pdfPath,
  })
  try {
    await installBookmarkAppServer(launched.app)
    await writeFile(
      join(launched.userDataDir, 'ai-settings.json'),
      JSON.stringify({
        provider: 'chatgpt',
        providers: { chatgpt: { model: 'local-rpc-model' } },
      }),
    )

    const pdf = await waitForPageWithUrl(launched.app, 'pdf/out')
    await expect(pdf.locator('.pdf-page')).toHaveCount(2)
    await pdf.getByRole('button', { name: 'View', exact: true }).click()
    await expect(pdf.getByRole('button', { name: 'Outline', exact: true })).toBeEnabled()
    await pdf.getByRole('button', { name: 'Home', exact: true }).click()
    const composer = pdf.locator('.ai-composer textarea')
    if (!(await composer.isVisible())) {
      await pdf.locator('.rb-big.ai-entry', { hasText: 'BP Office AI' }).click()
    }
    await expect(composer).toBeVisible()
    await composer.fill('Rename the existing bookmark and add another bookmark.')
    await composer.press('Enter')

    await expect(pdf.locator('.ai-msg-assistant').last()).toContainText(
      'Updated and created the requested local PDF bookmarks.',
    )
    await expect(pdf.locator('.ai-msg-error')).toHaveCount(0)
    await expect(pdf.locator('.ai-step-row')).toHaveCount(3)

    const trace = await launched.app.evaluate(() => {
      const registry = globalThis as unknown as Record<symbol, unknown>
      return registry[Symbol.for('niuoffice.e2e.pdf-ai-bookmarks')] as RpcTrace
    })
    expect(trace.unexpectedMethods).toEqual([])
    expect(trace.results.map((message) => message.id)).toEqual([
      'rpc-outline',
      'rpc-update',
      'rpc-create',
    ])
    const failedToolResults = trace.results.filter((message) => message.result?.success !== true)
    expect(failedToolResults, JSON.stringify(trace.results, null, 2)).toEqual([])
    expect(trace.results[0]?.result?.contentItems?.map((item) => item.text).join('\n')).toContain(
      `[1] "${ORIGINAL_TITLE}" — page 1`,
    )

    const save = pdf.getByRole('button', { name: 'Save', exact: true })
    await expect(save).toBeEnabled()
    await save.click()
    await expect(pdf.locator('.tb-save-ok')).toBeVisible({ timeout: 15_000 })
    await expect(save).toBeDisabled()

    expect(await readPersistedOutline(pdfPath)).toEqual([
      { title: UPDATED_TITLE, page: 2, bold: true, italic: false },
      { title: CREATED_TITLE, page: 1, bold: false, italic: true },
    ])
  } finally {
    await closeAndSaveVideo(launched, 'pdf-ai-bookmarks')
    await removeScratchUserData(launched.userDataDir)
    await removeFileDropFixtureDir(fixtureDir)
  }
})
