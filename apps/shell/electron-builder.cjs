/**
 * electron-builder configuration (moved out of package.json "build" so the
 * auto-update feed URL can be injected at build time instead of living in
 * the repo).
 *
 * NIUOFFICE_UPDATE_URL — optional public base URL override for the generic
 * update provider. Normal builds derive the GitHub Releases feed from
 * branding/product.json so installed main-edition builds follow the same
 * repository that publishes their source and binaries.
 *
 * Editions with updates.enabled=false omit publish configuration unless an
 * explicit override is supplied. Main-edition builds always bake the public
 * release feed into app-update.yml, including local packaging smoke tests.
 */

const { execFileSync } = require('node:child_process')
const { existsSync, rmSync, statSync } = require('node:fs')
const { dirname, join } = require('node:path')
const productConfig = require('../../branding/product.json')

const GITHUB_SEGMENT = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/
const ARTIFACT_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

function validateProductConfig(value) {
  if (value?.schemaVersion !== 1) throw new Error('Unsupported product configuration schema.')
  if (value.edition !== 'main' && value.edition !== 'oem') {
    throw new Error('Product edition must be "main" or "oem".')
  }
  for (const key of [
    'productName',
    'aiName',
    'vendor',
    'appId',
    'artifactSlug',
    'executableName',
    'desktopName',
    'userDataDirectory',
    'developmentUserDataDirectory',
  ]) {
    if (typeof value[key] !== 'string' || !value[key].trim()) {
      throw new Error(`Product configuration field ${key} must be a non-empty string.`)
    }
  }
  if (!ARTIFACT_SLUG.test(value.artifactSlug)) {
    throw new Error(
      'Product artifactSlug must contain only letters, digits, dots, dashes, or underscores.',
    )
  }
  if (
    !GITHUB_SEGMENT.test(value.repository?.owner ?? '') ||
    !GITHUB_SEGMENT.test(value.repository?.name ?? '')
  ) {
    throw new Error('Product repository owner and name must be valid GitHub path segments.')
  }
  if (typeof value.features?.chatgptSubscription !== 'boolean') {
    throw new Error('Product ChatGPT feature flag must be boolean.')
  }
  if (typeof value.updates?.enabled !== 'boolean') {
    throw new Error('Product update flag must be boolean.')
  }
  return value
}

validateProductConfig(productConfig)

function normalizeUpdateUrl(value) {
  if (!value) return undefined
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('NIUOFFICE_UPDATE_URL must be an absolute HTTPS URL.')
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('NIUOFFICE_UPDATE_URL must be an HTTPS URL without embedded credentials.')
  }
  if (parsed.search || parsed.hash) {
    throw new Error('NIUOFFICE_UPDATE_URL must not contain a query string or fragment.')
  }
  return parsed.toString().replace(/\/+$/, '')
}

const repositoryUrl = `https://github.com/${productConfig.repository.owner}/${productConfig.repository.name}`
const defaultUpdateUrl = productConfig.updates.enabled
  ? `${repositoryUrl}/releases/latest/download`
  : undefined
const updateUrl = normalizeUpdateUrl(process.env.NIUOFFICE_UPDATE_URL ?? defaultUpdateUrl)
const chatGptEnabled = productConfig.features.chatgptSubscription

// GENOFFICE_MAC_X64=1 — opt into packaging the Intel (x64) dmg/zip alongside
// arm64. Off by default: Intel packages must only ever ship signed with the
// company certificate (planned dual-track pipeline), so the current release
// pipeline stays arm64-only and never produces a personally-signed Intel
// artifact. The downstream layout (feed archive name, GenOffice-intel.dmg
// alias) keys off which dmgs exist, so flipping this flag is the single
// switch.
const includeMacX64 = process.env.GENOFFICE_MAC_X64 === '1'

const codexTargets = {
  'win32-x64': ['@openai/codex-win32-x64', 'x86_64-pc-windows-msvc', 'codex.exe'],
  'win32-arm64': ['@openai/codex-win32-arm64', 'aarch64-pc-windows-msvc', 'codex.exe'],
  'darwin-x64': ['@openai/codex-darwin-x64', 'x86_64-apple-darwin', 'codex'],
  'darwin-arm64': ['@openai/codex-darwin-arm64', 'aarch64-apple-darwin', 'codex'],
  'linux-x64': ['@openai/codex-linux-x64', 'x86_64-unknown-linux-musl', 'codex'],
  'linux-arm64': ['@openai/codex-linux-arm64', 'aarch64-unknown-linux-musl', 'codex'],
}

function resolveCodexBinary() {
  const key = `${process.platform}-${process.arch}`
  const target = codexTargets[key]
  if (!target) throw new Error(`ChatGPT runtime does not support build host ${key}`)
  const [packageName, triple, executable] = target
  let packageJson
  try {
    packageJson = require.resolve(`${packageName}/package.json`)
  } catch {
    throw new Error(
      `Official ChatGPT runtime package ${packageName} is missing (run pnpm install on the packaging host)`,
    )
  }
  const expectedVersion = require('./package.json').devDependencies['@openai/codex']
  const installedVersion = require('@openai/codex/package.json').version
  const targetVersion = require(packageJson).version
  if (installedVersion !== expectedVersion || targetVersion !== `${expectedVersion}-${key}`) {
    throw new Error(
      `ChatGPT runtime must match pinned @openai/codex ${expectedVersion}; found ${installedVersion} / ${targetVersion}`,
    )
  }
  const binary = join(dirname(packageJson), 'vendor', triple, 'bin', executable)
  if (!existsSync(binary))
    throw new Error(`Official ChatGPT app-server binary is missing: ${binary}`)
  return binary
}

const codexBinary = chatGptEnabled ? resolveCodexBinary() : undefined

// Code Mode uses a separate host next to the pinned app-server.
// Copy only that helper, not the package's shell/search/sandbox sidecars.
function resolveCodexCodeModeHost() {
  if (!codexBinary) throw new Error('ChatGPT runtime is disabled for this product edition.')
  const executable =
    process.platform === 'win32' ? 'codex-code-mode-host.exe' : 'codex-code-mode-host'
  const binary = join(dirname(codexBinary), executable)
  const stats = existsSync(binary) ? statSync(binary) : null
  if (!stats?.isFile() || stats.size === 0) {
    throw new Error(`Official ChatGPT code-mode host binary is missing or invalid: ${binary}`)
  }
  return binary
}

const codexCodeModeHost = chatGptEnabled ? resolveCodexCodeModeHost() : undefined

// Native Windows builds use Cargo's host target directory. Cross-platform
// Windows packaging uses the explicit GNU target built by the release job.
const windowsSidecar =
  process.platform === 'win32'
    ? '../sheets/native/xlsx-engine/target/release/xlsx-sidecar.exe'
    : '../sheets/native/xlsx-engine/target/x86_64-pc-windows-gnu/release/xlsx-sidecar.exe'

// LICENSES.chromium.html only exists after the Electron binary download —
// since Electron 42 that no longer happens during `npm ci` (the postinstall
// script was replaced by the lazy `install-electron` bin), and electron-builder
// exits 0 on a missing extraResources source, so without this check the
// installer would silently ship without the Chromium license.
for (const rel of [
  '../../node_modules/electron/dist/LICENSES.chromium.html',
  '../../node_modules/@embedpdf/pdfium/dist/pdfium.wasm',
  '../pdf/node_modules/harfbuzzjs/hb-subset.wasm',
]) {
  if (!existsSync(join(__dirname, rel))) {
    throw new Error(
      `electron-builder extraResources source missing: ${rel} (npm hoisting changed?)`,
    )
  }
}

// macOS local-OCR helper (scanned-page text recovery): a swiftc output, not
// an npm artifact — compiled here on demand so CI runners and fresh checkouts
// need no manual step. Universal (arm64 + x86_64) when both targets compile,
// host-arch otherwise; mac installers must not silently ship without it.
const VISION_OCR_HELPER = '../../packages/pdf2docx/ocr-helper/vision-ocr'

// Compile the helper. universalOnly=true has NO host-arch fallback: dual-arch
// packaging must fail loudly rather than ship a host-arch binary to both dmgs.
function compileVisionOcr({ universalOnly } = { universalOnly: false }) {
  const src = join(__dirname, `${VISION_OCR_HELPER}.swift`)
  const out = join(__dirname, VISION_OCR_HELPER)
  try {
    try {
      const slices = ['arm64', 'x86_64'].map((arch) => {
        const slice = `${out}.${arch}`
        execFileSync('swiftc', ['-O', src, '-target', `${arch}-apple-macos12`, '-o', slice], {
          stdio: 'inherit',
        })
        return slice
      })
      execFileSync('lipo', ['-create', ...slices, '-output', out], { stdio: 'inherit' })
      for (const slice of slices) rmSync(slice, { force: true })
    } catch (err) {
      if (universalOnly) throw err
      // cross-target SDK unavailable — a host-arch helper still serves this build
      execFileSync('swiftc', ['-O', src, '-o', out], { stdio: 'inherit' })
    }
  } catch (err) {
    throw new Error(`vision-ocr helper compile failed: ${err}`, { cause: err })
  }
}

if (process.platform === 'darwin' && !existsSync(join(__dirname, VISION_OCR_HELPER))) {
  compileVisionOcr()
}

// Windows local-OCR helper (Windows.Media.Ocr): compiled by the in-box .NET
// Framework csc via build-win.mjs — same on-demand policy as the mac helper,
// and Windows installers must not silently ship without it.
const WIN_OCR_HELPER = '../../packages/pdf2docx/ocr-helper/win-ocr.exe'
if (process.platform === 'win32' && !existsSync(join(__dirname, WIN_OCR_HELPER))) {
  try {
    execFileSync(
      process.execPath,
      [join(__dirname, '../../packages/pdf2docx/ocr-helper/build-win.mjs')],
      { stdio: 'inherit' },
    )
  } catch (err) {
    throw new Error(`win-ocr helper compile failed: ${err}`, { cause: err })
  }
}

// Dual-arch packs share one extraResources path, so the shipped helper must be
// a lipo fat binary. A stale host-arch build (dev path above) is rebuilt in
// place; if a universal build cannot be produced, packaging aborts — otherwise
// the other arch's OCR silently fails and every scanned page ships as bitmap.
function assertUniversalVisionOcr() {
  const helper = join(__dirname, VISION_OCR_HELPER)
  const wanted = ['x86_64', 'arm64']
  const archsOf = () =>
    existsSync(helper)
      ? execFileSync('lipo', ['-archs', helper], { encoding: 'utf8' }).trim().split(/\s+/)
      : []
  if (!wanted.every((w) => archsOf().includes(w))) {
    rmSync(helper, { force: true })
    compileVisionOcr({ universalOnly: true })
  }
  const archs = archsOf()
  for (const want of wanted) {
    if (!archs.includes(want)) {
      throw new Error(
        `vision-ocr helper is [${archs.join(', ')}] but both mac arch packages ship it`,
      )
    }
  }
}

// The module trees are electron-vite outputs produced by build:all; a missing
// one means that module's build did not run or failed. electron-builder only
// logs "file source doesn't exist" for an absent extraResources source and
// still exits 0, so without this the installer launches normally and is simply
// missing that editor — it surfaces only when a user opens the tab.
//
// Runs from the beforePack hook, not at module load: gen-third-party-notices
// requires this config to read extraResources, and the dist:* scripts run
// notices before build:all, when the out dirs legitimately don't exist yet.
// When the mac build packages BOTH arches (GENOFFICE_MAC_X64=1) its
// extraResources entry is a single path shared by the two packs, so the
// sidecar there must be a lipo fat binary — a host-arch-only build (the plain
// `native:build` dev path) would silently ship an arm64 sidecar inside the
// Intel dmg, where every workbook open fails. Runs from beforePack, dual-arch
// mac packs only.
function assertUniversalSidecar() {
  const sidecar = join(__dirname, '../sheets/native/xlsx-engine/target/release/xlsx-sidecar')
  if (!existsSync(sidecar)) {
    throw new Error(
      `mac extraResources source missing: ${sidecar} (run "npm run native:build:universal -w @genoffice/sheets" first)`,
    )
  }
  const archs = execFileSync('lipo', ['-archs', sidecar], { encoding: 'utf8' }).trim().split(/\s+/)
  for (const want of ['x86_64', 'arm64']) {
    if (!archs.includes(want)) {
      throw new Error(
        `xlsx-sidecar is [${archs.join(', ')}] but both mac arch packages ship it — ` +
          'run "npm run native:build:universal -w @genoffice/sheets" before packaging mac',
      )
    }
  }
}

function assertModuleTreesPresent() {
  for (const rel of ['../docs/out', '../sheets/out', '../pdf/out', '../markdown/out']) {
    if (!existsSync(join(__dirname, rel))) {
      throw new Error(
        `electron-builder extraResources source missing: ${rel} (run npm run build:all first)`,
      )
    }
  }
}

function assertWindowsSidecar() {
  const sidecar = join(__dirname, windowsSidecar)
  if (!existsSync(sidecar)) {
    throw new Error(
      `win extraResources source missing: ${sidecar} (run "pnpm --filter @genoffice/sheets native:build" first)`,
    )
  }
}

function assertCodexRuntimeMatches(context) {
  const archNames = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', 4: 'universal' }
  const targetArch = archNames[context.arch] ?? context.arch
  if (context.electronPlatformName !== process.platform || targetArch !== process.arch) {
    throw new Error(
      `The installed @openai/codex runtime is ${process.platform}-${process.arch}, but this pack is ` +
        `${context.electronPlatformName}-${targetArch}. Install dependencies and package on the target host/architecture.`,
    )
  }
}

/** @type {import('electron-builder').Configuration} */
const config = {
  appId: productConfig.appId,
  productName: productConfig.productName,
  // Resolved from the installed electron package so dependency bumps can
  // never leave a stale hard-coded pin behind (packaging would silently ship
  // the old runtime).
  electronVersion: require('electron/package.json').version,
  directories: {
    output: 'release',
  },
  files: ['out/**'],
  extraResources: [
    {
      from: 'build/THIRD-PARTY-NOTICES.txt',
      to: 'THIRD-PARTY-NOTICES.txt',
    },
    // Preserve the upstream application's license and attribution history, and
    // ship the Unicode data license next to the generated third-party notice.
    {
      from: '../../LICENSE',
      to: 'LICENSE',
    },
    {
      from: '../../NOTICE',
      to: 'NOTICE',
    },
    {
      from: '../../LICENSE-UNICODE.txt',
      to: 'LICENSE-UNICODE.txt',
    },
    {
      from: '../../node_modules/electron/dist/LICENSES.chromium.html',
      to: 'LICENSES.chromium.html',
    },
    {
      from: '../docs/out',
      to: 'modules/docs',
    },
    {
      from: '../sheets/out',
      to: 'modules/sheets',
    },
    {
      from: '../pdf/out',
      to: 'modules/pdf',
    },
    {
      from: '../markdown/out',
      to: 'modules/markdown',
    },
    // Official Codex native runtime is packaged only for editions that expose
    // managed ChatGPT subscription authentication.
    ...(chatGptEnabled
      ? [
          {
            from: codexBinary,
            to: process.platform === 'win32' ? 'native/codex.exe' : 'native/codex',
          },
          {
            from: codexCodeModeHost,
            to:
              process.platform === 'win32'
                ? 'native/codex-code-mode-host.exe'
                : 'native/codex-code-mode-host',
          },
        ]
      : []),
    // PDF text editing engines: the bundled main resolves these under
    // Resources/wasm when node_modules is absent (apps/pdf/src/main/wasm-path.ts)
    {
      from: '../../node_modules/@embedpdf/pdfium/dist/pdfium.wasm',
      to: 'wasm/pdfium.wasm',
    },
    {
      from: '../pdf/node_modules/harfbuzzjs/hb-subset.wasm',
      to: 'wasm/hb-subset.wasm',
    },
    // platform system-OCR helpers for scanned-page recovery (each exists only
    // on its own build platform; electron-builder skips absent sources and the
    // engine resolver degrades to the bitmap fallback when missing)
    {
      from: '../../packages/pdf2docx/ocr-helper/vision-ocr',
      to: 'ocr/vision-ocr',
    },
    {
      from: '../../packages/pdf2docx/ocr-helper/win-ocr.exe',
      to: 'ocr/win-ocr.exe',
    },
  ],
  // `mimeType` is read only by the Linux target, where it becomes the
  // desktop entry's MimeType= list; associations without it are dropped
  // there. macOS and Windows ignore the field and key off `ext`.
  fileAssociations: [
    {
      ext: 'docx',
      name: 'Word Document',
      role: 'Editor',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
    {
      ext: 'xlsx',
      name: 'Excel Workbook',
      role: 'Editor',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
    {
      ext: 'xlsm',
      name: 'Excel Macro-Enabled Workbook',
      role: 'Editor',
      mimeType: 'application/vnd.ms-excel.sheet.macroEnabled.12',
    },
    {
      ext: 'xls',
      name: 'Excel 97-2003 Workbook',
      role: 'Editor',
      mimeType: 'application/vnd.ms-excel',
    },
    {
      ext: 'csv',
      name: 'CSV Document',
      role: 'Editor',
      mimeType: 'text/csv',
    },
    {
      ext: 'pdf',
      name: 'PDF Document',
      role: 'Editor',
      mimeType: 'application/pdf',
    },
    {
      ext: 'md',
      name: 'Markdown Document',
      role: 'Editor',
      mimeType: 'text/markdown',
    },
    {
      ext: 'markdown',
      name: 'Markdown Document',
      role: 'Editor',
      mimeType: 'text/markdown',
    },
  ],
  npmRebuild: false,
  mac: {
    // Two separate arch packages (NOT universal): arm64 keeps the exact
    // artifact names and update-feed entries it always had, x64 (opt-in via
    // GENOFFICE_MAC_X64=1, see includeMacX64 above) adds Intel support with
    // electron-builder's default arch-less names (GenOffice-<v>.dmg /
    // GenOffice-<v>-mac.zip). Both zips land in one latest-mac.yml and
    // electron-updater picks by process.arch. Dual-arch packs ship the same
    // lipo fat xlsx-sidecar (see assertUniversalSidecar above).
    target: [
      { target: 'dmg', arch: includeMacX64 ? ['arm64', 'x64'] : ['arm64'] },
      { target: 'zip', arch: includeMacX64 ? ['arm64', 'x64'] : ['arm64'] },
    ],
    category: 'public.app-category.productivity',
    icon: 'build/icon.icns',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    notarize: true,
    extraResources: [
      {
        from: '../sheets/native/xlsx-engine/target/release/xlsx-sidecar',
        to: 'native/xlsx-sidecar',
      },
    ],
  },
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
      {
        target: 'portable',
        arch: ['x64'],
      },
    ],
    icon: 'build/icon.ico',
    extraResources: [
      {
        from: windowsSidecar,
        to: 'native/xlsx-sidecar.exe',
      },
    ],
  },
  // Unlike win (which cross-compiles the sidecar to an explicit target
  // triple), linux takes it from cargo's host-native target/release/ — the
  // same source mac uses. So no `arch` is pinned here: electron-builder
  // defaults to the build host's architecture, which is the only one the
  // sidecar was actually built for. Packaging arm64 on an x64 host, or the
  // reverse, needs a matching `cargo build --target` first.
  linux: {
    // BP Office is an independent distribution: package names, executable name and
    // desktop id all derive from product.json so nothing collides with the upstream
    // NiuOffice/GenOffice packages a machine may already have installed.
    target: [
      { target: 'AppImage', arch: ['x64'] },
      { target: 'deb', arch: ['x64'] },
      { target: 'rpm', arch: ['x64'] },
    ],
    // deb control metadata. Homepage comes from package.json "homepage"; the Package
    // field is pinned in the deb block below (packageName is a per-target option,
    // rejected here by the schema).
    maintainer: productConfig.vendor,
    vendor: productConfig.vendor,
    category: 'Office',
    // Icon SET directory, not the single 1024px png: electron-builder does
    // not resize a lone png, so deb/rpm would install only
    // hicolor/1024x1024/apps/genoffice.png — a size absent from the hicolor
    // theme index, leaving GNOME/KDE launchers on the generic fallback icon
    // The set ships every standard raster size so desktop shells do not fall
    // back to a generic icon.
    icon: 'build/icons',
    // mac and win name the binary from productName; linux instead derives it
    // from package.json "name", and "@genoffice/shell" sanitizes to the
    // invalid "@genofficeshell". Setting it explicitly also makes the
    // generated bpoffice.desktop match the WM_CLASS Electron reports (it
    // takes that from the executable basename), so the running window links
    // back to its launcher entry.
    executableName: productConfig.executableName,
    // Electron takes its X11 app_id from package.json "desktopName"
    // (bpoffice.desktop); syncDesktopName makes electron-builder name the
    // .desktop file and its StartupWMClass from the same value. Without it
    // StartupWMClass falls back to productName ("BP Office"), which does not
    // match the "bpoffice" WM_CLASS the window actually reports — and X11
    // compares case-sensitively, so the taskbar shows an unlinked window.
    syncDesktopName: true,
    extraResources: [
      {
        from: '../sheets/native/xlsx-engine/target/release/xlsx-sidecar',
        to: 'native/xlsx-sidecar',
      },
    ],
  },
  // Same "@genoffice/shell" problem as executableName above: the default deb
  // artifact name derives from package.json "name", and the scope's "/" makes
  // fpm treat "@genoffice" as a directory. Spell the published name out
  // (genoffice_<version>_amd64.deb, matching the linux-v0.5.149 release).
  // packageName pins the control Package field to the same value the 0.5.149
  // deb shipped with — apt treats a different Package name as an unrelated
  // install, breaking upgrades. Without it, fpm receives productName
  // "GenOffice" and only happens to downcase it to the right value.
  deb: {
    artifactName: 'bpoffice_${version}_${arch}.deb',
    packageName: 'bpoffice',
  },
  // Same "@genoffice/shell" naming problem as deb: spell the artifact name
  // out (${arch} expands to the rpm arch string, x86_64) and pin the rpm
  // Package name so dnf/zypper treat successive releases as upgrades of the
  // same package. Like deb, rpm installs run no in-app updater — users
  // upgrade with `dnf install ./<new>.rpm`. Packaging needs rpmbuild on the
  // build host (the `rpm` apt package on Ubuntu; CI installs it).
  //
  // publish: null (explicit) keeps the rpm out of the electron-updater feed
  // and off the CDN entirely: the rpm is a GitHub-Release download only, so
  // latest-linux.yml keeps listing exactly what the CDN pipeline uploads
  // (AppImage + deb) and the promote workflow needs no rpm alias.
  rpm: {
    artifactName: 'bpoffice-${version}.${arch}.rpm',
    packageName: 'bpoffice',
    publish: null,
  },
  nsis: {
    artifactName: `${productConfig.artifactSlug}-Setup-\${version}.\${ext}`,
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },
  portable: {
    artifactName: `${productConfig.artifactSlug}-Portable-\${version}.\${ext}`,
  },
  beforePack: async (context) => {
    assertModuleTreesPresent()
    if (chatGptEnabled) assertCodexRuntimeMatches(context)
    if (context.electronPlatformName === 'win32') assertWindowsSidecar()
    if (context.electronPlatformName === 'darwin' && includeMacX64) {
      assertUniversalSidecar()
      assertUniversalVisionOcr()
    }
  },
  dmg: {
    sign: true,
  },
  afterAllArtifactBuild: 'build/notarize-dmg.js',
}

if (updateUrl) {
  config.publish = [
    {
      provider: 'generic',
      url: updateUrl,
      channel: 'latest',
      // Baked into app-update.yml. Without it electron-builder derives the updater cache
      // directory from the internal "@genoffice/shell" workspace name, which would make
      // BP Office share <LocalAppData>/@genofficeshell-updater with an upstream
      // NiuOffice/GenOffice install on the same machine.
      updaterCacheDirName: `${productConfig.executableName}-updater`,
    },
  ]
}

module.exports = config
