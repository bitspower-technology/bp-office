import { EDITOR_AGENT_MAX_CONTEXT_BYTES } from '@genoffice/agent-core'

/** Fail closed for direct calls that bypass the renderer agent's compaction loop. */
export function assertAiContextBudget(value: unknown): void {
  const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength
  if (bytes > EDITOR_AGENT_MAX_CONTEXT_BYTES) {
    throw new Error(
      'This AI request exceeds the 130K-token (estimated) context budget. ' +
        'Shorten the instruction, reduce attachments, or narrow the document/context, then try again.',
    )
  }
}
