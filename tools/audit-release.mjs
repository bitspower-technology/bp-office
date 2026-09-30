/** Fail closed when a package loses a required runtime or revives a removed service. */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { extractFile, listPackage } from '@electron/asar'

const root = resolve(process.argv[2] || 'apps/shell/release')
const product = JSON.parse(readFileSync('branding/product.json', 'utf8'))
const unpacked = readdirSync(root).filter((name) => /(?:win|linux).*unpacked$/.test(name))
if (!unpacked.length) throw new Error('No unpacked build to audit.')
const requiredModules = ['docs', 'sheets', 'pdf', 'markdown', 'html']
for (const name of unpacked) {
  const resources = join(root, name, 'resources')
  const modules = readdirSync(join(resources, 'modules')).sort()
  if (JSON.stringify(modules) !== JSON.stringify([...requiredModules].sort())) {
    throw new Error(`Unexpected packaged modules: ${modules.join(', ')}`)
  }
  for (const module of modules) {
    for (const file of ['preload/index.js', 'renderer/index.html']) {
      if (!existsSync(join(resources, 'modules', module, file)))
        throw new Error(`Missing ${module}/${file}`)
    }
  }
  for (const forbidden of ['cli', 'gsk', 'mcp', 'headless', 'ai-search']) {
    if (existsSync(join(resources, forbidden)))
      throw new Error(`Forbidden packaged resource: ${forbidden}`)
  }
  const windows = name.startsWith('win')
  const ext = windows ? '.exe' : ''
  const required = [
    'LICENSE',
    'NOTICE',
    'THIRD-PARTY-NOTICES.txt',
    'LICENSES.chromium.html',
    'wasm/pdfium.wasm',
    'wasm/hb-subset.wasm',
    `native/xlsx-sidecar${ext}`,
  ]
  if (product.features.chatgptSubscription)
    required.push(`native/codex${ext}`, `native/codex-code-mode-host${ext}`)
  for (const file of required) {
    if (!existsSync(join(resources, file)) || statSync(join(resources, file)).size === 0)
      throw new Error(`Missing or empty resource: ${file}`)
  }
  if (
    !product.features.chatgptSubscription &&
    readdirSync(join(resources, 'native')).some((file) => file.startsWith('codex'))
  )
    throw new Error('OEM contains ChatGPT runtime.')
  const paths = listPackage(join(resources, 'app.asar'))
  if (
    paths.some((file) => /(?:[/\\](?:gsk|cli|mcp|ai-search)[/\\]|modules[/\\]slides)/i.test(file))
  )
    throw new Error('Forbidden content in application archive.')
  const forbiddenWiring =
    /gskLogin|gskLogout|GenSparkAccountStatus|GensparkMark|startHeadlessServer|startMcpServer|installMcp|GENOFFICE_MCP|mcp-stdio-bridge|@genoffice\/ai-search|@genspark\/cli/
  for (const file of paths.filter((file) => /\.[cm]?js$/.test(file))) {
    const text = extractFile(join(resources, 'app.asar'), file.replace(/^[/\\]/, '')).toString(
      'utf8',
    )
    if (forbiddenWiring.test(text))
      throw new Error(`Forbidden service wiring in app archive: ${file}`)
  }
  function auditModule(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name)
      if (entry.isDirectory()) auditModule(file)
      else if (/\.[cm]?js$/.test(file) && forbiddenWiring.test(readFileSync(file, 'utf8')))
        throw new Error(`Forbidden service wiring: ${file}`)
    }
  }
  auditModule(join(resources, 'modules'))
  console.log(`Audited ${name}: ${modules.join(', ')}; runtime and license resources present.`)
}
