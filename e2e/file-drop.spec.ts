import { expect, test, type Page } from '@playwright/test'
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

function minimalPdf(): Buffer {
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << >> /Contents 4 0 R >>\nendobj\n',
    '4 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\n',
  ]
  let body = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
  const offsets = [0]
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body, 'latin1'))
    body += object
  }
  const xrefOffset = Buffer.byteLength(body, 'latin1')
  body += `xref\n0 ${objects.length + 1}\n`
  body += '0000000000 65535 f \n'
  for (const offset of offsets.slice(1)) {
    body += `${offset.toString().padStart(10, '0')} 00000 n \n`
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(body, 'latin1')
}

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

test.describe('opening Explorer/Finder files by drag and drop', () => {
  test.describe.configure({ mode: 'serial' })

  test('Home and every shipped editor open path-backed files in new tabs', async () => {
    const fixtureDir = await createFileDropFixtureDir()
    const docxPath = join(fixtureDir, 'drag-report.docx')
    const csvPath = join(fixtureDir, 'drag-data.csv')
    const pdfPath = join(fixtureDir, 'drag-review.pdf')
    const markdownPath = join(fixtureDir, 'drag-notes.md')
    const unsupportedPath = join(fixtureDir, 'ignore.txt')
    const removedSlidesPath = join(fixtureDir, 'ignore-slides.pptx')
    await Promise.all([
      copyFile(SIMPLE_DOCX, docxPath),
      writeFile(csvPath, 'Name,Value\nBP-Office,358\n'),
      writeFile(pdfPath, minimalPdf()),
      writeFile(markdownPath, '# Dropped notes\n\nOpened from a local file drag.\n'),
      writeFile(unsupportedPath, 'This format is intentionally unsupported.\n'),
      writeFile(removedSlidesPath, 'PPTX opening is intentionally absent.\n'),
    ])

    let launched: LaunchedApp | undefined
    try {
      launched = await launchShell({ onboardingSeen: true, videoDir: 'file-drop-all-surfaces' })
      const { app, page: shellPage } = launched
      const editorTabs = shellPage.locator('.tab-bar .tab-item:not(.tab-home)')
      await expect(editorTabs).toHaveCount(0)

      // CDP supplies real filesystem paths, which exercises each preload's
      // webUtils.getPathForFile() bridge and the main-process sender/path gate.
      const drag = await beginLocalFileDrag(
        shellPage,
        [docxPath, csvPath, pdfPath, markdownPath, docxPath, unsupportedPath, removedSlidesPath],
        '.app-frame-content',
      )
      try {
        await expect(shellPage.getByTestId('file-drop-overlay')).toBeVisible()
        await drag.drop()
      } finally {
        await drag.cancel()
      }

      await expect(shellPage.getByTestId('file-drop-overlay')).toBeHidden()
      await expect(editorTabs).toHaveCount(4)
      for (const name of [
        'drag-report.docx',
        'drag-data.csv',
        'drag-review.pdf',
        'drag-notes.md',
      ]) {
        await expect(editorTabs.filter({ hasText: name })).toHaveCount(1)
      }
      await expect(editorTabs.filter({ hasText: 'ignore.txt' })).toHaveCount(0)
      await expect(editorTabs.filter({ hasText: 'ignore-slides.pptx' })).toHaveCount(0)

      const surfaces: Array<{ name: string; url: string; page: Page }> = []
      for (const [name, url] of [
        ['drag-report.docx', 'docs/out'],
        ['drag-data.csv', 'sheets/out'],
        ['drag-review.pdf', 'pdf/out'],
        ['drag-notes.md', 'markdown/out'],
      ] as const) {
        surfaces.push({ name, url, page: await waitForPageWithUrl(app, url) })
      }

      for (const [index, surface] of surfaces.entries()) {
        await editorTabs.filter({ hasText: surface.name }).click()
        await expect(editorTabs.filter({ hasText: surface.name })).toHaveClass(/active/)
        await expect(surface.page.locator('.ribbon-tabs')).toBeVisible()

        const droppedName = `from-${surface.url.split('/')[0]}-${index}.md`
        const droppedPath = join(fixtureDir, droppedName)
        await writeFile(droppedPath, `# Dropped over ${surface.url}\n`)
        await dropLocalFiles(surface.page, [droppedPath], '.ribbon-tabs')

        const droppedTab = editorTabs.filter({ hasText: droppedName })
        await expect(droppedTab).toHaveCount(1)
        await expect(droppedTab).toHaveClass(/active/)
      }

      // An unsupported path neither creates a tab nor lets Chromium navigate.
      await shellPage.locator('.tab-bar .tab-item.tab-home').click()
      const tabCount = await editorTabs.count()
      await dropLocalFiles(shellPage, [removedSlidesPath], '.app-frame-content')
      await expect(editorTabs).toHaveCount(tabCount)
      await expect(shellPage.locator('.home')).toBeVisible()
    } finally {
      await closeAndClean(launched, fixtureDir, 'file-drop-all-surfaces')
    }
  })
})
