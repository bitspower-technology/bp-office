#!/usr/bin/env node
/**
 * scripts/update-feed-utils.cjs — shared helpers for the electron-updater
 * feed files (latest*.yml / beta*.yml): version parsing and the
 * forward-only promote/upload guard. Used by release automation and kept
 * dependency-free so CI can invoke it before installing packages while vitest
 * can require it directly.
 */

function ymlVersion(text) {
  const m = /^version:\s*(\S+)/m.exec(text)
  return m ? m[1] : null
}

function parseSemver(value) {
  if (typeof value !== 'string') throw new TypeError('version must be a string')

  // Deliberately keep this helper dependency-free: release jobs invoke it
  // before npm install has necessarily completed. A leading `v` is accepted
  // because GitHub release tags conventionally use it; build metadata is
  // parsed but does not participate in SemVer precedence.
  const match =
    /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(
      value.trim(),
    )
  if (!match) throw new TypeError(`invalid semantic version: ${value}`)

  const core = match.slice(1, 4)
  if (core.some((part) => part.length > 1 && part.startsWith('0'))) {
    throw new TypeError(`invalid semantic version: ${value}`)
  }

  const prerelease = match[4] ? match[4].split('.') : []
  if (
    prerelease.some(
      (identifier) =>
        /^\d+$/.test(identifier) && identifier.length > 1 && identifier.startsWith('0'),
    )
  ) {
    throw new TypeError(`invalid semantic version: ${value}`)
  }

  return {
    core: core.map((part) => BigInt(part)),
    prerelease,
  }
}

function compareSemver(a, b) {
  const left = parseSemver(a)
  const right = parseSemver(b)

  for (let i = 0; i < 3; i++) {
    if (left.core[i] !== right.core[i]) return left.core[i] > right.core[i] ? 1 : -1
  }

  // A normal release has higher precedence than any prerelease of the same
  // core version. Two versions that differ only by build metadata are equal.
  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    if (left.prerelease.length === right.prerelease.length) return 0
    return left.prerelease.length === 0 ? 1 : -1
  }

  const count = Math.max(left.prerelease.length, right.prerelease.length)
  for (let i = 0; i < count; i++) {
    const l = left.prerelease[i]
    const r = right.prerelease[i]
    if (l === undefined || r === undefined) return l === undefined ? -1 : 1
    if (l === r) continue

    const lNumeric = /^\d+$/.test(l)
    const rNumeric = /^\d+$/.test(r)
    if (lNumeric && rNumeric) return BigInt(l) > BigInt(r) ? 1 : -1
    if (lNumeric !== rNumeric) return lNumeric ? -1 : 1
    return l > r ? 1 : -1
  }
  return 0
}

function semverNewer(a, b) {
  return compareSemver(a, b) > 0
}

function assertPromotable(candidate, currentStable, force) {
  parseSemver(candidate)
  if (currentStable) parseSemver(currentStable)
  if (force || !currentStable || semverNewer(candidate, currentStable)) return { ok: true }
  return {
    ok: false,
    reason: `${candidate} is not newer than the published stable ${currentStable}; pass --force to roll back`,
  }
}

function releaseUploadDecision(candidate, current, { force = false, allowExisting = false } = {}) {
  parseSemver(candidate)
  const comparison = current ? compareSemver(candidate, current) : null
  if (comparison === 0 && allowExisting) return { action: 'skip' }
  if (force || comparison === null || comparison > 0) return { action: 'upload' }
  return {
    action: 'reject',
    reason: `${candidate} is not newer than published ${current}; bump the release version or pass --force to roll back`,
  }
}

module.exports = {
  ymlVersion,
  parseSemver,
  compareSemver,
  semverNewer,
  assertPromotable,
  releaseUploadDecision,
}
