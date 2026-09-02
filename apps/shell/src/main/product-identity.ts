import { join } from 'node:path'
import { PRODUCT_CONFIG } from '../shared/product-config'

export const PRODUCT_DISPLAY_NAME = PRODUCT_CONFIG.productName

/**
 * Keep persisted settings and single-instance state compatible with existing
 * installs even though the runtime-facing product name is now NiuOffice.
 */
export function resolveShellUserDataPath(
  appDataPath: string,
  packaged: boolean,
  devOverride?: string,
): string {
  if (packaged) return join(appDataPath, PRODUCT_CONFIG.userDataDirectory)
  return devOverride ?? join(appDataPath, PRODUCT_CONFIG.developmentUserDataDirectory)
}
