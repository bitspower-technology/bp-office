/** Launch the packaged Linux shell with a fresh isolated profile and verify Home. */
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'

const product = JSON.parse(readFileSync('branding/product.json', 'utf8'))
const folder = resolve(process.argv[2])
const profile = mkdtempSync(join(tmpdir(), 'niuoffice-package-smoke-'))
const userData = join(profile, product.userDataDirectory)
mkdirSync(userData, { recursive: true })
writeFileSync(join(userData, 'app-settings.json'), JSON.stringify({ onboardingSeen: true }))
const { ELECTRON_RUN_AS_NODE: _runAsNode, ...environment } = process.env
const app = await electron.launch({
  executablePath: join(folder, product.executableName),
  args: ['--no-sandbox', `--user-data-dir=${profile}`],
  timeout: 60_000,
  env: {
    ...environment,
    XDG_CONFIG_HOME: profile,
    GENOFFICE_LANG: 'en',
    ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
  },
})
const errors = []
const inspectWindow = (page) => page.on('pageerror', (error) => errors.push(error.message))
app.on('window', inspectWindow)
let stderr = ''
app.process().stderr?.on('data', (bytes) => {
  stderr += bytes.toString()
})
try {
  const window = await app.firstWindow()
  inspectWindow(window)
  const actualProfile = await app.evaluate(({ app }) => app.getPath('userData'))
  if (!resolve(actualProfile).startsWith(resolve(profile) + sep))
    throw new Error('Packaged smoke test did not isolate its user data.')
  await window.locator('.home-hero').waitFor({ timeout: 30_000 })
  await window.getByTestId('lmstudio-status-button').waitFor({ timeout: 15_000 })
  await window.getByText('AI Docs', { exact: true }).waitFor({ timeout: 15_000 })
  await window.getByText('AI Sheets', { exact: true }).waitFor({ timeout: 15_000 })
  const text = await window.locator('body').innerText()
  if (/Genspark|Sign in to GenOffice/.test(text))
    throw new Error('Upstream account UI leaked into packaged Home.')
  if (errors.length) throw new Error(`Renderer errors: ${errors.join('; ')}`)
  if (/Uncaught Exception|UnhandledPromiseRejection|Cannot find module/.test(stderr))
    throw new Error(`Packaged process failed: ${stderr}`)
  await window.screenshot({ path: join(folder, '..', 'linux-packaged-home.png') })
  console.log('Packaged Linux Home launched successfully.')
} finally {
  const kill = setTimeout(() => app.process().kill('SIGKILL'), 15_000)
  try {
    await app.close()
  } finally {
    clearTimeout(kill)
    // mkdtemp created this exact scratch profile; no user directory is touched.
    if (
      resolve(profile).startsWith(resolve(tmpdir()) + sep) &&
      profile.includes('niuoffice-package-smoke-')
    )
      rmSync(profile, { recursive: true, force: true })
  }
}
