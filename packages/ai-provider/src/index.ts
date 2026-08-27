export type {
  AiAuthenticationMode,
  AiChatRequest,
  AiChatResponse,
  AiProviderConfig,
  AiProviderId,
  AiProviderMeta,
  AiSettings,
  AiStreamChunk,
  AiStreamRequest,
  AiToolResultRequest,
  ChatGptAccount,
  ChatGptLoginCompleted,
  ChatGptLoginStart,
  ChatGptModel,
  ChatGptRateLimit,
  ChatGptRateLimitWindow,
  ChatGptStatus,
  LegacyAiSettings,
  LmStudioModel,
  LmStudioStatus,
} from './types'
export { AI_PROVIDERS, activeProvider, defaultAiSettings, resolveAiSettings } from './providers'
export {
  LM_STUDIO_DEFAULT_BASE_URL,
  LM_STUDIO_STATUS_TIMEOUT_MS,
  checkLmStudioStatus,
  listLmStudioModels,
  lmStudioAuthHeaders,
  normalizeLmStudioBaseUrl,
  resolveLmStudioModel,
  selectLmStudioModel,
} from './lmstudio'
export { AI_PROVIDER_ADAPTERS, getProviderAdapter } from './registry'
export type {
  AiProtocol,
  ProviderAdapter,
  ProviderCapabilities,
  ResolvedEndpoint,
} from './registry'
export { chatForProvider } from './chat'
export { setRescueFetch } from './fetch'
export { isAiNetworkError } from './network-error'
export { sseLines, streamForProvider } from './stream'
export type { StreamCallbacks } from './stream'
export {
  AI_CHAT_RESPONSE_TIMEOUT_MS,
  AI_CONNECT_TIMEOUT_MS,
  AI_IDLE_TIMEOUT_MS,
  AiTimeoutError,
  createStreamWatchdog,
} from './watchdog'
export type { StreamWatchdog } from './watchdog'
