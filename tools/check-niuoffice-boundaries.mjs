/**
 * Fails when a removed cloud/search/Slides surface is reintroduced into a
 * shipped NiuOffice source tree or packaging configuration.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const SHIPPED_ROOTS = [
  'apps/docs/src',
  'apps/sheets/src',
  'apps/pdf/src',
  'apps/markdown/src',
  'apps/shell/src',
  'packages/agent-core/src',
  'packages/ai-provider/src',
  'packages/electron-utils/src',
  'packages/ui/src',
]
const VISIBLE_BRAND_ROOTS = [
  'apps/docs/src/renderer',
  'apps/sheets/src/renderer',
  'apps/pdf/src/renderer',
  'apps/markdown/src/renderer',
  'apps/shell/src/renderer',
]
const CONFIG_FILES = [
  'package.json',
  'apps/docs/package.json',
  'apps/docs/electron.vite.config.ts',
  'apps/docs/vite.renderer.config.ts',
  'apps/sheets/package.json',
  'apps/sheets/electron.vite.config.ts',
  'apps/sheets/vite.renderer.config.ts',
  'apps/pdf/package.json',
  'apps/pdf/electron.vite.config.ts',
  'apps/pdf/vite.renderer.config.ts',
  'apps/markdown/package.json',
  'apps/markdown/electron.vite.config.ts',
  'apps/markdown/vite.renderer.config.ts',
  'apps/shell/package.json',
  'apps/shell/electron-builder.cjs',
  'packages/pdf2docx/src/index.ts',
  'package-lock.json',
  'tools/build-stale-preloads.mjs',
]
const CODE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.html',
  '.md',
  '.css',
  '.rs',
  '.toml',
  '.yaml',
  '.yml',
])
const SKIP_DIRS = new Set(['node_modules', 'out', 'dist', 'release', 'target'])

const FORBIDDEN = [
  ['AI Search workspace', /@genoffice\/ai-search/i],
  ['Genspark CLI', /@genspark\/cli/i],
  ['Genspark product branding', /\bGenspark\b/i],
  ['visible GenOffice package identity', /"(?:productName|author)"\s*:\s*"GenOffice\b/i],
  ['upstream Documents save folder', /documents.{0,48}['"]GenOffice['"]/i],
  [
    'Genspark cloud environment',
    /\b(?:GSK_API_KEY|GSK_CLI_PATH|AI_SEARCH_DISABLE_GSK|SERPER_API_KEY)\b/,
  ],
  ['network web-search tool', /\bweb_search\b/],
  ['network image-search tool', /\bimage_search\b/],
  ['removed network-acquisition prompt', /search\/API\/scraping/i],
  ['removed generated-image fallback copy', /pick another result or generate a new one/i],
  ['Genspark account IPC', /\b(?:ai:gsk|gskLogin|gskLogout|GensparkMark)\b/i],
  ['Genspark service URL', /https?:\/\/(?:www\.)?genspark\.ai/i],
  ['Genspark credits or pricing', /Genspark.{0,40}(?:credits?|pricing)/i],
  ['removed cloud-credit UI copy', /ribbonAiCreditNote|consum(?:e|es|ing) credits?/i],
  ['cloud project module', /cloud-projects/i],
  [
    'removed cloud media tool',
    /\b(?:generate_image|edit_image|analyze_image|analyze_media|transcribe_audio|transcribe_media|generate_slides|regenerate_slide)\b/i,
  ],
  [
    'removed Genspark provider wiring',
    /\b(?:cloudToolsEnabled|GenSparkAccountStatus|gskAccount|gskAuth)\b/i,
  ],
  [
    'removed PDF-to-PPTX conversion',
    /\b(?:pdf2pptx|pdf-to-pptx|convertPdfToPptx|ConvertPptxResult)\b/i,
  ],
  ['Slides renderer/module', /(?:modules\/slides|SLIDES_RENDERER_URL|@genoffice\/slides)/i],
  ['duplicate upstream file-drop bridge', /\b(?:DROP_OPEN_CHANNEL|installDropOpenBridge)\b/],
  ['Slides file association', /(?:ext\s*:\s*['"]pptx|file-pptx|\.pptx['"]\s*,?\s*role)/i],
  [
    'upstream analytics transport',
    /(?:google-analytics|measurement protocol|MEASUREMENT_ID|api_secret|trackEvent\s*\()/i,
  ],
]

function walk(path, output = []) {
  if (!existsSync(path)) return output
  if (!statSync(path).isDirectory()) {
    if (CODE_EXTENSIONS.has(extname(path))) output.push(path)
    return output
  }
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue
    walk(join(path, entry.name), output)
  }
  return output
}

const files = [
  ...SHIPPED_ROOTS.flatMap((path) => walk(join(ROOT, path))),
  ...CONFIG_FILES.map((path) => join(ROOT, path)),
]

function textForBoundaryScan(file, text) {
  const path = relative(ROOT, file).replaceAll('\\', '/')
  if (path !== 'packages/ai-provider/src/chatgpt-main.ts') return text

  // Codex app-server keeps these identifiers only as explicit deny controls.
  // Remove exactly the feature-list, process-wide, and per-thread disabled
  // declarations from the generic negative search while continuing to reject
  // any other web-search occurrence here.
  const disabledOnly = [
    /^\s*'standalone_web_search',\s*$/m,
    /^\s*'web_search',\s*$/m,
    /^\s*'web_search="disabled"',\s*$/m,
    /^\s*web_search:\s*'disabled',\s*$/m,
  ]
  let scrubbed = text
  for (const declaration of disabledOnly) {
    if (!declaration.test(scrubbed)) {
      throw new Error(`Missing expected ChatGPT web-search deny control: ${declaration}`)
    }
    scrubbed = scrubbed.replace(declaration, (matched) => matched.replace(/[^\r\n]/g, ' '))
  }
  return scrubbed
}

const violations = []
for (const file of files) {
  if (!existsSync(file)) continue
  const text = textForBoundaryScan(file, readFileSync(file, 'utf8'))
  for (const [label, pattern] of FORBIDDEN) {
    const match = pattern.exec(text)
    if (!match) continue
    const line = text.slice(0, match.index).split(/\r?\n/).length
    violations.push(`${relative(ROOT, file)}:${line}: ${label}: ${match[0]}`)
  }
}

for (const file of VISIBLE_BRAND_ROOTS.flatMap((path) => walk(join(ROOT, path)))) {
  const text = readFileSync(file, 'utf8')
  const match = /\bGenOffice(?:\s+AI)?\b/.exec(text)
  if (!match) continue
  const line = text.slice(0, match.index).split(/\r?\n/).length
  violations.push(`${relative(ROOT, file)}:${line}: visible upstream branding: ${match[0]}`)
}

if (existsSync(join(ROOT, 'packages/ai-search'))) {
  violations.push('packages/ai-search: removed AI Search workspace still exists')
}

if (existsSync(join(ROOT, 'packages/pdf2docx/tests/rebuild-pptx.test.ts'))) {
  violations.push(
    'packages/pdf2docx/tests/rebuild-pptx.test.ts: removed PDF-to-PPTX test still exists',
  )
}

if (violations.length > 0) {
  console.error('NiuOffice product-boundary violations:')
  for (const violation of violations) console.error(`  ${violation}`)
  process.exit(1)
}

console.log(`NiuOffice product boundaries verified across ${files.length} shipped files.`)
