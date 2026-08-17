import { EDITOR_AGENT_MAX_TURNS } from '@genoffice/agent-core'

export const DOCS_AGENT_MAX_TURNS = EDITOR_AGENT_MAX_TURNS

export const DOCS_CONTINUE_INSTRUCTION =
  'Continue the current task using the existing conversation and document state. Finish only the outstanding work. Do not repeat edits or steps that are already complete.'
