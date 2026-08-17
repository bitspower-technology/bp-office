import { expect, test } from '@playwright/test'
import { copyFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  beginLocalFileDrag,
  closeAndSaveVideo,
  createFileDropFixtureDir,
  dropLocalFiles,
  launchShell,
  removeFileDropFixtureDir,
  removeScratchUserData,
  waitForPageWithUrl,
  type LaunchedApp,
} from './helpers'

const SIMPLE_DOCX = resolve('apps/docs/tests/pagination-corpus/docx/simple.docx')

async function closeAndClean(
  launched: LaunchedApp | undefined,
  fixtureDir: string,
  videoName: string,
): Promise<void> {
  try {
    if (launched) {
      try {
        await closeAndSaveVideo(launched, videoName)
      } finally {
        await removeScratchUserData(launched.userDataDir)
      }
    }
  } finally {
    await removeFileDropFixtureDir(fixtureDir)
  }
}

test.describe('opening local files by drag and drop', () => {
  test.describe.configure({ mode: 'serial' })

  test('Home opens a supported multi-file drop once each and rejects unsupported files', async () => {
    const fixtureDir = await createFileDropFixtureDir()
    const docxPath = join(fixtureDir, 'drag-report.docx')
    const markdownPath = join(fixtureDir, 'drag-notes.md')
    const unsupportedPath = join(fixtureDir, 'ignore.txt')
    await Promise.all([
      copyFile(SIMPLE_DOCX, docxPath),
      writeFile(markdownPath, '# Dropped notes\n\nOpened from a local file drag.\n'),
      writeFile(unsupportedPath, 'This format is intentionally unsupported.\n'),
    ])

    let launched: LaunchedApp | undefined
    try {
      launched = await launchShell({ onboardingSeen: true, videoDir: 'file-drop-home' })
      const { app, page } = launched
      const editorTabs = page.locator('.tab-bar .tab-item:not(.tab-home)')
      await expect(editorTabs).toHaveCount(0)

      // Include a duplicate and an unsupported path in the same batch. The
      // supported files open in input order, while neither rejected entry
      // creates a tab. The last accepted file is active.
      const drag = await beginLocalFileDrag(
        page,
        [docxPath, markdownPath, docxPath, unsupportedPath],
        '.app-frame-content',
      )
      try {
        await expect(page.getByTestId('file-drop-overlay')).toBeVisible()
        await drag.drop()
      } finally {
        await drag.cancel()
      }

      await expect(page.getByTestId('file-drop-overlay')).toBeHidden()
      await expect(editorTabs).toHaveCount(2)
      await expect(editorTabs.filter({ hasText: 'drag-report.docx' })).toHaveCount(1)
      const markdownTab = editorTabs.filter({ hasText: 'drag-notes.md' })
      await expect(markdownTab).toHaveCount(1)
      await expect(markdownTab).toHaveClass(/active/)
      await expect(editorTabs.filter({ hasText: 'ignore.txt' })).toHaveCount(0)
      await waitForPageWithUrl(app, 'docs/out')
      await waitForPageWithUrl(app, 'markdown/out')

      // An all-unsupported batch is rejected without changing tabs or letting
      // Chromium navigate the Home renderer to the dropped file.
      await page.locator('.tab-bar .tab-item.tab-home').click()
      await expect(page.locator('.tab-bar .tab-item.tab-home')).toHaveClass(/active/)
      await dropLocalFiles(page, [unsupportedPath], '.app-frame-content')
      await expect(editorTabs).toHaveCount(2)
      await expect(page.locator('.tab-bar .tab-item.tab-home')).toHaveClass(/active/)
      await expect(page.locator('.home')).toBeVisible()
      await expect(page.getByTestId('file-drop-overlay')).toBeHidden()
    } finally {
      await closeAndClean(launched, fixtureDir, 'file-drop-home')
    }
  })

  test('dropping over an active editor opens the local file in a new tab', async () => {
    const fixtureDir = await createFileDropFixtureDir()
    const firstPath = join(fixtureDir, 'already-open.md')
    const droppedPath = join(fixtureDir, 'dropped-over-editor.md')
    await Promise.all([
      writeFile(firstPath, '# Already open\n'),
      writeFile(droppedPath, '# Dropped over editor\n'),
    ])

    let launched: LaunchedApp | undefined
    try {
      launched = await launchShell({
        onboardingSeen: true,
        videoDir: 'file-drop-active-editor',
        openFile: firstPath,
      })
      const { app } = launched
      const shellPage = await waitForPageWithUrl(app, 'shell/out')
      const firstEditor = await waitForPageWithUrl(app, 'markdown/out')
      const editorTabs = shellPage.locator('.tab-bar .tab-item:not(.tab-home)')
      await expect(editorTabs).toHaveCount(1)
      await expect(editorTabs.first()).toContainText('already-open.md')
      await expect(firstEditor.locator('.doc-editor')).toContainText('Already open')

      // Target editor chrome rather than the ProseMirror canvas: this verifies
      // the active WebContentsView's global drop bridge without invoking the
      // editor's intentional content/image drop behavior.
      await dropLocalFiles(firstEditor, [droppedPath], '.ribbon-tabs')

      await expect(editorTabs).toHaveCount(2)
      const droppedTab = editorTabs.filter({ hasText: 'dropped-over-editor.md' })
      await expect(droppedTab).toHaveCount(1)
      await expect(droppedTab).toHaveClass(/active/)
      await expect
        .poll(
          () =>
            app.windows().filter((candidate) => candidate.url().includes('markdown/out')).length,
        )
        .toBe(2)
    } finally {
      await closeAndClean(launched, fixtureDir, 'file-drop-active-editor')
    }
  })
})
