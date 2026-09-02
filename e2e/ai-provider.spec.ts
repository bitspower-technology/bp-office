import { expect, test } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { closeAndSaveVideo, launchShell, screenshotPath } from './helpers'

type ServerMode = 'connected' | 'no-models' | 'unauthorized'

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return (server.address() as AddressInfo).port
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
}

test.describe('AI provider settings', () => {
  test('shows every OpenAI Endpoint status and saves endpoint, required key, and model settings', async () => {
    let mode: ServerMode = 'connected'
    const authorizations: string[] = []
    const server = createServer((request, response) => {
      authorizations.push(request.headers.authorization ?? '')
      response.setHeader('content-type', 'application/json')
      if (mode === 'unauthorized') {
        response.statusCode = 401
        response.end(JSON.stringify({ error: 'token required' }))
        return
      }
      if (request.url !== '/api/v1/models') {
        response.statusCode = 404
        response.end(JSON.stringify({ error: 'not found' }))
        return
      }
      response.end(
        JSON.stringify({
          models:
            mode === 'no-models'
              ? []
              : [
                  {
                    key: 'tool-model',
                    display_name: 'Tool Model',
                    type: 'llm',
                    loaded_instances: [{}],
                    capabilities: { trained_for_tool_use: true, vision: true },
                  },
                ],
        }),
      )
    })
    const port = await listen(server)
    const userDataDir = await mkdtemp(join(tmpdir(), 'niuoffice-provider-e2e-'))
    await writeFile(
      join(userDataDir, 'ai-settings.json'),
      JSON.stringify({
        provider: 'lmstudio',
        providers: {
          lmstudio: {
            baseUrl: `http://127.0.0.1:${port}/v1`,
            model: '',
            apiKey: 'client-key',
          },
        },
      }),
    )

    const launched = await launchShell({
      userDataDir,
      onboardingSeen: true,
      videoDir: 'ai-provider-settings',
    })
    const { page } = launched
    try {
      await expect(page.getByTestId('lmstudio-status-text')).toHaveText('Connected · tool-model')
      await page.getByTestId('lmstudio-status-button').click()

      await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
      await expect(page.getByTestId('provider-lmstudio')).toBeVisible()
      await expect(page.getByTestId('provider-lmstudio')).toContainText('OpenAI Endpoint')
      await expect(page.getByTestId('provider-chatgpt')).toHaveCount(0)
      await expect(page.getByText('LM Studio', { exact: true })).toHaveCount(0)
      await expect(page.getByText('Account', { exact: true })).toHaveCount(0)
      await expect(page.getByText('Credits', { exact: true })).toHaveCount(0)
      await expect(page.getByText('Genspark', { exact: false })).toHaveCount(0)
      expect(authorizations.length).toBeGreaterThan(0)
      expect(authorizations.every((value) => value === 'Bearer client-key')).toBe(true)

      const beforeBlankKey = authorizations.length
      await page.getByTestId('lmstudio-api-token').fill('')
      await page.getByTestId('lmstudio-save-test').click()
      await expect(page.getByRole('alert')).toContainText('Authentication required')
      expect(
        authorizations.slice(beforeBlankKey).every((value) => value === 'Bearer client-key'),
      ).toBe(true)

      await page.getByTestId('lmstudio-model-mode').getByRole('button', { name: 'Manual' }).click()
      await page.getByTestId('lmstudio-model').fill('tool-model')
      await page.getByTestId('lmstudio-api-token').fill('required-client-key')
      const beforeRequiredKeySave = authorizations.length
      await page.getByTestId('lmstudio-save-test').click()
      await expect(page.getByTestId('lmstudio-save-success')).toBeVisible()
      expect(authorizations.length).toBeGreaterThan(beforeRequiredKeySave)
      expect(
        authorizations
          .slice(beforeRequiredKeySave)
          .every((value) => value === 'Bearer required-client-key'),
      ).toBe(true)

      mode = 'no-models'
      await page.getByTestId('lmstudio-refresh').click()
      await expect(page.getByTestId('lmstudio-settings-status')).toContainText(
        'Connected · no models',
      )

      mode = 'unauthorized'
      await page.getByTestId('lmstudio-refresh').click()
      await expect(page.getByTestId('lmstudio-settings-status')).toContainText(
        'Authentication required',
      )

      await closeServer(server)
      await page.getByTestId('lmstudio-refresh').click()
      await expect(page.getByTestId('lmstudio-settings-status')).toContainText('Not connected')
      expect(
        authorizations.every(
          (value) => value === 'Bearer client-key' || value === 'Bearer required-client-key',
        ),
      ).toBe(true)
      await page.screenshot({ path: screenshotPath('ai-provider-settings') })
    } finally {
      await closeAndSaveVideo(launched, 'ai-provider-settings')
      await closeServer(server)
    }
  })
})
