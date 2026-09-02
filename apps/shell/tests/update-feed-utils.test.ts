import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

// the utils are a dependency-free CommonJS script shared with CI; load via
// createRequire since this test file is ESM
const require = createRequire(import.meta.url)
const {
  ymlVersion,
  compareSemver,
  semverNewer,
  assertPromotable,
  releaseUploadDecision,
} = require('../../../scripts/update-feed-utils.cjs')

/** Promote-workflow guard: stable may only move forward (unless forced). */
describe('update-feed-utils', () => {
  it('parses the version from an electron-updater feed', () => {
    expect(ymlVersion('version: 0.5.82\nfiles:\n  - url: x.zip')).toBe('0.5.82')
    expect(ymlVersion('files:\n  - url: x.zip')).toBeNull()
  })

  it('compares plain x.y.z versions', () => {
    expect(semverNewer('0.5.83', '0.5.82')).toBe(true)
    expect(semverNewer('0.5.82', '0.5.82')).toBe(false)
    expect(semverNewer('0.5.9', '0.5.82')).toBe(false)
    expect(semverNewer('0.6.0', '0.5.82')).toBe(true)
  })

  it('orders numbered NiuOffice prereleases instead of truncating them to the core version', () => {
    expect(semverNewer('0.8.667-niu.4', '0.8.667-niu.3')).toBe(true)
    expect(semverNewer('0.8.667-niu.10', '0.8.667-niu.9')).toBe(true)
    expect(semverNewer('0.8.667-niu.3', '0.8.667-niu.4')).toBe(false)
    expect(compareSemver('v0.8.667-niu.4', '0.8.667-niu.4+rebuilt')).toBe(0)
  })

  it('implements SemVer prerelease precedence', () => {
    expect(semverNewer('0.8.667', '0.8.667-niu.99')).toBe(true)
    expect(semverNewer('0.8.667-niu.1', '0.8.667-beta.999')).toBe(true)
    expect(semverNewer('0.8.667-niu.1.1', '0.8.667-niu.1')).toBe(true)
  })

  it('fails closed for malformed versions', () => {
    expect(() => semverNewer('0.8', '0.7.0')).toThrow(/invalid semantic version/)
    expect(() => semverNewer('0.8.667-niu.04', '0.8.667-niu.3')).toThrow(/invalid semantic version/)
  })

  it('allows promoting a strictly newer version', () => {
    expect(assertPromotable('0.5.83', '0.5.82', false)).toEqual({ ok: true })
  })

  it('allows the first promote when no stable feed exists yet', () => {
    expect(assertPromotable('0.5.83', null, false)).toEqual({ ok: true })
  })

  it('rejects equal or older versions without --force', () => {
    expect(assertPromotable('0.5.82', '0.5.82', false).ok).toBe(false)
    expect(assertPromotable('0.5.80', '0.5.82', false).ok).toBe(false)
  })

  it('lets --force roll back', () => {
    expect(assertPromotable('0.5.80', '0.5.82', true)).toEqual({ ok: true })
  })

  it('makes an exact-version CI rerun a no-op when explicitly allowed', () => {
    expect(
      releaseUploadDecision('0.5.82', '0.5.82', {
        allowExisting: true,
      }),
    ).toEqual({ action: 'skip' })
    expect(
      releaseUploadDecision('0.8.667-niu.4', 'v0.8.667-niu.4', {
        allowExisting: true,
      }),
    ).toEqual({ action: 'skip' })
  })

  it('still rejects equal and older uploads by default', () => {
    expect(releaseUploadDecision('0.5.82', '0.5.82').action).toBe('reject')
    expect(releaseUploadDecision('0.5.81', '0.5.82', { allowExisting: true }).action).toBe('reject')
  })

  it('allows a forward NiuOffice release while rejecting an older numbered build', () => {
    expect(releaseUploadDecision('0.8.667-niu.4', '0.8.667-niu.3').action).toBe('upload')
    expect(releaseUploadDecision('0.8.667-niu.2', '0.8.667-niu.3').action).toBe('reject')
  })
})
