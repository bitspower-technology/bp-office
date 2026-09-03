/**
 * BP Office drives every editor's agent without chain-of-thought: each request asks
 * the endpoint to answer directly instead of spending latency and tokens on hidden
 * reasoning. All four editors share `@genoffice/ai-provider`, so the policy lives
 * here once instead of in each app; the provider registry's own `bodyExtras` still
 * wins over anything this module returns.
 *
 * The wire field differs per vendor family, hence the model-id matcher — mirroring
 * how the registry gates every other endpoint quirk.
 */

/** DeepSeek V4, Kimi/Moonshot and GLM-style endpoints take a `thinking` object. */
const THINKING_OBJECT_DISABLED = { thinking: { type: 'disabled' } }

/** Chat-template switch honoured by local vLLM / LM Studio servers. */
const TEMPLATE_THINKING_DISABLED = { chat_template_kwargs: { enable_thinking: false } }

/**
 * OpenAI-compatible no-reasoning switches for one model id.
 *
 * `reasoning_effort` is the field OpenAI defined and most compatible vendors
 * mirror; the vendor-specific objects go only to the families that document them,
 * so a strict endpoint never sees a field its family is known to reject.
 */
export function openAiNoThinkingFields(model: string): Record<string, unknown> {
  const id = model.toLowerCase()
  if (/(^|\/)(deep-?seek|kimi|moonshot|glm)/.test(id)) return THINKING_OBJECT_DISABLED
  if (/(^|\/)(qwen|qwq)|r1-|(\|-)r1($|-)/.test(id)) {
    // DashScope takes the bare flag, a local vLLM/LM Studio template the nested one
    return { enable_thinking: false, ...TEMPLATE_THINKING_DISABLED }
  }
  return { reasoning_effort: 'none' }
}

/** Gemini's `generationConfig.thinkingConfig` equivalent of the above. */
export const GEMINI_NO_THINKING = { includeThoughts: false, thinkingBudget: 0 }

/**
 * Claude reasons only when a request asks for it, so most turns need nothing.
 * The models that ship with thinking on by default do, and they take this switch;
 * a model without a thinking field rejects it by name and the caller retries clean.
 */
export const ANTHROPIC_NO_THINKING = { thinking: { type: 'disabled' } }

/** Names this module may add to a body; used to read a schema rejection back. */
const NO_THINKING_FIELD_NAMES = [
  'reasoning_effort',
  'thinking',
  'enable_thinking',
  'chat_template_kwargs',
  'thinkingconfig',
]

/** Nested Gemini spelling, which the API quotes as `generationConfig.thinking_config`. */
const NO_THINKING_NESTED_NAMES = ['thinking_budget', 'thinking_level']

/**
 * True when a rejected request body names one of our no-thinking fields, i.e. the
 * endpoint validates its schema instead of ignoring an unknown field. Callers then
 * resend once without them: a turn that thinks still beats a turn that fails.
 */
export function rejectsNoThinkingField(detail: string): boolean {
  const text = detail.toLowerCase()
  return [...NO_THINKING_FIELD_NAMES, ...NO_THINKING_NESTED_NAMES].some((field) =>
    text.includes(field),
  )
}
