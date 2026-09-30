import { test, expect } from '@playwright/test'
import { launchShell, closeAndSaveVideo, screenshotPath } from './helpers'

test('settings expose AI providers without removed cloud media, network search, or server controls', async () => {
  const launched = await launchShell({
    onboardingSeen: true,
    videoDir: 'settings-product-boundaries',
  })
  const { page } = launched
  try {
    await page.getByTestId('lmstudio-status-button').click()
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await expect(dialog).toBeVisible()
    await page.locator('.set-nav-item').filter({ hasText: 'General' }).click()
    await expect(page.getByRole('switch', { name: 'Jev search reranking' })).toHaveCount(0)

    await expect(page.locator('.set-nav-item', { hasText: 'AI Media & Search' })).toHaveCount(0)
    await expect(page.locator('.set-nav-item', { hasText: /Account|MCP|Headless/ })).toHaveCount(0)
    await expect(dialog.locator('#set-search-jev-key')).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Jev endpoint', exact: true })).toHaveCount(0)

    await page.locator('.set-close').click()
    await page.getByTestId('lmstudio-status-button').click()
    await expect(dialog).toBeVisible()
    await expect(page.getByTestId('provider-lmstudio')).toContainText('OpenAI Endpoint')
    await expect(dialog.getByText('Genspark', { exact: false })).toHaveCount(0)
    await expect(dialog.getByText('Credits', { exact: true })).toHaveCount(0)
    await expect(dialog.getByRole('switch', { name: 'Jev search reranking' })).toHaveCount(0)
    await page.screenshot({ path: screenshotPath('settings-product-boundaries') })
  } finally {
    await closeAndSaveVideo(launched, 'settings-product-boundaries')
  }
})
