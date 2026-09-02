import rawProductConfig from '../../../../branding/product.json'

export type ProductEdition = 'main' | 'oem'

export interface ProductConfig {
  schemaVersion: 1
  edition: ProductEdition
  productName: string
  aiName: string
  vendor: string
  appId: string
  artifactSlug: string
  executableName: string
  desktopName: string
  userDataDirectory: string
  developmentUserDataDirectory: string
  repository: {
    owner: string
    name: string
  }
  features: {
    chatgptSubscription: boolean
  }
  updates: {
    enabled: boolean
  }
}

const GITHUB_SEGMENT = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/
const ARTIFACT_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

function validateProductConfig(value: ProductConfig): ProductConfig {
  if (value.schemaVersion !== 1) throw new Error('Unsupported product configuration schema.')
  if (value.edition !== 'main' && value.edition !== 'oem') {
    throw new Error('Product edition must be "main" or "oem".')
  }
  for (const [key, field] of Object.entries({
    productName: value.productName,
    aiName: value.aiName,
    vendor: value.vendor,
    appId: value.appId,
    executableName: value.executableName,
    desktopName: value.desktopName,
    userDataDirectory: value.userDataDirectory,
    developmentUserDataDirectory: value.developmentUserDataDirectory,
  })) {
    if (typeof field !== 'string' || !field.trim()) {
      throw new Error(`Product configuration field ${key} must be a non-empty string.`)
    }
  }
  if (!ARTIFACT_SLUG.test(value.artifactSlug)) {
    throw new Error(
      'Product artifactSlug must contain only letters, digits, dots, dashes, or underscores.',
    )
  }
  if (!GITHUB_SEGMENT.test(value.repository.owner) || !GITHUB_SEGMENT.test(value.repository.name)) {
    throw new Error('Product repository owner and name must be valid GitHub path segments.')
  }
  if (typeof value.features.chatgptSubscription !== 'boolean') {
    throw new Error('Product ChatGPT feature flag must be boolean.')
  }
  if (typeof value.updates.enabled !== 'boolean') {
    throw new Error('Product update flag must be boolean.')
  }
  return value
}

export const PRODUCT_CONFIG = Object.freeze(
  validateProductConfig(rawProductConfig as ProductConfig),
)

export const PRODUCT_REPOSITORY_URL =
  `https://github.com/${PRODUCT_CONFIG.repository.owner}/${PRODUCT_CONFIG.repository.name}` as const

export const PRODUCT_RELEASES_URL = `${PRODUCT_REPOSITORY_URL}/releases/latest` as const

export const PRODUCT_UPDATE_FEED_URL = `${PRODUCT_RELEASES_URL}/download` as const

export const CHATGPT_SUBSCRIPTION_ENABLED = PRODUCT_CONFIG.features.chatgptSubscription
