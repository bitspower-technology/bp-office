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
  publish?: Array<{ provider: string; url: string; channel: string }>
}

const DEFAULT_PRODUCT_CONFIG = {
  schemaVersion: 1,
  edition: 'main',
  productName: 'NiuOffice',
  aiName: 'NiuOffice AI',
  vendor: 'NiuOffice Contributors',
  appId: 'com.genoffice.app',
  artifactSlug: 'NiuOffice',
  executableName: 'genoffice',
  desktopName: 'genoffice.desktop',
  userDataDirectory: 'GenOffice',
  developmentUserDataDirectory: 'GenOffice Dev',
  repository: { owner: 'Niuulh', name: 'NiuOffice' },
  features: { chatgptSubscription: true },
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
      appId: 'com.genoffice.app',
      productName: 'NiuOffice',
      nsis: { artifactName: 'NiuOffice-Setup-${version}.${ext}' },
      portable: { artifactName: 'NiuOffice-Portable-${version}.${ext}' },
      publish: [
        {
          provider: 'generic',
          url: 'https://github.com/Niuulh/NiuOffice/releases/latest/download',
          channel: 'latest',
        },
      ],
    })
  })

  it('normalizes a credential-free HTTPS update URL override', () => {
    const config = loadBuilder({
      env: { NIUOFFICE_UPDATE_URL: 'https://updates.example.test/niuoffice///' },
    })

    expect(config.publish?.[0]?.url).toBe('https://updates.example.test/niuoffice')
  })

  it.each([
    'http://updates.example.test/niuoffice',
    'https://user:password@updates.example.test/niuoffice',
    'https://updates.example.test/niuoffice?token=value',
    'https://updates.example.test/niuoffice#latest',
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

    expect(config.publish).toBeUndefined()
    expect(config.extraResources.map((resource) => resource.to)).not.toContain('native/codex.exe')
    expect(config.extraResources.map((resource) => resource.to)).not.toContain(
      'native/codex-code-mode-host.exe',
    )
  })

  it.each([
    {
      ...DEFAULT_PRODUCT_CONFIG,
      artifactSlug: 'Niu Office',
    },
    {
      ...DEFAULT_PRODUCT_CONFIG,
      repository: { owner: 'Niuulh/name', name: 'NiuOffice' },
    },
  ])('rejects update identities that are unsafe in paths or URLs', (productConfig) => {
    expect(() => loadBuilder({ productConfig })).toThrow(/artifactSlug|repository owner and name/)
  })
})
