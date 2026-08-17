import { join } from 'node:path'

export const PRODUCT_DISPLAY_NAME = 'BP-Office'

const LEGACY_USER_DATA_DIR = 'GenOffice'
const DEV_USER_DATA_DIR = 'GenOffice Dev'

/**
 * Keep persisted settings and single-instance state compatible with existing
 * installs even though the runtime-facing product name is now BP-Office.
 */
export function resolveShellUserDataPath(
  appDataPath: string,
  packaged: boolean,
  devOverride?: string,
): string {
  if (packaged) return join(appDataPath, LEGACY_USER_DATA_DIR)
  return devOverride ?? join(appDataPath, DEV_USER_DATA_DIR)
}
