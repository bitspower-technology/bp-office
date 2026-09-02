import { describe, expect, it } from 'vitest'
import {
  chatGptPlanLabel,
  clampChatGptUsagePercent,
  formatChatGptResetTime,
  formatChatGptWindowDuration,
} from '../src/renderer/src/chatgpt-display'

describe('ChatGPT status display helpers', () => {
  it('humanizes known plans without exposing service-internal identifiers', () => {
    expect(chatGptPlanLabel('plus')).toBe('Plus')
    expect(chatGptPlanLabel('pro')).toBe('Pro')
    expect(chatGptPlanLabel('self_serve_business_usage_based')).toBe('Business')
    expect(chatGptPlanLabel('enterprise_managed')).toBe('Enterprise')
    expect(chatGptPlanLabel('future_internal_plan_42')).toBe('ChatGPT')
  })

  it('clamps malformed and out-of-range usage percentages', () => {
    expect(clampChatGptUsagePercent(-20)).toBe(0)
    expect(clampChatGptUsagePercent(42.4)).toBe(42)
    expect(clampChatGptUsagePercent(180)).toBe(100)
    expect(clampChatGptUsagePercent(Number.NaN)).toBe(0)
  })

  it('formats rate-limit windows with locale-aware units', () => {
    expect(formatChatGptWindowDuration(15, 'en-US')).toMatch(/15\s*min/i)
    expect(formatChatGptWindowDuration(120, 'en-US')).toMatch(/2\s*hr/i)
    expect(formatChatGptWindowDuration(2_880, 'en-US')).toMatch(/2\s*day/i)
    expect(formatChatGptWindowDuration(undefined, 'en-US')).toBe('')
  })

  it('formats Unix reset seconds in the current UI locale', () => {
    const timestamp = Date.UTC(2026, 0, 2, 3, 4) / 1_000
    expect(formatChatGptResetTime(timestamp, 'en-US')).toBe(
      new Date(timestamp * 1_000).toLocaleString('en-US', {
        dateStyle: 'short',
        timeStyle: 'short',
      }),
    )
  })

  it.each([undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, 9e20])(
    'hides an invalid reset value %#',
    (value) => {
      expect(formatChatGptResetTime(value, 'en-US')).toBe('')
    },
  )
})
