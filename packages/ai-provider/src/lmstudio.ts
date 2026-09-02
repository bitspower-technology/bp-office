import { httpBodyDetail } from './http-error'
import type { AiProviderConfig, LmStudioModel, LmStudioStatus } from './types'

export const LM_STUDIO_DEFAULT_BASE_URL = 'http://127.0.0.1:1234/v1'
export const LM_STUDIO_STATUS_TIMEOUT_MS = 3000

/** Normalize a manually-entered LM Studio server root to its OpenAI-compatible `/v1` root. */
export function normalizeLmStudioBaseUrl(baseUrl?: string): string {
  const url = new URL(baseUrl?.trim() || LM_STUDIO_DEFAULT_BASE_URL)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('OpenAI Endpoint Base URL must use HTTP or HTTPS')
  }
  const path = url.pathname.replace(/\/+$/, '')
  url.pathname = /(?:^|\/)v1$/.test(path) ? path : `${path}/v1`.replace(/\/{2,}/g, '/')
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/+$/, '')
}

class LmStudioAuthenticationError extends Error {
  constructor() {
    super('OpenAI Endpoint requires an API key')
    this.name = 'LmStudioAuthenticationError'
  }
}

export function lmStudioAuthHeaders(apiKey?: string): Record<string, string> {
  const token = apiKey?.trim()
  if (!token) throw new LmStudioAuthenticationError()
  return { Authorization: `Bearer ${token}` }
}

class LmStudioHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'LmStudioHttpError'
  }
}

function nativeModelsUrl(baseUrl: string): string {
  return new URL('/api/v1/models', baseUrl).toString()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function capability(value: unknown, objectKey: string, arrayNames: string[]): boolean | undefined {
  if (Array.isArray(value)) {
    const names = value.filter((item): item is string => typeof item === 'string')
    return arrayNames.some((name) => names.includes(name))
  }
  if (!isRecord(value)) return undefined
  return typeof value[objectKey] === 'boolean' ? value[objectKey] : undefined
}

function parseModels(payload: unknown, source: 'native' | 'openai'): LmStudioModel[] {
  if (!isRecord(payload)) throw new Error('OpenAI Endpoint returned an invalid model list')
  const raw = source === 'native' ? payload.models : payload.data
  if (!Array.isArray(raw)) throw new Error('OpenAI Endpoint returned an invalid model list')

  const models: LmStudioModel[] = []
  let recognizedEntries = 0
  for (const value of raw) {
    if (!isRecord(value)) continue
    const type = typeof value.type === 'string' ? value.type.toLowerCase() : ''
    if (type === 'embedding' || type === 'embeddings') {
      recognizedEntries += 1
      continue
    }
    const idValue = source === 'native' ? value.key : value.id
    if (typeof idValue !== 'string' || !idValue) continue
    if (source === 'openai' && /(?:^|[-_/])embed(?:ding)?s?(?:[-_/]|$)/i.test(idValue)) {
      recognizedEntries += 1
      continue
    }

    recognizedEntries += 1
    const displayNameValue = value.display_name ?? value.name
    const displayName =
      typeof displayNameValue === 'string' && displayNameValue ? displayNameValue : idValue
    const loadedInstances = value.loaded_instances
    const state = typeof value.state === 'string' ? value.state.toLowerCase() : undefined
    const loaded = Array.isArray(loadedInstances)
      ? loadedInstances.length > 0
      : typeof value.loaded === 'boolean'
        ? value.loaded
        : state !== undefined
          ? state === 'loaded'
          : source === 'openai'
    const toolCapable = capability(value.capabilities, 'trained_for_tool_use', [
      'tool_use',
      'tools',
      'function_calling',
    ])
    const visionFromCapabilities = capability(value.capabilities, 'vision', [
      'vision',
      'image_input',
    ])
    const vision = visionFromCapabilities ?? (type === 'vlm' ? true : undefined)
    models.push({
      id: idValue,
      displayName,
      loaded,
      ...(toolCapable !== undefined ? { toolCapable } : {}),
      ...(vision !== undefined ? { vision } : {}),
    })
  }
  if (raw.length > 0 && recognizedEntries === 0) {
    throw new Error('OpenAI Endpoint returned an invalid model list')
  }
  return models
}

async function fetchModels(
  url: string,
  config: AiProviderConfig,
  signal: AbortSignal,
): Promise<Response> {
  return fetch(url, {
    method: 'GET',
    signal,
    headers: lmStudioAuthHeaders(config.apiKey),
  })
}

async function requireOk(response: Response): Promise<Response> {
  if (response.ok) return response
  const detail = httpBodyDetail(await response.text())
  throw new LmStudioHttpError(
    response.status,
    `OpenAI Endpoint HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
  )
}

async function listLmStudioModelsWithSignal(
  config: AiProviderConfig,
  signal: AbortSignal,
): Promise<LmStudioModel[]> {
  const baseUrl = normalizeLmStudioBaseUrl(config.baseUrl)
  const nativeResponse = await fetchModels(nativeModelsUrl(baseUrl), config, signal)
  if (nativeResponse.status === 401 || nativeResponse.status === 403) {
    await requireOk(nativeResponse)
  }
  if (nativeResponse.ok) {
    try {
      return parseModels(await nativeResponse.json(), 'native')
    } catch {
      // Older/mixed LM Studio installations can expose the route with another shape.
      // Fall through to the stable OpenAI-compatible model-list endpoint.
    }
  }

  const compatibleResponse = await requireOk(await fetchModels(`${baseUrl}/models`, config, signal))
  return parseModels(await compatibleResponse.json(), 'openai')
}

/** Discover local chat models with a bounded probe that also respects caller cancellation. */
export async function listLmStudioModels(
  config: AiProviderConfig,
  signal?: AbortSignal,
): Promise<LmStudioModel[]> {
  const controller = new AbortController()
  const relayAbort = () => controller.abort(signal?.reason)
  if (signal?.aborted) relayAbort()
  else signal?.addEventListener('abort', relayAbort, { once: true })
  const timeout = setTimeout(() => controller.abort(), LM_STUDIO_STATUS_TIMEOUT_MS)
  try {
    return await listLmStudioModelsWithSignal(config, controller.signal)
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', relayAbort)
  }
}

/** Select configured, tool-ready loaded, loaded, then lexicographically first model. */
export function selectLmStudioModel(
  config: AiProviderConfig,
  models: LmStudioModel[],
): string | undefined {
  const configured = config.model.trim()
  if (configured && models.some((model) => model.id === configured)) return configured
  const toolReady = models.find((model) => model.loaded && model.toolCapable)
  if (toolReady) return toolReady.id
  const loaded = models.find((model) => model.loaded)
  if (loaded) return loaded.id
  return [...models].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0]?.id
}

/** Resolve automatic or stale manual selections before an LM Studio model request. */
export async function resolveLmStudioModel(
  config: AiProviderConfig,
  signal?: AbortSignal,
): Promise<string> {
  const selected = selectLmStudioModel(config, await listLmStudioModels(config, signal))
  if (!selected) {
    throw new Error(
      'OpenAI Endpoint is connected, but no chat models are available. Load an LLM on the configured server and try again.',
    )
  }
  return selected
}

/** Probe LM Studio and normalize network/auth/model-list outcomes for status UIs. */
export async function checkLmStudioStatus(
  config: AiProviderConfig,
  signal?: AbortSignal,
): Promise<LmStudioStatus> {
  let baseUrl: string
  try {
    baseUrl = normalizeLmStudioBaseUrl(config.baseUrl)
  } catch (error) {
    return {
      state: 'unreachable',
      baseUrl: config.baseUrl?.trim() || LM_STUDIO_DEFAULT_BASE_URL,
      models: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }

  try {
    const models = await listLmStudioModels({ ...config, baseUrl }, signal)
    const selectedModel = selectLmStudioModel(config, models)
    if (models.length === 0) return { state: 'no-models', baseUrl, models }
    return {
      state: 'connected',
      baseUrl,
      models,
      ...(selectedModel ? { selectedModel } : {}),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const state =
      error instanceof LmStudioAuthenticationError ||
      (error instanceof LmStudioHttpError && (error.status === 401 || error.status === 403))
        ? 'unauthorized'
        : 'unreachable'
    return { state, baseUrl, models: [], error: message }
  }
}
