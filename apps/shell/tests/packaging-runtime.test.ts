import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const SHELL_DIR = fileURLToPath(new URL('..', import.meta.url))
const BUILDER_SOURCE = readFileSync(path.join(SHELL_DIR, 'electron-builder.cjs'), 'utf8')
const PINNED_VERSION = '0.147.0'

interface Resource {
  from: string
  to: string
}

interface BuilderConfig {
  appId: string
  productName: string
  extraResources: Resource[]
  win: { extraResources: Resource[] }
  nsis: { artifactName: string }
  portable: { artifactName: string }
  publish?: Array<{
    provider: string
    url: string
    channel: string
    updaterCacheDirName?: string
  }>
}

// Synthetic template identity used to drive the packaging configuration under test. It is
// deliberately not the shipped BP Office identity (branding/product.json), so a fixture
// edit can never masquerade as a product-identity change.
const DEFAULT_PRODUCT_CONFIG = {
  schemaVersion: 1,
  edition: 'main',
  productName: 'Template Office',
  aiName: 'Template Office AI',
  vendor: 'Template Contributors',
  appId: 'com.example.template',
  artifactSlug: 'TemplateOffice',
  executableName: 'templateoffice',
  desktopName: 'templateoffice.desktop',
  userDataDirectory: 'TemplateOffice',
  developmentUserDataDirectory: 'TemplateOffice Dev',
  repository: { owner: 'example', name: 'template-office' },
  features: { chatgptSubscription: true },
  updates: { enabled: true },
}

/** The shipped BP Office configuration, mirrored here so packaging is tested against it. */
const BP_OFFICE_PRODUCT_CONFIG = {
  schemaVersion: 1,
  edition: 'oem',
  productName: 'BP Office',
  aiName: 'BP Office AI',
  vendor: 'Bitspower Technology',
  appId: 'com.bitspower.bpoffice',
  artifactSlug: 'BPOffice',
  executableName: 'bpoffice',
  desktopName: 'bpoffice.desktop',
  userDataDirectory: 'BPOffice',
  developmentUserDataDirectory: 'BPOffice Dev',
  repository: { owner: 'bitspower-technology', name: 'bp-office' },
  features: { chatgptSubscription: false },
  updates: { enabled: true },
}

interface RuntimeFixture {
  platform?: 'win32' | 'linux' | 'darwin'
  helper?: 'present' | 'missing' | 'directory' | 'empty'
  wrapperVersion?: string
  targetVersion?: string
  productConfig?: unknown
  env?: Record<string, string>
}

function loadBuilder(fixture: RuntimeFixture = {}): BuilderConfig {
  const platform = fixture.platform ?? 'win32'
  const key = `${platform}-x64`
  const helperName = platform === 'win32' ? 'codex-code-mode-host.exe' : 'codex-code-mode-host'
  const nativeManifest = path.resolve('mock-native-package', key, 'package.json')
  const module = { exports: {} }
  const localRequire = Object.assign(
    (name: string): unknown => {
      if (name === 'node:path') return path
      if (name === 'node:fs') {
        return {
          existsSync: (file: string) =>
            !(fixture.helper === 'missing' && file.endsWith(helperName)),
          statSync: () => ({
            isFile: () => fixture.helper !== 'directory',
            size: fixture.helper === 'empty' ? 0 : 1,
          }),
          rmSync: () => {
            throw new Error('Packaging configuration must not delete fixture resources')
          },
        }
      }
      if (name === 'node:child_process') {
        return {
          execFileSync: () => {
            throw new Error('Packaging configuration must not launch a fixture executable')
          },
        }
      }
      if (name === './package.json') {
        return { devDependencies: { '@openai/codex': PINNED_VERSION } }
      }
      if (name === '../../branding/product.json') {
        return fixture.productConfig ?? DEFAULT_PRODUCT_CONFIG
      }
      if (name === '@openai/codex/package.json') {
        return { version: fixture.wrapperVersion ?? PINNED_VERSION }
      }
      if (name === nativeManifest) {
        return { version: fixture.targetVersion ?? `${PINNED_VERSION}-${key}` }
      }
      if (name === 'electron/package.json') return { version: '43.3.0' }
      throw new Error(`Unexpected packaging require: ${name}`)
    },
    {
      resolve: (name: string): string => {
        if (name !== `@openai/codex-${key}/package.json`) {
          throw new Error(`Unexpected native package: ${name}`)
        }
        return nativeManifest
      },
    },
  )
  runInNewContext(BUILDER_SOURCE, {
    require: localRequire,
    module,
    __dirname: SHELL_DIR,
    process: { platform, arch: 'x64', env: fixture.env ?? {}, execPath: process.execPath },
    URL,
  })
  return module.exports as BuilderConfig
}

describe('pinned ChatGPT packaging resources', () => {
  it('includes only the app-server and code-mode host from the Windows runtime', () => {
    const config = loadBuilder()
    const resources = [...config.extraResources, ...config.win.extraResources]
    const codex = resources.find((item) => item.to === 'native/codex.exe')!
    const helper = resources.find((item) => item.to === 'native/codex-code-mode-host.exe')!

    expect(helper.from).toBe(path.join(path.dirname(codex.from), 'codex-code-mode-host.exe'))
    expect(resources.filter((item) => item.to === helper.to)).toHaveLength(1)
    expect(
      resources.filter((item) => item.to.startsWith('native/')).map((item) => item.to),
    ).toEqual(['native/codex.exe', 'native/codex-code-mode-host.exe', 'native/xlsx-sidecar.exe'])
    expect(resources.some((item) => /command-runner|sandbox-setup|rg\.exe/.test(item.from))).toBe(
      false,
    )
  })

  it.each(['missing', 'directory', 'empty'] as const)('fails closed for a %s helper', (helper) => {
    expect(() => loadBuilder({ helper })).toThrow(/code-mode host binary is missing or invalid/)
  })

  it('rejects a wrapper that differs from the pinned runtime version', () => {
    expect(() => loadBuilder({ wrapperVersion: '0.150.0' })).toThrow(/must match pinned/)
  })

  it('rejects a native package that differs from the pinned runtime version', () => {
    expect(() => loadBuilder({ targetVersion: '0.150.0-win32-x64' })).toThrow(/must match pinned/)
  })

  it.each(['linux', 'darwin'] as const)(
    'packages the non-exe sibling code-mode host on %s',
    (platform) => {
      const config = loadBuilder({ platform })
      const codex = config.extraResources.find((item) => item.to === 'native/codex')!
      const helper = config.extraResources.find(
        (item) => item.to === 'native/codex-code-mode-host',
      )!
      expect(helper.from).toBe(path.join(path.dirname(codex.from), 'codex-code-mode-host'))
      expect(config.extraResources.filter((item) => item.to === helper.to)).toHaveLength(1)
      expect(config.extraResources.some((item) => item.to.endsWith('code-mode-host.exe'))).toBe(
        false,
      )
    },
  )

  it.each(['linux', 'darwin'] as const)('fails closed for a missing %s helper', (platform) => {
    expect(() => loadBuilder({ platform, helper: 'missing' })).toThrow(
      /code-mode host binary is missing or invalid/,
    )
  })
})

describe('product update packaging', () => {
  it('derives stable update metadata and URL-safe Windows artifact names from product config', () => {
    const config = loadBuilder()

    expect(config).toMatchObject({
      appId: 'com.example.template',
      productName: 'Template Office',
      nsis: { artifactName: 'TemplateOffice-Setup-${version}.${ext}' },
      portable: { artifactName: 'TemplateOffice-Portable-${version}.${ext}' },
      publish: [
        {
          provider: 'generic',
          url: 'https://github.com/example/template-office/releases/latest/download',
          channel: 'latest',
        },
      ],
    })
  })

  it('bakes the BP Office artifact names and public GitHub Releases feed', () => {
    const config = loadBuilder({ productConfig: BP_OFFICE_PRODUCT_CONFIG })

    expect(config).toMatchObject({
      appId: 'com.bitspower.bpoffice',
      productName: 'BP Office',
      nsis: { artifactName: 'BPOffice-Setup-${version}.${ext}' },
      portable: { artifactName: 'BPOffice-Portable-${version}.${ext}' },
      publish: [
        {
          provider: 'generic',
          url: 'https://github.com/bitspower-technology/bp-office/releases/latest/download',
          channel: 'latest',
        },
      ],
    })
  })

  it('normalizes a credential-free HTTPS update URL override', () => {
    const config = loadBuilder({
      env: { NIUOFFICE_UPDATE_URL: 'https://updates.example.test/bp-office///' },
    })

    expect(config.publish?.[0]?.url).toBe('https://updates.example.test/bp-office')
  })

  it.each([
    'http://updates.example.test/bp-office',
    'https://user:password@updates.example.test/bp-office',
    'https://updates.example.test/bp-office?token=value',
    'https://updates.example.test/bp-office#latest',
    '/relative/update/feed',
  ])('rejects an unsafe update URL override: %s', (url) => {
    expect(() => loadBuilder({ env: { NIUOFFICE_UPDATE_URL: url } })).toThrow(
      /NIUOFFICE_UPDATE_URL must/,
    )
  })

  it('omits update metadata when updates are disabled and no override is supplied', () => {
    const config = loadBuilder({
      productConfig: {
        ...DEFAULT_PRODUCT_CONFIG,
        updates: { enabled: false },
      },
    })

    expect(config.publish).toBeUndefined()
  })

  it('packages no ChatGPT runtime for the endpoint-only OEM edition', () => {
    const config = loadBuilder({
      productConfig: {
        ...DEFAULT_PRODUCT_CONFIG,
        edition: 'oem',
        features: { chatgptSubscription: false },
        updates: { enabled: false },
      },
    })

    // BP Office is exactly this shape, except that its public feed is enabled.
    const shipped = loadBuilder({ productConfig: BP_OFFICE_PRODUCT_CONFIG })
    expect(shipped.extraResources.map((resource) => resource.to)).not.toContain('native/codex.exe')
    expect(shipped.publish?.[0]?.url).toBe(
      'https://github.com/bitspower-technology/bp-office/releases/latest/download',
    )
    // The updater cache directory must stay product-specific so an upstream
    // NiuOffice/GenOffice install on the same machine cannot share it.
    expect(shipped.publish?.[0]?.updaterCacheDirName).toBe('bpoffice-updater')

    expect(config.publish).toBeUndefined()
    expect(config.extraResources.map((resource) => resource.to)).not.toContain('native/codex.exe')
    expect(config.extraResources.map((resource) => resource.to)).not.toContain(
      'native/codex-code-mode-host.exe',
    )
  })

  it.each([
    {
      ...DEFAULT_PRODUCT_CONFIG,
      artifactSlug: 'Template Office',
    },
    {
      ...DEFAULT_PRODUCT_CONFIG,
      repository: { owner: 'example/name', name: 'template-office' },
    },
  ])('rejects update identities that are unsafe in paths or URLs', (productConfig) => {
    expect(() => loadBuilder({ productConfig })).toThrow(/artifactSlug|repository owner and name/)
  })
})
