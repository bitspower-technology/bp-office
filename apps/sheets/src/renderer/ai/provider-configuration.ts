import { AI_PROVIDERS, type AiSettings } from '@genoffice/ai-provider'

/** Renderer preflight before starting the workbook agent. */
export function isAgentProviderConfigured(settings: AiSettings | null | undefined): boolean {
  if (!settings) return false
  const config = settings.providers[settings.provider]
  if (!config) return false
  if (settings.provider !== 'lmstudio' && settings.provider !== 'chatgpt' && !config.model) {
    return false
  }
  const requiresApiKey =
    AI_PROVIDERS.find((meta) => meta.id === settings.provider)?.requiresApiKey ?? true
  return !requiresApiKey || !!config.apiKey
}
