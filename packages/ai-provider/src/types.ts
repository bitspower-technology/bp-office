import type { AgentMessage, AgentToolCall, AgentToolDef } from '@genoffice/agent-core'

export type AiProviderId = 'lmstudio' | 'anthropic' | 'gemini' | 'deepseek' | 'openai' | 'custom'

export interface AiProviderConfig {
  apiKey?: string
  model: string
  /** Used by providers with a configurable OpenAI-compatible endpoint. */
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
  defaultBaseUrl?: string
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
  type: 'delta' | 'tool-call' | 'done' | 'error' | 'ping'
  text?: string
  /** complete parsed tool call (emitted once its arguments finish streaming) */
  toolCall?: AgentToolCall
  error?: string
  /** machine-readable timeout cause; lets the renderer localize the message */
  errorCode?: 'timeout'
  /** normalized stop reason carried on 'done' ('max_tokens' = output cut off by the token limit) */
  stopReason?: string
}
