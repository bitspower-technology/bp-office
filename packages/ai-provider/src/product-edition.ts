import rawProductConfig from '../../../branding/product.json'
import type { AiProviderId, AiSettings } from './types'

interface EditionProductConfig {
  edition: 'main' | 'oem'
  features: {
    chatgptSubscription: boolean
  }
}

const productConfig = rawProductConfig as EditionProductConfig

export const CHATGPT_SUBSCRIPTION_ENABLED = productConfig.features.chatgptSubscription
export const ENDPOINT_ONLY_EDITION = productConfig.edition === 'oem'

/** Runtime authority for provider ids supplied by a renderer or persisted file. */
export function isProductAiProviderEnabled(provider: AiProviderId): boolean {
  return !ENDPOINT_ONLY_EDITION || provider === 'lmstudio'
}

/** Migrate unsupported active providers without deleting their saved configuration. */
export function constrainAiSettingsToProduct(settings: AiSettings): AiSettings {
  if (isProductAiProviderEnabled(settings.provider)) return settings
  return { ...settings, provider: 'lmstudio' }
}

export function assertProductAiProviderEnabled(provider: AiProviderId): void {
  if (!isProductAiProviderEnabled(provider)) {
    throw new Error('This product edition supports only OpenAI Endpoint.')
  }
}
