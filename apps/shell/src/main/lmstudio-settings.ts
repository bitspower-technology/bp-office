import { readFileSync, writeFileSync } from 'node:fs'
import {
  LM_STUDIO_DEFAULT_BASE_URL,
  defaultAiSettings,
  assertProductAiProviderEnabled,
  constrainAiSettingsToProduct,
  normalizeLmStudioBaseUrl as normalizeProviderLmStudioBaseUrl,
  resolveAiSettings,
  type AiProviderConfig,
  type AiSettings,
  type LegacyAiSettings,
  type LmStudioStatus,
} from '@genoffice/ai-provider'
import type { AiConnectionProvider, ChatGptConfig, LmStudioConfig } from '../shared/home-api'

const MAX_BASE_URL_LENGTH = 2_048
const MAX_MODEL_LENGTH = 512
const MAX_API_KEY_LENGTH = 8_192

function settingsObject(path: string): Partial<AiSettings> & LegacyAiSettings {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Partial<AiSettings> & LegacyAiSettings
    }
  } catch {
    // Missing or corrupt settings are replaced with provider defaults.
  }
  return {}
}

export function readResolvedAiSettings(path: string): AiSettings {
  return constrainAiSettingsToProduct(resolveAiSettings(settingsObject(path), defaultAiSettings()))
}

export function normalizeLmStudioBaseUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('OpenAI Endpoint base URL must be a string.')
  const raw = value.trim()
  if (!raw || raw.length > MAX_BASE_URL_LENGTH) {
    throw new Error('Invalid OpenAI Endpoint base URL.')
  }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('Invalid OpenAI Endpoint base URL.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('OpenAI Endpoint base URL must use http or https.')
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('OpenAI Endpoint base URL cannot include credentials, a query, or a fragment.')
  }

  return normalizeProviderLmStudioBaseUrl(raw)
}

function boundedString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string.`)
  const result = value.trim()
  if (result.length > maxLength) throw new Error(`${label} is too long.`)
  return result
}

/** Runtime validation for values crossing the renderer/main IPC boundary. */
export function parseLmStudioConfig(value: unknown): LmStudioConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid OpenAI Endpoint configuration.')
  }
  const input = value as Record<string, unknown>
  const apiKey = boundedString(input.apiKey, 'OpenAI Endpoint API key', MAX_API_KEY_LENGTH)
  if (!apiKey) throw new Error('OpenAI Endpoint API key is required.')
  return {
    baseUrl: normalizeLmStudioBaseUrl(input.baseUrl),
    model: boundedString(input.model, 'OpenAI Endpoint model', MAX_MODEL_LENGTH),
    apiKey,
  }
}

export function readLmStudioConfig(path: string): LmStudioConfig {
  const settings = readResolvedAiSettings(path)
  const config = settings.providers.lmstudio as AiProviderConfig | undefined
  let baseUrl = LM_STUDIO_DEFAULT_BASE_URL
  try {
    baseUrl = normalizeLmStudioBaseUrl(config?.baseUrl ?? LM_STUDIO_DEFAULT_BASE_URL)
  } catch {
    // A bad value from an older/manual settings edit must not break Settings.
  }
  return {
    baseUrl,
    model: typeof config?.model === 'string' ? config.model.trim().slice(0, MAX_MODEL_LENGTH) : '',
    apiKey:
      typeof config?.apiKey === 'string' ? config.apiKey.trim().slice(0, MAX_API_KEY_LENGTH) : '',
  }
}

export function writeLmStudioConfig(path: string, value: unknown): LmStudioConfig {
  const config = parseLmStudioConfig(value)
  const settings = readResolvedAiSettings(path)
  settings.provider = 'lmstudio'
  settings.providers.lmstudio = { ...config }
  writeFileSync(path, JSON.stringify(settings, null, 2))
  return config
}

/** Only the two providers surfaced by this NiuOffice build can cross shell IPC. */
export function parseAiConnectionProvider(value: unknown): AiConnectionProvider {
  if (value === 'lmstudio' || value === 'chatgpt') {
    assertProductAiProviderEnabled(value)
    return value
  }
  throw new Error('Invalid AI provider.')
}

export function readAiConnectionProvider(path: string): AiConnectionProvider {
  return readResolvedAiSettings(path).provider === 'chatgpt' ? 'chatgpt' : 'lmstudio'
}

export function writeAiConnectionProvider(path: string, value: unknown): AiConnectionProvider {
  const provider = parseAiConnectionProvider(value)
  const settings = readResolvedAiSettings(path)
  settings.provider = provider
  writeFileSync(path, JSON.stringify(settings, null, 2))
  return provider
}

/** Runtime validation for the ChatGPT model preference crossing renderer IPC. */
export function parseChatGptConfig(value: unknown): ChatGptConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid ChatGPT configuration.')
  }
  return {
    model: boundedString(
      (value as Record<string, unknown>).model,
      'ChatGPT model',
      MAX_MODEL_LENGTH,
    ),
  }
}

export function readChatGptConfig(path: string): ChatGptConfig {
  const config = readResolvedAiSettings(path).providers.chatgpt as AiProviderConfig | undefined
  return {
    model: typeof config?.model === 'string' ? config.model.trim().slice(0, MAX_MODEL_LENGTH) : '',
  }
}

export function writeChatGptConfig(path: string, value: unknown): ChatGptConfig {
  assertProductAiProviderEnabled('chatgpt')
  const config = parseChatGptConfig(value)
  const settings = readResolvedAiSettings(path)
  settings.provider = 'chatgpt'
  settings.providers.chatgpt = { ...settings.providers.chatgpt, model: config.model }
  writeFileSync(path, JSON.stringify(settings, null, 2))
  return config
}

/** Do not let a server that echoes the Authorization token leak it back to a renderer. */
export function redactLmStudioStatusError(status: LmStudioStatus, apiKey: string): LmStudioStatus {
  const token = apiKey.trim()
  if (!token || !status.error?.includes(token)) return status
  return { ...status, error: status.error.split(token).join('[redacted]') }
}
