import { chatAnthropic } from './protocols/anthropic'
import { assertAiContextBudget } from './context-budget'
import { chatGemini } from './protocols/gemini'
import { chatOpenAiCompatible } from './protocols/openai-compatible'
import { ResponseBodyTooLargeError } from './protocols/shared'
import { getProviderAdapter, type ResolvedEndpoint } from './registry'
import { resolveLmStudioModel } from './lmstudio'
import type { AiChatResponse, AiProviderConfig, AiProviderId } from './types'
import { AI_CHAT_RESPONSE_TIMEOUT_MS, createStreamWatchdog } from './watchdog'

/** route a one-shot (non-streaming, non-tool-calling) chat call by provider id */
export async function chatForProvider(
  provider: AiProviderId,
  config: AiProviderConfig,
  system: string,
  user: string,
  signal?: AbortSignal,
): Promise<AiChatResponse> {
  // non-streaming: the server generates the full answer before the headers arrive,
  // so the connect phase gets the long budget; the body read then gets the idle budget
  const wd = createStreamWatchdog(signal, AI_CHAT_RESPONSE_TIMEOUT_MS)
  const result = wd.guard(async () => {
    let adapter
    try {
      assertAiContextBudget({ system, user })
      adapter = getProviderAdapter(provider)
      if (adapter.meta.requiresApiKey && !config.apiKey?.trim()) {
        return { ok: false as const, error: `${adapter.meta.label} requires an API key` }
      }
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : String(e),
      }
    }
    let requestConfig = config
    if (provider === 'lmstudio') {
      requestConfig = { ...config, model: await resolveLmStudioModel(config, wd.signal) }
    }
    let endpoint: ResolvedEndpoint
    try {
      endpoint = adapter.resolveEndpoint(requestConfig)
    } catch (e) {
      // config errors (unknown provider, missing base URL) report as a failed reply, not a rejection
      return Promise.resolve({
        ok: false as const,
        error: e instanceof Error ? e.message : String(e),
      })
    }
    if (endpoint.model) requestConfig = { ...requestConfig, model: endpoint.model }
    switch (endpoint.protocol) {
      case 'anthropic':
        return chatAnthropic(wd, requestConfig, system, user, endpoint.baseUrl)
      case 'gemini':
        return chatGemini(wd, requestConfig, system, user, endpoint.baseUrl, {
          omitTemperature: endpoint.omitTemperature,
        })
      case 'openai-compatible':
        return chatOpenAiCompatible(wd, endpoint.baseUrl, requestConfig, system, user, {
          omitTemperature: endpoint.omitTemperature,
          bodyExtras: endpoint.bodyExtras,
        })
    }
  })
  return result.catch((e) => {
    if (e instanceof ResponseBodyTooLargeError) return { ok: false as const, error: e.message }
    throw e
  })
}
