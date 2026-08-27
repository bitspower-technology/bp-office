import { readFileSync, writeFileSync } from 'node:fs'
import {
  LM_STUDIO_DEFAULT_BASE_URL,
  defaultAiSettings,
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
  return resolveAiSettings(settingsObject(path), defaultAiSettings())
}

export function normalizeLmStudioBaseUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('LM Studio base URL must be a string.')
  const raw = value.trim()
  if (!raw || raw.length > MAX_BASE_URL_LENGTH) throw new Error('Invalid LM Studio base URL.')

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('Invalid LM Studio base URL.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('LM Studio base URL must use http or https.')
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('LM Studio base URL cannot include credentials, a query, or a fragment.')
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
    throw new Error('Invalid LM Studio configuration.')
  }
  const input = value as Record<string, unknown>
  return {
    baseUrl: normalizeLmStudioBaseUrl(input.baseUrl),
    model: boundedString(input.model, 'LM Studio model', MAX_MODEL_LENGTH),
    apiKey: boundedString(input.apiKey, 'LM Studio API token', MAX_API_KEY_LENGTH),
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

/** Only the providers surfaced by this BP-Office build can cross shell IPC. */
export function parseAiConnectionProvider(value: unknown): AiConnectionProvider {
  if (value === 'lmstudio' || value === 'chatgpt') return value
  throw new Error('Invalid AI provider.')
}

/** ChatGPT was removed from this build; the shell selector only offers LM Studio. */
export function readAiConnectionProvider(path: string): AiConnectionProvider {
  // The read still validates/migrates the stored file (a saved 'chatgpt'
  // selection resolves to the local default); the selector shows LM Studio.
  void readResolvedAiSettings(path)
  return 'lmstudio'
}

export function writeAiConnectionProvider(path: string, value: unknown): AiConnectionProvider {
  const parsed = parseAiConnectionProvider(value)
  const provider: AiConnectionProvider = parsed === 'chatgpt' ? 'lmstudio' : parsed
  const settings = readResolvedAiSettings(path)
  // Keep the legacy ChatGPT slot that resolveAiSettings no longer carries, so
  // switching providers never deletes saved data.
  const storedChatGpt = settingsObject(path).providers?.chatgpt
  if (storedChatGpt && !settings.providers.chatgpt) {
    settings.providers.chatgpt = { ...storedChatGpt }
  }
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
  // Read the raw file: resolveAiSettings no longer retains slots for
  // providers outside the catalog (ChatGPT was removed from this build).
  const stored = settingsObject(path)
  const config = stored.providers?.chatgpt
  return {
    model: typeof config?.model === 'string' ? config.model.trim().slice(0, MAX_MODEL_LENGTH) : '',
  }
}

export function writeChatGptConfig(path: string, value: unknown): ChatGptConfig {
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
