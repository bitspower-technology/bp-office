import { LM_STUDIO_DEFAULT_BASE_URL } from './lmstudio'
import type { AiProviderId, AiProviderMeta, AiSettings, LegacyAiSettings } from './types'

type ProviderCatalogEntry = Omit<
  AiProviderMeta,
  'needsBaseUrl' | 'requiresApiKey' | 'dynamicModels' | 'authMode' | 'vision' | 'tools'
> &
  Partial<
    Pick<
      AiProviderMeta,
      'needsBaseUrl' | 'requiresApiKey' | 'dynamicModels' | 'authMode' | 'vision' | 'tools'
    >
  >

const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    id: 'lmstudio',
    label: 'LM Studio',
    models: [],
    defaultModel: '',
    keyPlaceholder: 'Optional API token',
    needsBaseUrl: true,
    requiresApiKey: false,
    dynamicModels: true,
    authMode: 'optional-token',
    defaultBaseUrl: LM_STUDIO_DEFAULT_BASE_URL,
    vision: true,
    tools: true,
  },
  {
    id: 'anthropic',
    label: 'Claude',
    // current-generation ids per platform.claude.com models overview (2026-08)
    models: [
      'claude-opus-5',
      'claude-sonnet-5',
      'claude-fable-5',
      'claude-opus-4-8',
      'claude-opus-4-7',
      'claude-sonnet-4-6',
      'claude-haiku-4-5-20251001',
    ],
    defaultModel: 'claude-sonnet-5',
    keyPlaceholder: 'sk-ant-api03-...',
    vision: true,
  },
  {
    id: 'gemini',
    label: 'Gemini',
    // 3.x lineup per ai.google.dev/gemini-api/docs/models (2026-08). 3.7 Flash is
    // the current stable Flash; 3.1 Pro is still preview-only.
    models: [
      'gemini-3.7-flash',
      'gemini-3.1-pro-preview',
      'gemini-3.6-flash',
      'gemini-3.5-flash-lite',
    ],
    defaultModel: 'gemini-3.7-flash',
    keyPlaceholder: 'AIza...',
    vision: true,
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    // V4 ids per api-docs.deepseek.com (2026-08). The deepseek-chat /
    // deepseek-reasoner aliases were retired 2026-07-24; thinking mode is now
    // a request parameter, so both ids drive the tool-calling agent loop.
    models: ['deepseek-v4-pro', 'deepseek-v4-flash'],
    defaultModel: 'deepseek-v4-pro',
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    // GPT-5.6 naming: sol is the flagship (the bare `gpt-5.6` alias resolves to
    // it, but spell it out so the picker says which tier it is), terra balances
    // cost/intelligence, luna is the high-volume tier (2026-08)
    models: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini'],
    defaultModel: 'gpt-5.6-terra',
    keyPlaceholder: 'sk-...',
    vision: true,
  },
  {
    id: 'kimi',
    label: 'Kimi',
    models: ['kimi-k3'],
    defaultModel: 'kimi-k3',
    keyPlaceholder: 'sk-...',
    vision: true,
  },
  {
    id: 'glm',
    label: 'GLM',
    // bigmodel.cn text-model lineup (2026-08); 5.3 and 5.2 share a base model,
    // 5-Turbo is the cheap tier
    models: ['glm-5.3', 'glm-5.2', 'glm-5-turbo'],
    defaultModel: 'glm-5.3',
    keyPlaceholder: 'xxxxxxxx.xxxxxxxx',
  },
  {
    id: 'qwen',
    label: 'Qwen',
    // Versioned DashScope ids: the bare qwen-max alias still points at a
    // Qwen2.5-era snapshot, so name the 3.x tiers explicitly (2026-08)
    models: ['qwen3.8-max', 'qwen3.7-plus', 'qwen3.7-flash'],
    defaultModel: 'qwen3.8-max',
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'doubao',
    label: 'Doubao',
    // Ark ids are dashed and date-pinned; it also accepts ep-... inference
    // endpoint ids in the model field
    models: ['doubao-seed-2-1-pro-260628', 'doubao-seed-2-1-turbo-260628'],
    defaultModel: 'doubao-seed-2-1-pro-260628',
    keyPlaceholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    vision: true,
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    // M3 is the current agentic/tool-use model; M2.5 moved to the legacy tier
    models: ['MiniMax-M3', 'MiniMax-M2.7'],
    defaultModel: 'MiniMax-M3',
    keyPlaceholder: 'eyJ...',
  },
  {
    id: 'xai',
    label: 'Grok',
    models: ['grok-4.6', 'grok-4.5'],
    defaultModel: 'grok-4.6',
    keyPlaceholder: 'xai-...',
    vision: true,
  },
  {
    id: 'mistral',
    label: 'Mistral',
    // `-latest` aliases track the newest GA snapshot. Medium 3.5 is Mistral's
    // agentic tier; codestral is a code-completion/FIM model, not an agent driver.
    models: ['mistral-medium-latest', 'mistral-large-latest', 'mistral-small-latest'],
    defaultModel: 'mistral-medium-latest',
    keyPlaceholder: 'API Key',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    // vendor-prefixed slugs exactly as openrouter.ai/api/v1/models lists them —
    // there is no `openai/gpt-5.6` alias there, only the per-tier ids
    models: [
      'openrouter/auto',
      'anthropic/claude-sonnet-5',
      'openai/gpt-5.6-sol',
      'moonshotai/kimi-k3',
    ],
    defaultModel: 'openrouter/auto',
    keyPlaceholder: 'sk-or-...',
    vision: true,
  },
  {
    id: 'custom',
    label: 'Custom',
    models: [],
    defaultModel: '',
    keyPlaceholder: 'API Key',
    needsBaseUrl: true,
    dynamicModels: true,
    vision: true,
  },
]

/** Full internal provider catalog. Normal settings UIs expose only LM Studio. */
export const AI_PROVIDERS: AiProviderMeta[] = PROVIDER_CATALOG.map((meta) => ({
  needsBaseUrl: false,
  requiresApiKey: true,
  dynamicModels: false,
  authMode: 'api-key',
  vision: false,
  tools: true,
  ...meta,
}))

/**
 * Fresh settings with every provider's default model and an empty key,
 * except providers listed in `defaultApiKeys` (e.g. an app-specific
 * preconfigured Anthropic key). Callers own that policy; this package
 * has no hardcoded keys.
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
 * The stored provider selection is honored only when its config is usable
 * (api-key providers need a key and a model id; providers flagged
 * needsBaseUrl also need a base URL). Local LM Studio does not require a
 * key; an empty LM Studio model means automatic selection. Removed or
 * unknown ids (including the retired ChatGPT provider) fall back to LM Studio.
 */
export function activeProvider(settings: AiSettings): AiProviderId {
  const provider = settings.provider
  const meta = AI_PROVIDERS.find((m) => m.id === provider)
  const config = settings.providers?.[provider]
  if (!meta || !config) return 'lmstudio'
  if (provider === 'lmstudio') return provider
  if ((meta.requiresApiKey && !config.apiKey?.trim()) || !config.model) return 'lmstudio'
  if (meta.needsBaseUrl && !config.baseUrl) return 'lmstudio'
  return provider
}

/**
 * Model ids a vendor has stopped serving, mapped to their replacement. A
 * stored selection outlives the provider list, so without this remap an old
 * settings file keeps sending an id the API now rejects.
 */
const RETIRED_MODELS: Partial<Record<AiProviderId, Record<string, string>>> = {
  // aliases retired 2026-07-24; DeepSeek pointed both at the V4-Flash line,
  // where thinking mode is a request parameter rather than a separate id
  deepseek: {
    'deepseek-chat': 'deepseek-v4-flash',
    'deepseek-reasoner': 'deepseek-v4-flash',
  },
}

function migrateRetiredModels(providers: AiSettings['providers']): AiSettings['providers'] {
  const migrated = { ...providers }
  for (const [id, replacements] of Object.entries(RETIRED_MODELS)) {
    const config = migrated[id as AiProviderId]
    const replacement = config?.model ? replacements[config.model] : undefined
    if (replacement) migrated[id as AiProviderId] = { ...config, model: replacement }
  }
  return migrated
}

/**
 * Merge on-disk settings over freshly computed defaults, migrating the
 * pre-provider shape (a single OpenAI-compatible endpoint) into the
 * "custom" provider slot. `stored` is whatever the caller read from its
 * settings file (already JSON-parsed); this function does no file I/O.
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
        apiKey: stored.apiKey.trim(),
        model: stored.model ?? '',
        baseUrl: (stored.baseUrl ?? 'https://api.openai.com/v1').trim(),
      }
    }
    return { provider: defaults.provider, providers }
  }

  for (const meta of AI_PROVIDERS) {
    const saved = stored.providers[meta.id]
    if (!isRecord(saved)) continue
    providers[meta.id] = {
      apiKey:
        typeof saved.apiKey === 'string' ? saved.apiKey.trim() : (providers[meta.id].apiKey ?? ''),
      model: typeof saved.model === 'string' ? saved.model : providers[meta.id].model,
      baseUrl:
        typeof saved.baseUrl === 'string' ? saved.baseUrl.trim() : providers[meta.id].baseUrl,
    }
  }

  const migrated = migrateRetiredModels(providers)
  const knownProvider = AI_PROVIDERS.some((meta) => meta.id === stored.provider)
  return {
    // Removed/unknown provider ids intentionally migrate to the local default.
    provider: knownProvider ? (stored.provider as AiProviderId) : 'lmstudio',
    providers: migrated,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
