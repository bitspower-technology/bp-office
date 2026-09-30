import { LM_STUDIO_DEFAULT_BASE_URL } from './lmstudio'
import type { AiProviderId, AiProviderMeta, AiSettings, LegacyAiSettings } from './types'

/** Versioned display name; the direct adapter maps this to DeepSeek's wire id. */
export const DEEPSEEK_V41_FLASH = 'deep-seek-v4.1-flash'

/** OpenCode gateways require a stable conversation identifier for session routing. */
export function opencodeSessionHeaders(
  baseUrl: string | undefined,
  sessionId?: string,
): Record<string, string> {
  return baseUrl?.startsWith('https://opencode.ai/')
    ? { 'x-opencode-session': sessionId || crypto.randomUUID() }
    : {}
}

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
    label: 'OpenAI Endpoint',
    models: [],
    defaultModel: '',
    keyPlaceholder: 'sk-unsloth-...',
    needsBaseUrl: true,
    requiresApiKey: true,
    dynamicModels: true,
    authMode: 'api-key',
    defaultBaseUrl: LM_STUDIO_DEFAULT_BASE_URL,
    vision: true,
    tools: true,
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    models: [],
    defaultModel: '',
    keyPlaceholder: '',
    requiresApiKey: false,
    dynamicModels: true,
    authMode: 'managed',
    managedAuth: true,
    vision: true,
    tools: true,
  },
  {
    id: 'anthropic',
    label: 'Claude',
    // current-generation ids per platform.claude.com models overview (2026-09-24).
    // Fable needs data retention enabled on the org, otherwise the API answers
    // model_not_available; every other id is served to any key.
    models: [
      'claude-opus-5-5',
      'claude-sonnet-5',
      'claude-fable-5-1',
      'claude-opus-5',
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
    // 3.x lineup per ai.google.dev/gemini-api/docs/models (2026-09-23). 3.8 Flash
    // is the current stable Flash Google recommends; 3.1 Pro is still preview-only.
    models: [
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.1-pro-preview',
      'gemini-3.6-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
    ],
    defaultModel: 'gemini-3.8-flash',
    keyPlaceholder: 'AIza...',
    vision: true,
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    // GET api.deepseek.com/v1/models serves `deepseek-v4-pro` and
    // `deepseek-flash` (verified 2026-09-21); the latter is V4.1 Flash with
    // native vision. We list it under a versioned display name; the adapter maps it back to
    // the unversioned wire id (see DEEPSEEK_WIRE_IDS in registry.ts).
    models: ['deepseek-v4-pro', DEEPSEEK_V41_FLASH],
    defaultModel: 'deepseek-v4-pro',
    keyPlaceholder: 'sk-...',
    vision: true,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    // GPT-5.6 naming: sol is the flagship (the bare `gpt-5.6` alias resolves to
    // it, but spell it out so the picker says which tier it is), terra balances
    // cost/intelligence, luna is the high-volume tier (2026-08). The GPT-6
    // family (astra, sol, luna) is deliberately absent: Chat Completions
    // supports its function calling only with reasoning_effort none, full
    // tool use needs the Responses API, which has no protocol here (2026-09-24)
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
      'anthropic/claude-opus-5.5',
      'anthropic/claude-sonnet-5',
      'openai/gpt-6-astra',
      'openai/gpt-6-sol',
      'openai/gpt-6-luna',
      'openai/gpt-5.6-sol',
      'moonshotai/kimi-k3',
    ],
    defaultModel: 'openrouter/auto',
    keyPlaceholder: 'sk-or-...',
    vision: true,
  },
  {
    id: 'requesty',
    label: 'Requesty',
    // Managed policy ids exactly as GET router.requesty.ai/v1/models/managed
    // lists them (2026-09-24): short stable names Requesty routes across
    // providers, used as-is in the model field. The full vendor-prefixed
    // catalog (GET /v1/models, e.g. openai/gpt-4o-mini) works too when typed
    // in. Ids ending "@eu" route through EU providers only.
    models: [
      'claude-sonnet-5',
      'claude-opus-5-5',
      'claude-opus-4-8',
      'gpt-6-sol',
      'gpt-6-luna',
      'gpt-5.6-sol',
      'gpt-5.6-terra',
      'gemini-3.7-flash',
      'deepseek-v4-pro',
      'kimi-k3',
    ],
    defaultModel: 'claude-sonnet-5',
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'opper',
    label: 'Opper',
    // Pool ids exactly as GET api.opper.ai/v3/models lists them (2026-09-14):
    // a bare name is an Opper pool, and Opper picks the serving provider and
    // region per request. The vendor-prefixed catalog (anthropic/claude-sonnet-4-6,
    // azure/gpt-5, …) pins one provider and works as-is when typed in.
    // Full list at opper.ai/models.
    models: [
      'claude-sonnet-4-6',
      'claude-opus-5',
      'gpt-5.5',
      'gpt-5.4-mini',
      'gemini-3.8-flash',
      'deepseek-v4-pro',
      'kimi-k3',
      'mistral-large-2512',
    ],
    defaultModel: 'claude-sonnet-4-6',
    keyPlaceholder: 'API Key',
  },
  {
    id: 'opencode-zen',
    label: 'OpenCode Zen',
    // Pay-as-you-go gateway (opencode.ai/docs/zen); ids exactly as GET
    // /zen/v1/models lists them (2026-09-24). GPT-5.x/6, Grok and Muse Spark
    // are served only through the Responses API, which has no protocol here,
    // so they stay out until one exists.
    models: [
      'claude-sonnet-5',
      'claude-opus-5-5',
      'claude-opus-5',
      'claude-fable-5-1',
      'claude-haiku-4-5',
      'gemini-3.7-flash',
      'gemini-3.1-pro',
      'kimi-k3',
      'kimi-k2.7-code',
      'deepseek-v4-pro',
      'deepseek-v4-flash',
      'glm-5.2',
      'minimax-m3',
      'qwen3.6-plus',
    ],
    defaultModel: 'claude-sonnet-5',
    keyPlaceholder: 'API Key',
  },
  {
    id: 'opencode-go',
    label: 'OpenCode Go',
    // $10/month subscription to open-weight coding models (opencode.ai/docs/go),
    // same key as Zen; ids exactly as GET /zen/go/v1/models lists them
    // (2026-09-03). GPT-5.6 Luna, Grok and Muse Spark are Responses-only and
    // left out for the same reason as above.
    models: [
      'kimi-k2.7-code',
      'kimi-k3',
      'glm-5.3',
      'glm-5.3-flash',
      'deepseek-v4-pro',
      'deepseek-v4-flash',
      'qwen3.8-max',
      'qwen3.8-flash',
      'minimax-m3',
      'mimo-v2.5-pro',
      'longcat-2.0',
    ],
    defaultModel: 'kimi-k2.7-code',
    keyPlaceholder: 'API Key',
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

/** Full internal provider catalog. Normal settings UIs expose only OpenAI Endpoint and ChatGPT. */
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
 * needsBaseUrl also need a base URL). Managed ChatGPT owns its authentication.
 * OpenAI Endpoint always requires a key, while an empty endpoint model means
 * automatic model selection. Anything invalid or unknown falls back to the
 * endpoint so its configuration UI can report the actionable requirement.
 */
export function activeProvider(settings: AiSettings): AiProviderId {
  const provider = settings.provider
  const meta = AI_PROVIDERS.find((m) => m.id === provider)
  const config = settings.providers?.[provider]
  if (!meta || !config) return 'lmstudio'
  if (provider === 'lmstudio' || provider === 'chatgpt') return provider
  if ((meta.requiresApiKey && !config.apiKey?.trim()) || !config.model?.trim()) return 'lmstudio'
  if (meta.needsBaseUrl && !config.baseUrl?.trim()) return 'lmstudio'
  return provider
}

/**
 * Model ids a vendor has stopped serving, mapped to their replacement. A
 * stored selection outlives the provider list, so without this remap an old
 * settings file keeps sending an id the API now rejects.
 */
const RETIRED_MODELS: Partial<Record<AiProviderId, Record<string, string>>> = {
  // chat/reasoner retired 2026-07-24 (thinking became a request parameter);
  // V4 Flash and V4 Flash Vision Exp retired 2026-09-10 in favour of V4.1
  // Flash, which carries vision natively. The vendor's own `deepseek-flash`
  // id is folded in as well so the stored value matches the listed one.
  deepseek: {
    'deepseek-chat': DEEPSEEK_V41_FLASH,
    'deepseek-reasoner': DEEPSEEK_V41_FLASH,
    'deepseek-v4-flash': DEEPSEEK_V41_FLASH,
    'deepseek-v4-flash-vision-exp': DEEPSEEK_V41_FLASH,
    'deepseek-flash': DEEPSEEK_V41_FLASH,
  },
}

/**
 * Per-turn output cap applied when the settings carry none. The historic 8192
 * was the budget a reasoning model burns on thinking before it writes any prose,
 * and too small for a large sheet DSL or long-form generation in one turn. Models
 * whose own ceiling is lower reject this and are retried at that ceiling
 * (see output-cap.ts).
 */
export const DEFAULT_MAX_OUTPUT_TOKENS = 32768
/** bounds accepted for AiSettings.maxOutputTokens: below the first a short answer cannot even finish, above the second one turn risks the whole context window */
export const MIN_MAX_OUTPUT_TOKENS = 1024
export const MAX_MAX_OUTPUT_TOKENS = 131072

/** Out-of-range or non-finite input falls back to a bound / the default (a mistyped settings field must not kill AI features) */
export function clampMaxOutputTokens(value: unknown): number {
  const n = typeof value === 'number' ? Math.floor(value) : Number.NaN
  if (!Number.isFinite(n)) return DEFAULT_MAX_OUTPUT_TOKENS
  return Math.min(MAX_MAX_OUTPUT_TOKENS, Math.max(MIN_MAX_OUTPUT_TOKENS, n))
}

/** The effective per-turn output cap of a settings object (clamped; absent → default) */
export function maxOutputTokensOf(
  settings: Pick<AiSettings, 'maxOutputTokens'> | null | undefined,
): number {
  return settings?.maxOutputTokens === undefined
    ? DEFAULT_MAX_OUTPUT_TOKENS
    : clampMaxOutputTokens(settings.maxOutputTokens)
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

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
export function resolveAiSettings(input: unknown, defaults: AiSettings): AiSettings {
  const stored = (isRecord(input) ? input : {}) as LegacyAiSettings & {
    provider?: unknown
    providers?: unknown
    maxOutputTokens?: unknown
  }
  const providers = {} as AiSettings['providers']
  for (const meta of AI_PROVIDERS) providers[meta.id] = { ...defaults.providers[meta.id] }
  const outputLimit =
    stored.maxOutputTokens !== undefined || defaults.maxOutputTokens !== undefined
      ? {
          maxOutputTokens: clampMaxOutputTokens(stored.maxOutputTokens ?? defaults.maxOutputTokens),
        }
      : {}

  if (!isRecord(stored.providers)) {
    if (typeof stored.apiKey === 'string' && stored.apiKey.trim()) {
      providers.custom = {
        apiKey: str(stored.apiKey),
        model: str(stored.model),
        baseUrl: str(stored.baseUrl) || 'https://api.openai.com/v1',
      }
    }
    return { provider: defaults.provider, providers, ...outputLimit }
  }

  for (const meta of AI_PROVIDERS) {
    const saved = stored.providers[meta.id]
    if (!isRecord(saved)) continue
    providers[meta.id] = {
      apiKey:
        typeof saved.apiKey === 'string' ? saved.apiKey.trim() : (providers[meta.id].apiKey ?? ''),
      model: typeof saved.model === 'string' ? saved.model.trim() : providers[meta.id].model,
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
    ...outputLimit,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
