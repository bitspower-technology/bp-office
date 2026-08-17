import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PRODUCT_DISPLAY_NAME, resolveShellUserDataPath } from '../src/main/product-identity'

describe('shell product identity', () => {
  const appData = join('C:', 'Users', 'tester', 'AppData', 'Roaming')

  it('uses BP-Office as the runtime-facing product name', () => {
    expect(PRODUCT_DISPLAY_NAME).toBe('BP-Office')
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
})
