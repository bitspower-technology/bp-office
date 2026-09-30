import { test, expect } from '@playwright/test'
import { launchShell, closeAndSaveVideo, screenshotPath } from './helpers'

test.describe('home screen', () => {
  test('never displays a GitHub star invitation for an existing upgraded profile', async () => {
    const launched = await launchShell({
      onboardingSeen: true,
      settings: {
        lastRunVersion: '0.1.0',
        starPrompt: { firstRunAt: 1, docOpens: 50, shownCount: 0 },
      },
      videoDir: 'home-no-star-invitation',
    })
    const { page } = launched
    try {
      await expect(page.locator('.home-hero')).toBeVisible()
      await expect(page.locator('.star-prompt')).toHaveCount(0)
      await expect(page.getByText('Enjoying NiuOffice?', { exact: true })).toHaveCount(0)
      await expect(page.getByText('Star NiuOffice', { exact: true })).toHaveCount(0)
      const exposedMethods = await page.evaluate(() => Object.keys(window.aiOffice))
      expect(exposedMethods).not.toContain('starPromptShouldShow')
      expect(exposedMethods).not.toContain('starPromptAction')
      expect(exposedMethods).toContain('openGitHubRepo')
    } finally {
      await closeAndSaveVideo(launched, 'home-no-star-invitation')
    }
  })

  test('shows hero, quick-create cards and tab bar', async () => {
    const launched = await launchShell({ onboardingSeen: true, videoDir: 'home-basics' })
    const { page } = launched
    try {
      await expect(page.locator('.home-hero')).toBeVisible()
      // Five shipped editors with blank-file creation plus the local-file card.
      await expect(page.locator('.quick-card')).toHaveCount(6)
      await expect(page.locator('.quick-card').first()).toContainText('AI Docs')
      await expect(page.locator('.quick-card').nth(1)).toContainText('AI Sheets')
      await expect(page.locator('.quick-card').nth(2)).toContainText('AI Markdown')
      await expect(page.locator('.quick-card').nth(3)).toContainText('AI HTML')
      await expect(page.locator('.quick-card').nth(4)).toContainText('PDF')
      await expect(page.locator('.quick-card').nth(5)).toContainText('Open Local File')
      await expect(page.getByText('AI Slides', { exact: true })).toHaveCount(0)
      await expect(page.locator('.tab-bar .tab-item.tab-home')).toBeVisible()
      await expect(page.getByTestId('lmstudio-status-button')).toBeVisible()
      await page.screenshot({ path: screenshotPath('home-overview') })
    } finally {
      await closeAndSaveVideo(launched, 'home-basics')
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
      await closeAndSaveVideo(launched, 'home-zh-cn')
    }
  })

  for (const size of [
    { width: 2048, height: 1100 },
    { width: 980, height: 700 },
  ]) {
    test(`keeps the recent filters in-flow at ${size.width}x${size.height}`, async () => {
      const launched = await launchShell({
        onboardingSeen: true,
        videoDir: `home-layout-${size.width}`,
      })
      const { page } = launched
      try {
        await page.setViewportSize(size)
        const toolbar = page.locator('.recents-toolbar')
        const filters = page.locator('.filter-pills')
        await expect(toolbar).toBeVisible()
        await expect(filters).toBeVisible()
        const toolbarBox = await toolbar.boundingBox()
        const filterBox = await filters.boundingBox()
        expect(toolbarBox).not.toBeNull()
        expect(filterBox).not.toBeNull()
        expect(filterBox!.x).toBeGreaterThanOrEqual(toolbarBox!.x - 1)
        expect(filterBox!.y).toBeGreaterThanOrEqual(toolbarBox!.y - 1)
        expect(filterBox!.x + filterBox!.width).toBeLessThanOrEqual(
          toolbarBox!.x + toolbarBox!.width + 1,
        )
        expect(filterBox!.y + filterBox!.height).toBeLessThanOrEqual(
          toolbarBox!.y + toolbarBox!.height + 1,
        )
        await page.screenshot({ path: screenshotPath(`home-layout-${size.width}`) })
      } finally {
        await closeAndSaveVideo(launched, `home-layout-${size.width}`)
      }
    })
  }
})
