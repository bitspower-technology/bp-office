export interface SchemaProblem {
  part: string
  message: string
}
export function xmllintAvailable(): boolean
/** xmllint stderr split into LF-trimmed lines; Windows writes CRLF and a trailing \r breaks the ` validates` success filter. */
export function parseXmllintStderr(stderr: string | undefined): string[]
/** one xmllint diagnostic -> { file, line, message }; handles Unix `f:1:` and Windows `C:\f:1:28:` */
export function parseDiagnostic(
  line: string,
): { file: string; line: number; message: string } | null
/** true when an echoed path refers to the expected one (Windows separators/case tolerant) */
export function sameDiagnosticPath(echoed: string, expected: string): boolean
export function mcePreprocess(xml: string): string
export function validatePptx(input: string | Uint8Array): Promise<SchemaProblem[]>
export function newProblems(base: SchemaProblem[], edited: SchemaProblem[]): SchemaProblem[]
