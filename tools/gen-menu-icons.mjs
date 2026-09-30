/**
 * Generates the native tab/overflow-menu icons that the shell main process loads
 * through menuIcons() (apps/shell/src/main/index.ts, TAB_MENU_ICON): a 16x16 and a
 * 32x32 transparent RGBA PNG per shipped document kind.
 *
 * Source of truth is the same distributor-owned file-type tiles the tab strip and
 * the Home cards use (apps/shell/src/renderer/src/assets/file-*.svg), so the native
 * menu can never drift from the in-app artwork. Rasterization matches
 * gen-file-association-icons.mjs: system Chromium via Playwright, transparent page
 * background. Set FILE_ICON_BROWSER_PATH or FILE_ICON_BROWSER_CHANNEL when the
 * default `chrome` channel is unavailable.
 *
 * Regenerate after changing any file-*.svg:
 *   node tools/gen-menu-icons.mjs
 *
 * menu-home.png / menu-home@2x.png belong to Home navigation, not to a document
 * kind, and are deliberately not written here.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svgDir = join(root, 'apps/shell/src/renderer/src/assets')
const outDir = join(root, 'apps/shell/src/main/assets')

// Shell kind -> tile. Must stay in step with TAB_MENU_ICON in the shell main process.
const KINDS = ['docx', 'xlsx', 'pdf', 'md', 'html']
const DENSITIES = [
  ['', 16],
  ['@2x', 32],
]
// A menu glyph that rasterizes almost empty means the source tile is broken or the
// browser rendered nothing; fail instead of committing an invisible icon.
const MIN_INK_RATIO = 0.5

async function renderPng(page, dataUrl, size) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<body style="margin:0;background:none"><img src="${dataUrl}" width="${size}" height="${size}"></body>`,
  )
  return page.screenshot({ omitBackground: true })
}

/** PNG header + IHDR give width/height/color type without another dependency. */
function pngStats(png) {
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('not a PNG')
  const width = png.readUInt32BE(16)
  const height = png.readUInt32BE(20)
  const colorType = png[25]
  return { width, height, colorType }
}

/** Decodes alpha coverage through Chromium again, so the check works on any host. */
async function inkRatio(page, png) {
  const dataUrl = `data:image/png;base64,${png.toString('base64')}`
  await page.setViewportSize({ width: 1, height: 1 })
  await page.setContent(
    `<body style="margin:0"><img src="${dataUrl}"></body><canvas id="c"></canvas>`,
    { waitUntil: 'load' },
  )
  // This callback runs inside Chromium, not Node: `Image` and `document` exist there,
  // so the Node-scoped no-undef rule does not apply to them.
  /* eslint-disable no-undef */
  return page.evaluate(async (url) => {
    const image = new Image()
    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = reject
      image.src = url
    })
    const canvas = document.getElementById('c')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(image, 0, 0)
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let ink = 0
    for (let i = 3; i < data.length; i += 4) if (data[i] > 24) ink++
    return ink / (canvas.width * canvas.height)
  }, dataUrl)
  /* eslint-enable no-undef */
}

const browserPath = process.env.FILE_ICON_BROWSER_PATH
const browser = await chromium.launch(
  browserPath
    ? { executablePath: browserPath, headless: true }
    : { channel: process.env.FILE_ICON_BROWSER_CHANNEL ?? 'chrome', headless: true },
)
const page = await browser.newPage({ deviceScaleFactor: 1 })

try {
  mkdirSync(outDir, { recursive: true })
  for (const kind of KINDS) {
    const svg = readFileSync(join(svgDir, `file-${kind}.svg`))
    const dataUrl = `data:image/svg+xml;base64,${svg.toString('base64')}`
    for (const [suffix, size] of DENSITIES) {
      const png = await renderPng(page, dataUrl, size)
      const stats = pngStats(png)
      if (stats.width !== size || stats.height !== size) {
        throw new Error(`menu-${kind}${suffix}.png: got ${stats.width}x${stats.height}`)
      }
      // color type 6 = RGBA; a palette or RGB encode would drop the transparent margin.
      if (stats.colorType !== 6) throw new Error(`menu-${kind}${suffix}.png: not RGBA`)
      const ink = await inkRatio(page, png)
      if (ink < MIN_INK_RATIO) {
        throw new Error(
          `menu-${kind}${suffix}.png is only ${(ink * 100).toFixed(1)}% ink; refusing to write`,
        )
      }
      writeFileSync(join(outDir, `menu-${kind}${suffix}.png`), png)
      console.log(`generated menu-${kind}${suffix}.png (${size}x${size}, RGBA)`)
    }
  }
} finally {
  await browser.close()
}
