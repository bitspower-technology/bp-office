import { ANTHROPIC_BASE_URL } from './protocols/anthropic'
import { GEMINI_BASE_URL } from './protocols/gemini'
import { normalizeLmStudioBaseUrl } from './lmstudio'
import { AI_PROVIDERS } from './providers'
import type { AiAuthenticationMode, AiProviderConfig, AiProviderId, AiProviderMeta } from './types'

/** The three wire protocols every provider maps onto. */
export type AiProtocol = 'anthropic' | 'gemini' | 'openai-compatible'

export interface ProviderCapabilities {
  /** Managed providers own their local OAuth flow; LM Studio accepts no credential by default. */
  auth: AiAuthenticationMode
  /** chat models accept image input (declarative; for custom endpoints it is assumed, not known) */
  vision: boolean
  /** chat models support function/tool calls */
  tools: boolean
}

export interface ResolvedEndpoint {
  protocol: AiProtocol
  baseUrl: string
  /** the endpoint fixes its sampling and rejects a temperature field (Kimi K3: "only 1 is allowed") */
  omitTemperature?: boolean
  /** vendor-specific request fields merged into the chat-completions body */
  bodyExtras?: Record<string, unknown>
}

export interface ProviderAdapter {
  meta: AiProviderMeta
  capabilities: ProviderCapabilities
  /** pick the wire protocol and base URL for one request (may depend on the configured model) */
  resolveEndpoint(config: AiProviderConfig): ResolvedEndpoint
}

function metaOf(id: AiProviderId): AiProviderMeta {
  return AI_PROVIDERS.find((m) => m.id === id)!
}

/**
 * Model families that fix sampling and reject a temperature field, on any
 * route — vendor API, OpenRouter's vendor-prefixed ids, or a mirror behind a
 * custom base URL. Kimi K3 answers "only 1 is allowed";
 * OpenAI's GPT-5 reasoning family rejects any temperature other than the
 * default outright.
 */
export function modelHasFixedSampling(model: string): boolean {
  return /(^|\/)(kimi-k3|gpt-5)/.test(model)
}

/**
 * DeepSeek V4 thinks by default, and once a request carries `tools` the API
 * rejects (400) every later turn whose assistant messages don't echo back the
 * `reasoning_content` it produced. Our OpenAI-compatible transcript has no
 * field to carry that, so the agent loop would die right after its first tool
 * call. Pin the models to non-thinking mode — what the retired deepseek-chat
 * alias did — until the transcript can round-trip reasoning.
 */
const DEEPSEEK_NON_THINKING = { thinking: { type: 'disabled' } }

/** a stored baseUrl overrides the default endpoint (regional mirrors, e.g. api.moonshot.cn vs .ai) */
function fixedEndpoint(
  protocol: AiProtocol,
  baseUrl: string,
  extras?: { omitTemperature?: boolean; bodyExtras?: Record<string, unknown> },
) {
  return (config: AiProviderConfig): ResolvedEndpoint => {
    const omit = extras?.omitTemperature || modelHasFixedSampling(config.model)
    return {
      protocol,
      baseUrl: config.baseUrl || baseUrl,
      ...(omit ? { omitTemperature: true } : {}),
      ...(extras?.bodyExtras ? { bodyExtras: extras.bodyExtras } : {}),
    }
  }
}

export const AI_PROVIDER_ADAPTERS: Record<AiProviderId, ProviderAdapter> = {
  lmstudio: {
    meta: metaOf('lmstudio'),
    capabilities: { auth: 'optional-token', vision: true, tools: true },
    resolveEndpoint(config) {
      return {
        protocol: 'openai-compatible',
        baseUrl: normalizeLmStudioBaseUrl(config.baseUrl),
        ...(modelHasFixedSampling(config.model) ? { omitTemperature: true } : {}),
      }
    },
  },
  // ChatGPT was removed from the BP-Office provider list; the adapter stays
  // registered outside the catalog so legacy settings ids keep a known shape.
  chatgpt: {
    meta: {
      id: 'chatgpt',
      label: 'ChatGPT',
      models: [],
      defaultModel: '',
      keyPlaceholder: '',
      needsBaseUrl: false,
      requiresApiKey: false,
      dynamicModels: true,
      authMode: 'managed',
      managedAuth: true,
      vision: true,
      tools: true,
    },
    capabilities: { auth: 'managed', vision: true, tools: true },
    resolveEndpoint() {
      throw new Error(
        'ChatGPT subscription requests require ChatGptProviderService from @genoffice/ai-provider/chatgpt-main',
      )
    },
  },
  anthropic: {
    meta: metaOf('anthropic'),
    capabilities: { auth: 'api-key', vision: true, tools: true },
    resolveEndpoint: fixedEndpoint('anthropic', ANTHROPIC_BASE_URL),
  },
  gemini: {
    meta: metaOf('gemini'),
    capabilities: { auth: 'api-key', vision: true, tools: true },
    resolveEndpoint: fixedEndpoint('gemini', GEMINI_BASE_URL),
  },
  deepseek: {
    meta: metaOf('deepseek'),
    capabilities: { auth: 'api-key', vision: false, tools: true },
    resolveEndpoint: fixedEndpoint('openai-compatible', 'https://api.deepseek.com/v1', {
      bodyExtras: DEEPSEEK_NON_THINKING,
    }),
  },
  openai: {
    meta: metaOf('openai'),
    capabilities: { auth: 'api-key', vision: true, tools: true },
    resolveEndpoint: fixedEndpoint('openai-compatible', 'https://api.openai.com/v1'),
  },
  kimi: {
    meta: metaOf('kimi'),
    capabilities: { auth: 'api-key', vision: true, tools: true },
    resolveEndpoint: fixedEndpoint('openai-compatible', 'https://api.moonshot.ai/v1', {
      omitTemperature: true,
    }),
  },
  glm: {
    meta: metaOf('glm'),
    capabilities: { auth: 'api-key', vision: false, tools: true },
    resolveEndpoint: fixedEndpoint('openai-compatible', 'https://open.bigmodel.cn/api/paas/v4'),
  },
  qwen: {
    meta: metaOf('qwen'),
    capabilities: { auth: 'api-key', vision: false, tools: true },
    resolveEndpoint: fixedEndpoint(
      'openai-compatible',
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
    ),
  },
  doubao: {
    meta: metaOf('doubao'),
    capabilities: { auth: 'api-key', vision: true, tools: true },
    resolveEndpoint: fixedEndpoint('openai-compatible', 'https://ark.cn-beijing.volces.com/api/v3'),
  },
  minimax: {
    meta: metaOf('minimax'),
    capabilities: { auth: 'api-key', vision: false, tools: true },
    resolveEndpoint: fixedEndpoint('openai-compatible', 'https://api.minimax.io/v1'),
  },
  xai: {
    meta: metaOf('xai'),
    capabilities: { auth: 'api-key', vision: true, tools: true },
    resolveEndpoint: fixedEndpoint('openai-compatible', 'https://api.x.ai/v1'),
  },
  mistral: {
    meta: metaOf('mistral'),
    capabilities: { auth: 'api-key', vision: false, tools: true },
    resolveEndpoint: fixedEndpoint('openai-compatible', 'https://api.mistral.ai/v1'),
  },
  openrouter: {
    meta: metaOf('openrouter'),
    capabilities: { auth: 'api-key', vision: true, tools: true },
    resolveEndpoint: fixedEndpoint('openai-compatible', 'https://openrouter.ai/api/v1'),
  },
  custom: {
    meta: metaOf('custom'),
    capabilities: { auth: 'api-key', vision: true, tools: true },
    resolveEndpoint(config) {
      if (!config.baseUrl) throw new Error('A custom provider requires a Base URL')
      return {
        protocol: 'openai-compatible',
        baseUrl: config.baseUrl,
        ...(modelHasFixedSampling(config.model) ? { omitTemperature: true } : {}),
      }
    },
  },
}

/** Throws on ids not in the registry — settings files are user data and can carry anything. */
export function getProviderAdapter(provider: AiProviderId): ProviderAdapter {
  const adapter = AI_PROVIDER_ADAPTERS[provider]
  if (!adapter) throw new Error(`Unknown provider: ${provider}`)
  return adapter
}
