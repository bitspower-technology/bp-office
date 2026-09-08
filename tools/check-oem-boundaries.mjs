/**
 * Fail-closed source gate for the distributable OEM branch.
 *
 * The main branch intentionally contains both provider implementations, so
 * this check is run only for OEM CI. It verifies the edition policy and the
 * dependency/update/release boundaries that make the OEM template safe to
 * hand to a downstream rebranding agent.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const SKIP_DIRECTORIES = new Set(['.git', 'node_modules', 'out', 'dist', 'release', 'target'])
const CODEX_PACKAGE = /^@openai\/codex(?:-|$)/
const violations = []

function repoPath(path) {
  return relative(ROOT, path).replaceAll('\\', '/')
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    violations.push(
      `${repoPath(path)}: invalid JSON (${error instanceof Error ? error.message : error})`,
    )
    return null
  }
}

function requireCondition(condition, message) {
  if (!condition) violations.push(message)
}

function occurrenceCount(value, needle) {
  return value.split(needle).length - 1
}

function packageManifests(path, output = []) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRECTORIES.has(entry.name)) packageManifests(join(path, entry.name), output)
      continue
    }
    if (entry.isFile() && entry.name === 'package.json') output.push(join(path, entry.name))
  }
  return output
}

function findCodexDependencyKeys(value, path = '$', output = []) {
  if (!value || typeof value !== 'object') return output
  if (Array.isArray(value)) {
    value.forEach((item, index) => findCodexDependencyKeys(item, `${path}[${index}]`, output))
    return output
  }
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`
    if (CODEX_PACKAGE.test(key) || key.startsWith('node_modules/@openai/codex')) {
      output.push(childPath)
    }
    if (typeof child === 'string' && /(?:^|npm:)@openai\/codex(?:-|@|$)/.test(child)) {
      output.push(`${childPath}=${child}`)
    }
    findCodexDependencyKeys(child, childPath, output)
  }
  return output
}

const productPath = join(ROOT, 'branding/product.json')
const product = readJson(productPath)
requireCondition(product?.schemaVersion === 1, 'branding/product.json: schemaVersion must be 1')
requireCondition(product?.edition === 'oem', 'branding/product.json: edition must be "oem"')
requireCondition(
  product?.features?.chatgptSubscription === false,
  'branding/product.json: features.chatgptSubscription must be false',
)
// The upstream template repository never serves distributor binaries: an OEM checkout that
// still points at it must keep automatic updates switched off. A distributor owns its own
// public feed (see branding/product.json repository) and enables updates there instead.
const isUpstreamTemplateRepository =
  product?.repository?.owner === 'Niuulh' && product?.repository?.name === 'NiuOffice'
requireCondition(
  product?.updates?.enabled === false || !isUpstreamTemplateRepository,
  'branding/product.json: updates must stay disabled while OEM points at Niuulh/NiuOffice',
)

// The edition policy is the runtime authority for persisted and renderer-
// supplied provider IDs. Keep this structural check alongside its unit tests
// so an OEM change cannot silently turn the feature flags into UI-only hints.
const editionPolicyPath = join(ROOT, 'packages/ai-provider/src/product-edition.ts')
const editionPolicy = existsSync(editionPolicyPath)
  ? readFileSync(editionPolicyPath, 'utf8').replace(/\s+/g, ' ')
  : ''
requireCondition(
  editionPolicy.includes("productConfig.edition === 'oem'"),
  `${repoPath(editionPolicyPath)}: OEM edition must activate the endpoint-only policy`,
)
requireCondition(
  /return !ENDPOINT_ONLY_EDITION \|\| provider === ['"]lmstudio['"]/.test(editionPolicy),
  `${repoPath(editionPolicyPath)}: only the OpenAI Endpoint provider may be enabled in OEM`,
)
requireCondition(
  /return \{ \.\.\.settings, provider: ['"]lmstudio['"] \}/.test(editionPolicy),
  `${repoPath(editionPolicyPath)}: unsupported active providers must migrate to OpenAI Endpoint`,
)
requireCondition(
  editionPolicy.includes(
    'CHATGPT_SUBSCRIPTION_ENABLED = productConfig.features.chatgptSubscription',
  ),
  `${repoPath(editionPolicyPath)}: ChatGPT runtime availability must come from the product flag`,
)

for (const relativePath of [
  'apps/docs/src/main/docs-main.ts',
  'apps/sheets/src/main/sheets-main.ts',
]) {
  const path = join(ROOT, relativePath)
  const source = existsSync(path) ? readFileSync(path, 'utf8') : ''
  requireCondition(
    occurrenceCount(source, 'constrainAiSettingsToProduct(') >= 4,
    `${relativePath}: get, set, chat, and stream IPC paths must constrain provider settings`,
  )
}

const shellMainPath = join(ROOT, 'apps/shell/src/main/index.ts')
const shellMain = existsSync(shellMainPath) ? readFileSync(shellMainPath, 'utf8') : ''
requireCondition(
  shellMain.includes('CHATGPT_SUBSCRIPTION_ENABLED ? chatGptProvider() : null'),
  `${repoPath(shellMainPath)}: ChatGPT service creation must be gated by the product flag`,
)
requireCondition(
  /if \(chatGpt\) \{[\s\S]*HOME_CHANNELS\.getChatGptConfig[\s\S]*HOME_CHANNELS\.chatGptLogout[\s\S]*\n[ ]{2}\}/.test(
    shellMain,
  ),
  `${repoPath(shellMainPath)}: every shell ChatGPT IPC handler must remain inside the runtime gate`,
)

const shellSettingsPath = join(ROOT, 'apps/shell/src/main/lmstudio-settings.ts')
const shellSettings = existsSync(shellSettingsPath) ? readFileSync(shellSettingsPath, 'utf8') : ''
requireCondition(
  occurrenceCount(shellSettings, 'assertProductAiProviderEnabled(') >= 2,
  `${repoPath(shellSettingsPath)}: provider selection and ChatGPT writes must enforce the edition`,
)

const providerPanePath = join(ROOT, 'apps/shell/src/renderer/src/AiProviderPane.tsx')
const providerPane = existsSync(providerPanePath) ? readFileSync(providerPanePath, 'utf8') : ''
requireCondition(
  providerPane.includes('{CHATGPT_SUBSCRIPTION_ENABLED && ('),
  `${repoPath(providerPanePath)}: ChatGPT selector must be hidden when the feature is disabled`,
)

const manifests = packageManifests(ROOT)
for (const manifestPath of manifests) {
  const manifest = readJson(manifestPath)
  if (!manifest) continue
  const references = findCodexDependencyKeys(manifest)
  for (const reference of references) {
    violations.push(`${repoPath(manifestPath)}: forbidden OEM Codex dependency at ${reference}`)
  }
}

const lockPath = join(ROOT, 'package-lock.json')
const packageLock = readJson(lockPath)
if (packageLock) {
  for (const reference of findCodexDependencyKeys(packageLock)) {
    violations.push(`${repoPath(lockPath)}: forbidden OEM Codex package at ${reference}`)
  }
}

const builderPath = join(ROOT, 'apps/shell/electron-builder.cjs')
const builder = existsSync(builderPath)
  ? readFileSync(builderPath, 'utf8').replace(/\s+/g, ' ')
  : ''
requireCondition(
  /defaultUpdateUrl = productConfig\.updates\.enabled \?/.test(builder),
  `${repoPath(builderPath)}: the default update feed must be gated by updates.enabled`,
)
requireCondition(
  /const chatGptEnabled = productConfig\.features\.chatgptSubscription/.test(builder),
  `${repoPath(builderPath)}: packaged ChatGPT resources must be gated by the product flag`,
)
requireCondition(
  /\.\.\.\(chatGptEnabled \? \[/.test(builder),
  `${repoPath(builderPath)}: ChatGPT native resources must be excluded when disabled`,
)

const noticesPath = join(ROOT, 'tools/gen-third-party-notices.mjs')
const notices = existsSync(noticesPath) ? readFileSync(noticesPath, 'utf8') : ''
requireCondition(
  /PRODUCT_CONFIG\.features\?\.chatgptSubscription \? \[['"]@openai\/codex['"]\] : \[\]/.test(
    notices.replace(/\s+/g, ' '),
  ),
  `${repoPath(noticesPath)}: Codex notices must be included only when ChatGPT ships`,
)

// OEM inherits the main workflow for maintenance, but that workflow must fail
// before building or publishing whenever the checked-out product is OEM. If a
// downstream removes the workflow entirely, the OEM source is also safe.
const releaseWorkflowPath = join(ROOT, '.github/workflows/release-main.yml')
if (existsSync(releaseWorkflowPath)) {
  const releaseWorkflow = readFileSync(releaseWorkflowPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n')
  requireCondition(
    /if \(\$product\.edition -cne ['"]main['"]\)/.test(releaseWorkflow),
    `${repoPath(releaseWorkflowPath)}: release preflight must reject non-main editions`,
  )
  requireCondition(
    /if \(\$product\.updates\.enabled -ne \$true\)/.test(releaseWorkflow),
    `${repoPath(releaseWorkflowPath)}: release preflight must require enabled updates`,
  )
  requireCondition(
    /\+refs\/heads\/main:refs\/remotes\/origin\/main/.test(releaseWorkflow) &&
      /\$tagCommit -cne \$mainCommit/.test(releaseWorkflow),
    `${repoPath(releaseWorkflowPath)}: release tag must be verified against origin/main`,
  )
}

if (violations.length > 0) {
  console.error('OEM distribution-boundary violations:')
  for (const violation of violations) console.error(`  ${violation}`)
  process.exit(1)
}

console.log(
  `OEM boundaries verified: endpoint-only, ChatGPT/Codex disabled, upstream feed protected, and main-only upstream releases enforced (${manifests.length} manifests).`,
)
