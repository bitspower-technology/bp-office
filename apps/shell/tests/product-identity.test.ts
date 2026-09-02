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

  it('uses NiuOffice as the runtime-facing product name', () => {
    expect(PRODUCT_DISPLAY_NAME).toBe('NiuOffice')
  })

  it('pins packaged storage to the established GenOffice directory', () => {
    expect(resolveShellUserDataPath(appData, true)).toBe(join(appData, 'GenOffice'))
  })

  it('keeps unpacked runs isolated in the established development directory', () => {
    expect(resolveShellUserDataPath(appData, false)).toBe(join(appData, 'GenOffice Dev'))
  })

  it('honors the existing development-only user-data override', () => {
    const override = join('D:', 'tmp', 'isolated-shell')
    expect(resolveShellUserDataPath(appData, false, override)).toBe(override)
    expect(resolveShellUserDataPath(appData, true, override)).toBe(join(appData, 'GenOffice'))
  })

  it('defines the endpoint-only OEM template and its repository coordinates centrally', () => {
    expect(PRODUCT_CONFIG.edition).toBe('oem')
    expect(PRODUCT_CONFIG.updates.enabled).toBe(false)
    expect(CHATGPT_SUBSCRIPTION_ENABLED).toBe(false)
    expect(PRODUCT_RELEASES_URL).toBe('https://github.com/Niuulh/NiuOffice/releases/latest')
    expect(PRODUCT_UPDATE_FEED_URL).toBe(
      'https://github.com/Niuulh/NiuOffice/releases/latest/download',
    )
  })
})
