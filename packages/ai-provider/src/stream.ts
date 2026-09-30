import type { AgentMessage, AgentToolDef } from '@genoffice/agent-core'
import { withOutputCapFallback } from './output-cap'
import { assertAiContextBudget } from './context-budget'
import { streamAnthropic } from './protocols/anthropic'
import { streamGemini } from './protocols/gemini'
import { streamOpenAiCompatible } from './protocols/openai-compatible'
import type { StreamCallbacks } from './protocols/shared'
import { getProviderAdapter } from './registry'
import { resolveLmStudioModel } from './lmstudio'
import type { AiProviderConfig, AiProviderId } from './types'

export { streamAnthropic } from './protocols/anthropic'
export { streamGemini } from './protocols/gemini'
export { streamOpenAiCompatible } from './protocols/openai-compatible'
export { sseLines } from './protocols/shared'
export type { StreamCallbacks } from './protocols/shared'

/** route a streaming, tool-calling-capable turn by provider id */
export async function streamForProvider(
  provider: AiProviderId,
  config: AiProviderConfig,
  system: string,
  messages: AgentMessage[],
  tools: AgentToolDef[],
  maxTokens: number,
  cb: StreamCallbacks,
): Promise<void> {
  assertAiContextBudget({ system, messages, tools })
  const adapter = getProviderAdapter(provider)
  if (adapter.meta.requiresApiKey && !config.apiKey?.trim()) {
    throw new Error(`${adapter.meta.label} requires an API key`)
  }
  let requestConfig =
    provider === 'lmstudio'
      ? { ...config, model: await resolveLmStudioModel(config, cb.signal) }
      : config
  const endpoint = adapter.resolveEndpoint(requestConfig)
  const { baseUrl } = endpoint
  if (endpoint.model) requestConfig = { ...requestConfig, model: endpoint.model }
  return withOutputCapFallback(baseUrl, requestConfig.model, maxTokens, (cap) => {
    switch (endpoint.protocol) {
      case 'anthropic':
        return streamAnthropic(requestConfig, system, messages, tools, cap, cb, baseUrl)
      case 'gemini':
        return streamGemini(requestConfig, system, messages, tools, cap, cb, baseUrl, {
          omitTemperature: endpoint.omitTemperature,
        })
      case 'openai-compatible':
        return streamOpenAiCompatible(baseUrl, requestConfig, system, messages, tools, cap, cb, {
          omitTemperature: endpoint.omitTemperature,
          useMaxCompletionTokens: endpoint.useMaxCompletionTokens,
          bodyExtras: endpoint.bodyExtras,
        })
    }
  })
}
