/**
 * Shared availability rule for the OOXML schema gate (tools/ooxml-validate).
 *
 * The gate shells out to `xmllint` from libxml2-utils. Ubuntu CI installs that package, so
 * the gate is meaningful there; Windows release builds and most developer machines have no
 * xmllint at all, where running the gate would report dozens of false failures.
 *
 * Rule: run the gate exactly where the binary exists, and never let a host that is expected
 * to provide it lose the check silently - `expectSchemaGateOnLinuxCi` fails loudly instead.
 */
import { xmllintAvailable } from '../../../tools/ooxml-validate/validate-pptx.mjs'

/** true when this machine can actually run xmllint */
export const schemaGateAvailable = xmllintAvailable()

/** true on CI Linux runners, where libxml2-utils is part of the job definition */
export const schemaGateExpectedHere = Boolean(process.env.CI) && process.platform === 'linux'

/** skip marker for suites that need the schema gate */
export const skipWithoutSchemaGate = !schemaGateAvailable
