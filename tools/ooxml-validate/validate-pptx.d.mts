export interface SchemaProblem {
  part: string
  message: string
}
export function xmllintAvailable(): boolean
/** xmllint stderr split into LF-trimmed lines; Windows writes CRLF and a trailing \r breaks the ` validates` success filter. */
export function parseXmllintStderr(stderr: string | undefined): string[]
export function mcePreprocess(xml: string): string
export function validatePptx(input: string | Uint8Array): Promise<SchemaProblem[]>
export function newProblems(base: SchemaProblem[], edited: SchemaProblem[]): SchemaProblem[]
