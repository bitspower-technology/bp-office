import { LM_STUDIO_DEFAULT_BASE_URL } from './lmstudio'
import type { AiProviderId, AiProviderMeta, AiSettings, LegacyAiSettings } from './types'

export const AI_PROVIDERS: AiProviderMeta[] = [
  {
    id: 'lmstudio',
    label: 'LM Studio',
    models: [],
    defaultModel: '',
    keyPlaceholder: 'Optional API token',
    needsBaseUrl: true,
    requiresApiKey: false,
    dynamicModels: true,
    defaultBaseUrl: LM_STUDIO_DEFAULT_BASE_URL,
  },
  {
    id: 'anthropic',
    label: 'Claude',
    models: [
      'claude-sonnet-5',
      'claude-opus-4-8',
      'claude-opus-4-7',
      'claude-sonnet-4-6',
      'claude-opus-4-6',
      'claude-opus-4-5-20251101',
      'claude-haiku-4-5-20251001',
      'claude-sonnet-4-5-20250929',
    ],
    defaultModel: 'claude-opus-4-7',
    keyPlaceholder: 'sk-ant-api03-...',
    needsBaseUrl: false,
    requiresApiKey: true,
    dynamicModels: false,
  },
  {
    id: 'gemini',
    label: 'Gemini',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
    defaultModel: 'gemini-2.5-flash',
    keyPlaceholder: 'AIza...',
    needsBaseUrl: false,
    requiresApiKey: true,
    dynamicModels: false,
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    defaultModel: 'deepseek-chat',
    keyPlaceholder: 'sk-...',
    needsBaseUrl: false,
    requiresApiKey: true,
    dynamicModels: false,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini'],
    defaultModel: 'gpt-4.1-mini',
    keyPlaceholder: 'sk-...',
    needsBaseUrl: false,
    requiresApiKey: true,
    dynamicModels: false,
  },
  {
    id: 'custom',
    label: 'Custom',
    models: [],
    defaultModel: '',
    keyPlaceholder: 'API Key',
    needsBaseUrl: true,
    requiresApiKey: true,
    dynamicModels: true,
  },
]

/**
 * Fresh settings with every provider's default model and an empty key,
 * except providers listed in `defaultApiKeys` (for example an app-specific
 * preconfigured Anthropic key). Callers own that policy; this package has no
 * hardcoded credentials.
 */
export function defaultAiSettings(
  defaultApiKeys?: Partial<Record<AiProviderId, string>>,
): AiSettings {
  const providers = {} as AiSettings['providers']
  for (const meta of AI_PROVIDERS) {
    providers[meta.id] = {
      apiKey: defaultApiKeys?.[meta.id] ?? '',
      model: meta.defaultModel,
      baseUrl: meta.needsBaseUrl ? (meta.defaultBaseUrl ?? '') : undefined,
    }
  }
  return { provider: 'lmstudio', providers }
}

/**
 * Merge on-disk settings over fresh defaults. The pre-provider single-endpoint
 * shape still migrates into `custom`. Removed Genspark and unknown provider ids
 * migrate to LM Studio without copying an incompatible cloud model id.
 */
export function resolveAiSettings(
  stored: LegacyAiSettings & { provider?: unknown; providers?: unknown },
  defaults: AiSettings,
): AiSettings {
  const providers = {} as AiSettings['providers']
  for (const meta of AI_PROVIDERS) providers[meta.id] = { ...defaults.providers[meta.id] }

  if (!isRecord(stored.providers)) {
    if (stored.apiKey) {
      providers.custom = {
        apiKey: stored.apiKey,
        model: stored.model ?? '',
        baseUrl: stored.baseUrl ?? 'https://api.openai.com/v1',
      }
    }
    return { provider: defaults.provider, providers }
  }

  for (const meta of AI_PROVIDERS) {
    const saved = stored.providers[meta.id]
    if (!isRecord(saved)) continue
    providers[meta.id] = {
      apiKey: typeof saved.apiKey === 'string' ? saved.apiKey : (providers[meta.id].apiKey ?? ''),
      model: typeof saved.model === 'string' ? saved.model : providers[meta.id].model,
      baseUrl: typeof saved.baseUrl === 'string' ? saved.baseUrl : providers[meta.id].baseUrl,
    }
  }

  const knownProvider = AI_PROVIDERS.some((meta) => meta.id === stored.provider)
  return {
    provider: knownProvider ? (stored.provider as AiProviderId) : 'lmstudio',
    providers,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
