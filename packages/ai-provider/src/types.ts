import type {
  AgentMessage,
  AgentToolCall,
  AgentToolDef,
  AgentToolResult,
} from '@genoffice/agent-core'

export type AiProviderId =
  | 'lmstudio'
  | 'chatgpt'
  | 'anthropic'
  | 'gemini'
  | 'deepseek'
  | 'openai'
  | 'kimi'
  | 'glm'
  | 'qwen'
  | 'doubao'
  | 'minimax'
  | 'xai'
  | 'mistral'
  | 'openrouter'
  | 'custom'

export type AiAuthenticationMode = 'none' | 'optional-token' | 'api-key' | 'managed'

export interface AiProviderConfig {
  /** Optional only for providers such as LM Studio and managed ChatGPT authentication. */
  apiKey?: string
  model: string
  /** Used by providers with a configurable or overridable endpoint. */
  baseUrl?: string | undefined
}

export interface AiProviderMeta {
  id: AiProviderId
  label: string
  models: string[]
  defaultModel: string
  keyPlaceholder: string
  needsBaseUrl: boolean
  requiresApiKey: boolean
  dynamicModels: boolean
  authMode: AiAuthenticationMode
  /** Credentials and requests are owned by a provider-specific local runtime. */
  managedAuth?: boolean
  defaultBaseUrl?: string
  vision: boolean
  tools: boolean
}

export interface ChatGptAccount {
  email?: string
  planType?: string
}

export interface ChatGptModel {
  id: string
  /** Concrete model name sent to thread/start; it can differ from the catalog id. */
  model: string
  displayName: string
  isDefault: boolean
  inputModalities: Array<'text' | 'image'>
  defaultReasoningEffort?: string
}

export interface ChatGptRateLimitWindow {
  usedPercent: number
  windowDurationMins?: number
  resetsAt?: number
}

export interface ChatGptRateLimit {
  limitId?: string
  limitName?: string
  primary?: ChatGptRateLimitWindow
  secondary?: ChatGptRateLimitWindow
  reached: boolean
}

export interface ChatGptStatus {
  state: 'connected' | 'signed-out' | 'unavailable' | 'error'
  account?: ChatGptAccount
  models: ChatGptModel[]
  selectedModel?: string
  rateLimits: ChatGptRateLimit[]
  error?: string
}

export interface ChatGptLoginStart {
  loginId: string
  /** Open only from the Electron main process after validating HTTPS/localhost. */
  authUrl: string
}

export interface ChatGptLoginCompleted {
  loginId?: string
  success: boolean
  error?: string
}

export interface LmStudioModel {
  id: string
  displayName: string
  loaded: boolean
  toolCapable?: boolean
  vision?: boolean
}

export interface LmStudioStatus {
  state: 'connected' | 'no-models' | 'unauthorized' | 'unreachable'
  baseUrl: string
  models: LmStudioModel[]
  selectedModel?: string
  error?: string
}

export interface AiSettings {
  provider: AiProviderId
  providers: Record<AiProviderId, AiProviderConfig>
}

/** pre-provider settings shape (single OpenAI-compatible endpoint); migrated into "custom" */
export interface LegacyAiSettings {
  baseUrl?: string
  apiKey?: string
  model?: string
}

export interface AiChatRequest {
  settings: AiSettings
  system: string
  user: string
}

export interface AiChatResponse {
  ok: boolean
  content?: string
  error?: string
}

export interface AiStreamRequest {
  requestId: string
  settings: AiSettings
  system: string
  messages: AgentMessage[]
  tools?: AgentToolDef[]
  maxTokens?: number
}

export interface AiStreamChunk {
  requestId: string
  /** 'ping' = wire-level keepalive so the renderer can tell a live stream from a dead one */
  type: 'delta' | 'tool-call' | 'tool-request' | 'done' | 'error' | 'ping'
  text?: string
  /** complete parsed tool call (emitted once its arguments finish streaming) */
  toolCall?: AgentToolCall
  error?: string
  /** machine-readable error cause; lets the renderer localize connection failures */
  errorCode?: 'timeout' | 'network'
  /** normalized stop reason carried on 'done' ('max_tokens' = output cut off by the token limit) */
  stopReason?: string
}

/** Renderer-to-main response for a mid-turn managed-provider tool request. */
export interface AiToolResultRequest {
  requestId: string
  result: AgentToolResult
}
