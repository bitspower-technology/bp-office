import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PRODUCT_DISPLAY_NAME, resolveShellUserDataPath } from '../src/main/product-identity'
import {
  CHATGPT_SUBSCRIPTION_ENABLED,
  PRODUCT_CONFIG,
  PRODUCT_RELEASES_URL,
  PRODUCT_UPDATE_FEED_URL,
} from '../src/shared/product-config'

describe('shell product identity', () => {
  const appData = join('C:', 'Users', 'tester', 'AppData', 'Roaming')

  it('uses BP Office as the runtime-facing product name', () => {
    expect(PRODUCT_DISPLAY_NAME).toBe('BP Office')
  })

  it('pins packaged storage to the distributor-owned directory', () => {
    expect(resolveShellUserDataPath(appData, true)).toBe(join(appData, 'BPOffice'))
  })

  it('keeps unpacked runs isolated in the distributor development directory', () => {
    expect(resolveShellUserDataPath(appData, false)).toBe(join(appData, 'BPOffice Dev'))
  })

  it('never shares a user-data directory with an upstream NiuOffice/GenOffice install', () => {
    const directories = [
      PRODUCT_CONFIG.userDataDirectory,
      PRODUCT_CONFIG.developmentUserDataDirectory,
    ]
    for (const directory of directories) {
      expect(['GenOffice', 'GenOffice Dev', 'NiuOffice']).not.toContain(directory)
    }
    expect(PRODUCT_CONFIG.appId).toBe('com.bitspower.bpoffice')
    expect(PRODUCT_CONFIG.executableName).toBe('bpoffice')
    expect(PRODUCT_CONFIG.desktopName).toBe('bpoffice.desktop')
  })

  it('honors the existing development-only user-data override', () => {
    const override = join('D:', 'tmp', 'isolated-shell')
    expect(resolveShellUserDataPath(appData, false, override)).toBe(override)
    expect(resolveShellUserDataPath(appData, true, override)).toBe(join(appData, 'BPOffice'))
  })

  it('defines the endpoint-only OEM product and its public update repository', () => {
    expect(PRODUCT_CONFIG.edition).toBe('oem')
    // BP Office ships from its own public GitHub Releases feed.
    expect(PRODUCT_CONFIG.updates.enabled).toBe(true)
    expect(CHATGPT_SUBSCRIPTION_ENABLED).toBe(false)
    expect(PRODUCT_RELEASES_URL).toBe(
      'https://github.com/bitspower-technology/bp-office/releases/latest',
    )
    expect(PRODUCT_UPDATE_FEED_URL).toBe(
      'https://github.com/bitspower-technology/bp-office/releases/latest/download',
    )
  })
})
