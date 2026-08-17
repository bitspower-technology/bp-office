export type {
  AiChatRequest,
  AiChatResponse,
  AiProviderConfig,
  AiProviderId,
  AiProviderMeta,
  AiSettings,
  AiStreamChunk,
  AiStreamRequest,
  LegacyAiSettings,
  LmStudioModel,
  LmStudioStatus,
} from './types'
export { AI_PROVIDERS, defaultAiSettings, resolveAiSettings } from './providers'
export {
  LM_STUDIO_DEFAULT_BASE_URL,
  LM_STUDIO_STATUS_TIMEOUT_MS,
  checkLmStudioStatus,
  listLmStudioModels,
  normalizeLmStudioBaseUrl,
  resolveLmStudioModel,
  selectLmStudioModel,
} from './lmstudio'
export { chatForProvider } from './chat'
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
