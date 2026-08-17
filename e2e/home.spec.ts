import { expect, test, type Page } from '@playwright/test'
import { createServer as createHttpServer } from 'node:http'
import { createServer as createResetServer, type Server } from 'node:net'
import type { AddressInfo } from 'node:net'
import {
  closeAndSaveVideo,
  launchShell,
  removeScratchUserData,
  screenshotPath,
  waitForPageWithUrl,
  type AiSettingsSeed,
  type LaunchedApp,
} from './helpers'

interface LocalServer {
  baseUrl: string
  close: () => Promise<void>
}

interface ModelsServer extends LocalServer {
  requests: Array<{
    method: string
    url: string
    authorization?: string
    body?: string
  }>
}

async function waitForEditorPage(
  app: LaunchedApp['app'],
  urlPart: string,
  selector: string,
  timeoutMs = 30_000,
): Promise<Page> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    for (const candidate of app.windows()) {
      const href = await candidate.evaluate(() => window.location.href).catch(() => '')
      if (!href.includes(urlPart)) continue
      if (
        (await candidate
          .locator(selector)
          .count()
          .catch(() => 0)) > 0
      )
        return candidate
    }
    if (Date.now() >= deadline) {
      throw new Error(`No editor page with URL "${urlPart}" and selector "${selector}"`)
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100))
  }
}

async function listenOnEphemeralPort(server: Server): Promise<number> {
  await new Promise<void>((resolvePromise, reject) => {
    const onError = (error: Error) => reject(error)
    server.once('error', onError)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onError)
      resolvePromise()
    })
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Mock server has no TCP address')
  return (address as AddressInfo).port
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    server.close((error) => (error ? reject(error) : resolvePromise()))
  })
}

async function startModelsServer(status: number, body: unknown): Promise<ModelsServer> {
  const requests: ModelsServer['requests'] = []
  const server = createHttpServer((request, response) => {
    const authorization = request.headers.authorization
    const record: ModelsServer['requests'][number] = {
      method: request.method ?? '',
      url: request.url ?? '',
      ...(typeof authorization === 'string' ? { authorization } : {}),
    }
    requests.push(record)
    if (request.method === 'POST' && request.url?.endsWith('/chat/completions')) {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => chunks.push(chunk))
      request.on('end', () => {
        record.body = Buffer.concat(chunks).toString('utf8')
        response.statusCode = 200
        response.setHeader('Content-Type', 'text/event-stream')
        response.end(
          'data: {"choices":[{"delta":{"content":"live-propagation-ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
        )
      })
      return
    }
    if (request.method !== 'GET' || !request.url?.endsWith('/models')) {
      response.statusCode = 404
      response.end()
      return
    }
    response.statusCode = status
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify(body))
  })
  const port = await listenOnEphemeralPort(server)
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    requests,
    close: () => closeServer(server),
  }
}

/** Reserve a port while resetting every connection so no unrelated service can satisfy the probe. */
async function startUnreachableServer(): Promise<LocalServer> {
  const server = createResetServer((socket) => socket.destroy())
  const port = await listenOnEphemeralPort(server)
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    close: () => closeServer(server),
  }
}

function lmStudioSettings(baseUrl: string, apiKey = ''): AiSettingsSeed {
  return {
    provider: 'lmstudio',
    providers: {
      lmstudio: { baseUrl, model: '', apiKey },
    },
  }
}

async function closeAndRemoveScratch(launched: LaunchedApp, videoName: string): Promise<void> {
  try {
    await closeAndSaveVideo(launched, videoName)
  } finally {
    await removeScratchUserData(launched.userDataDir)
  }
}

async function expectFinalLmStudioStatus(
  page: Page,
  state: 'connected' | 'no-models' | 'unauthorized' | 'unreachable',
  text?: string | RegExp,
): Promise<void> {
  const status = page.locator(`.local-ai-status.${state}`)
  await expect(status).toBeVisible()
  if (text) await expect(status).toContainText(text)
  await expect(status).not.toContainText(/Checking/i)
}

async function expectNoLegacyCloudAccountUi(page: Page): Promise<void> {
  await expect(page.getByText('Genspark Projects', { exact: true })).toHaveCount(0)
  await expect(page.getByText(/Genspark Account|Sign in with Genspark/)).toHaveCount(0)
  await expect(page.locator('.account-entry')).toHaveCount(0)
}

test.describe('home screen', () => {
  test.describe.configure({ mode: 'serial' })

  test('shows hero, quick-create cards and tab bar', async () => {
    const launched = await launchShell({ onboardingSeen: true, videoDir: 'home-basics' })
    const { page } = launched
    try {
      await expect(page.locator('.home-hero')).toBeVisible()
      // three AI quick-create cards plus the "Open file" browse card
      await expect(page.locator('.quick-card')).toHaveCount(4)
      await expect(page.locator('.quick-card').first()).toContainText('AI Docs')
      await expect(page.locator('.quick-card').nth(1)).toContainText('AI Sheets')
      await expect(page.locator('.quick-card').nth(2)).toContainText('AI Markdown')
      await expect(page.getByText('AI Slides', { exact: true })).toHaveCount(0)
      await expect(page.getByText('Slides', { exact: true })).toHaveCount(0)
      await expect(page.getByText('.pptx', { exact: false })).toHaveCount(0)
      await expect(page.locator('.tab-bar .tab-item.tab-home')).toBeVisible()
      await page.screenshot({ path: screenshotPath('home-overview') })
    } finally {
      await closeAndRemoveScratch(launched, 'home-basics')
    }
  })

  test('renders localized UI when GENOFFICE_LANG=zh-CN', async () => {
    const launched = await launchShell({
      onboardingSeen: true,
      lang: 'zh-CN',
      videoDir: 'home-zh-cn',
    })
    const { page } = launched
    try {
      await expect(page.locator('.nav-item .nav-label').first()).toHaveText('最近')
      await page.screenshot({ path: screenshotPath('home-zh-cn') })
    } finally {
      await closeAndRemoveScratch(launched, 'home-zh-cn')
    }
  })

  test('shows connected LM Studio with an auto-selected model and opens Local AI settings', async () => {
    const mock = await startModelsServer(200, {
      models: [
        {
          type: 'llm',
          key: 'e2e-loaded-model',
          display_name: 'Loaded Model',
          loaded_instances: [{ id: 'e2e-loaded-model' }],
          capabilities: { trained_for_tool_use: false, vision: false },
        },
        {
          type: 'llm',
          key: 'e2e-tool-model',
          display_name: 'Tool Model',
          loaded_instances: [{ id: 'e2e-tool-model' }],
          capabilities: { trained_for_tool_use: true, vision: false },
        },
      ],
    })
    const draftMock = await startModelsServer(200, {
      models: [
        {
          type: 'llm',
          key: 'draft-model',
          display_name: 'Draft Model',
          loaded_instances: [{ id: 'draft-model' }],
          capabilities: { trained_for_tool_use: true, vision: true },
        },
      ],
    })
    let launched: LaunchedApp | undefined
    try {
      launched = await launchShell({
        onboardingSeen: true,
        aiSettings: lmStudioSettings(mock.baseUrl),
        videoDir: 'home-lmstudio-connected',
      })
      const { page } = launched
      await expectFinalLmStudioStatus(page, 'connected', 'e2e-tool-model')
      expect(mock.requests.some((request) => request.url === '/api/v1/models')).toBe(true)
      expect(mock.requests.every((request) => request.authorization === undefined)).toBe(true)
      await expectNoLegacyCloudAccountUi(page)

      await page.locator('.local-ai-btn').click()
      const dialog = page.getByRole('dialog', { name: 'Settings' })
      await expect(dialog).toBeVisible()
      await expect(dialog.locator('.set-nav-item.active')).toHaveText('Local AI')
      await expect(dialog.locator('.set-pane-title')).toHaveText('Local AI')
      await expect(dialog.locator('.set-nav-item').filter({ hasText: 'Account' })).toHaveCount(0)
      await expectNoLegacyCloudAccountUi(page)

      const modelMode = page.getByTestId('lmstudio-model-mode')
      await expect(modelMode.getByRole('button', { name: 'Automatic' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )

      // Refresh tests the unsaved draft endpoint/token instead of the persisted config.
      await page.getByTestId('lmstudio-base-url').fill(draftMock.baseUrl)
      await page.getByTestId('lmstudio-api-token').fill('draft-token')
      await page.getByTestId('lmstudio-refresh').click()
      await expect
        .poll(() =>
          draftMock.requests.some((request) => request.authorization === 'Bearer draft-token'),
        )
        .toBe(true)
      await expect(page.getByTestId('lmstudio-settings-status')).toContainText('draft-model')

      // Manual mode, endpoint, model, and token survive Save & Test and reopening Settings.
      await modelMode.getByRole('button', { name: 'Manual' }).click()
      await page.getByTestId('lmstudio-model').fill('draft-model')
      await page.getByTestId('lmstudio-save-test').click()
      await expect(page.getByTestId('lmstudio-save-success')).toBeVisible()
      await expect
        .poll(
          () =>
            draftMock.requests.filter((request) => request.authorization === 'Bearer draft-token')
              .length,
        )
        .toBeGreaterThan(1)

      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await page.getByTestId('lmstudio-status-button').click()
      await expect(page.getByTestId('lmstudio-base-url')).toHaveValue(draftMock.baseUrl)
      await expect(page.getByTestId('lmstudio-api-token')).toHaveValue('draft-token')
      await expect(modelMode.getByRole('button', { name: 'Manual' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await expect(page.getByTestId('lmstudio-model')).toHaveValue('draft-model')
    } finally {
      try {
        if (launched) await closeAndRemoveScratch(launched, 'home-lmstudio-connected')
      } finally {
        await Promise.all([mock.close(), draftMock.close()])
      }
    }
  })

  test('shows the LM Studio no-models state', async () => {
    const mock = await startModelsServer(200, { models: [] })
    let launched: LaunchedApp | undefined
    try {
      launched = await launchShell({
        onboardingSeen: true,
        aiSettings: lmStudioSettings(mock.baseUrl),
        videoDir: 'home-lmstudio-no-models',
      })
      await expectFinalLmStudioStatus(launched.page, 'no-models')
    } finally {
      try {
        if (launched) await closeAndRemoveScratch(launched, 'home-lmstudio-no-models')
      } finally {
        await mock.close()
      }
    }
  })

  test('propagates saved Local AI settings to an already-open editor', async () => {
    const initialMock = await startModelsServer(200, {
      models: [
        {
          type: 'llm',
          key: 'initial-model',
          display_name: 'Initial Model',
          loaded_instances: [{ id: 'initial-model' }],
        },
      ],
    })
    const liveMock = await startModelsServer(200, {
      models: [
        {
          type: 'llm',
          key: 'live-model',
          display_name: 'Live Model',
          loaded_instances: [{ id: 'live-model' }],
          capabilities: { trained_for_tool_use: true },
        },
      ],
    })
    let launched: LaunchedApp | undefined
    try {
      launched = await launchShell({
        onboardingSeen: true,
        aiSettings: lmStudioSettings(initialMock.baseUrl),
        videoDir: 'home-lmstudio-live-settings',
      })
      const { app, page } = launched
      await page.locator('.quick-card', { hasText: 'AI Markdown' }).click()
      const editorPage = await waitForPageWithUrl(app, 'markdown/out')
      await expect(editorPage.locator('.doc-editor')).toBeVisible()

      // Configure a different server while the Markdown renderer remains open.
      await page.locator('.tab-bar .tab-item.tab-home').click()
      await page.getByTestId('lmstudio-status-button').click()
      await page.getByTestId('lmstudio-base-url').fill(liveMock.baseUrl)
      await page.getByTestId('lmstudio-api-token').fill('live-token')
      await page.getByTestId('lmstudio-model-mode').getByRole('button', { name: 'Manual' }).click()
      await page.getByTestId('lmstudio-model').fill('live-model')
      await page.getByTestId('lmstudio-save-test').click()
      await expect(page.getByTestId('lmstudio-save-success')).toBeVisible()

      await page.locator('.set-close').click()
      await page.locator('.tab-bar .tab-item:not(.tab-home)').click()
      const activeEditorPage = await waitForEditorPage(
        app,
        'markdown/out',
        '.ai-input-box textarea',
      )
      await activeEditorPage.locator('.ai-input-box textarea').fill('Confirm live settings')
      await activeEditorPage.locator('.ai-input-box textarea').press('Enter')

      await expect
        .poll(() => liveMock.requests.some((request) => request.method === 'POST'))
        .toBe(true)
      const chat = liveMock.requests.find((request) => request.method === 'POST')
      expect(chat?.authorization).toBe('Bearer live-token')
      expect(JSON.parse(chat?.body ?? '{}')).toMatchObject({ model: 'live-model' })
      expect(initialMock.requests.some((request) => request.method === 'POST')).toBe(false)
      await expect(activeEditorPage.locator('.ai-msg-assistant').last()).toContainText(
        'live-propagation-ok',
      )
    } finally {
      try {
        if (launched) await closeAndRemoveScratch(launched, 'home-lmstudio-live-settings')
      } finally {
        await Promise.all([initialMock.close(), liveMock.close()])
      }
    }
  })

  test('shows the LM Studio unauthorized state when its token is rejected', async () => {
    const mock = await startModelsServer(401, { error: { message: 'token required' } })
    let launched: LaunchedApp | undefined
    try {
      launched = await launchShell({
        onboardingSeen: true,
        aiSettings: lmStudioSettings(mock.baseUrl, 'e2e-invalid-token'),
        videoDir: 'home-lmstudio-unauthorized',
      })
      await expectFinalLmStudioStatus(launched.page, 'unauthorized')
      expect(
        mock.requests.some((request) => request.authorization === 'Bearer e2e-invalid-token'),
      ).toBe(true)
    } finally {
      try {
        if (launched) await closeAndRemoveScratch(launched, 'home-lmstudio-unauthorized')
      } finally {
        await mock.close()
      }
    }
  })

  test('shows a deterministic LM Studio unreachable state', async () => {
    const mock = await startUnreachableServer()
    let launched: LaunchedApp | undefined
    try {
      launched = await launchShell({
        onboardingSeen: true,
        aiSettings: lmStudioSettings(mock.baseUrl),
        videoDir: 'home-lmstudio-unreachable',
      })
      await expectFinalLmStudioStatus(launched.page, 'unreachable')
    } finally {
      try {
        if (launched) await closeAndRemoveScratch(launched, 'home-lmstudio-unreachable')
      } finally {
        await mock.close()
      }
    }
  })
})
