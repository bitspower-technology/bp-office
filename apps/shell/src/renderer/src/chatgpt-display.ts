/** Convert app-server plan identifiers into stable, user-facing labels. */
export function chatGptPlanLabel(planType: string | undefined): string {
  if (!planType) return 'ChatGPT'
  const normalized = planType.trim().toLowerCase().replace(/[- ]+/g, '_')
  const knownPlans: Record<string, string> = {
    free: 'Free',
    go: 'Go',
    plus: 'Plus',
    pro: 'Pro',
    team: 'Team',
    business: 'Business',
    enterprise: 'Enterprise',
    edu: 'Edu',
    self_serve_business_usage_based: 'Business',
  }
  if (knownPlans[normalized]) return knownPlans[normalized]
  if (normalized.includes('enterprise')) return 'Enterprise'
  if (normalized.includes('business')) return 'Business'
  if (normalized.includes('team')) return 'Team'
  if (normalized.includes('edu')) return 'Edu'
  // Unknown service-internal ids must not leak into user-facing copy.
  return 'ChatGPT'
}

export function clampChatGptUsagePercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(Math.min(100, Math.max(0, value)))
}

export function formatChatGptWindowDuration(minutes: number | undefined, locale: string): string {
  if (!minutes || !Number.isFinite(minutes) || minutes <= 0) return ''
  const [value, unit] =
    minutes >= 1_440
      ? [minutes / 1_440, 'day']
      : minutes >= 60
        ? [minutes / 60, 'hour']
        : [minutes, 'minute']
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    unitDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(value)
}

/** App-server reset timestamps are Unix seconds; malformed values stay hidden. */
export function formatChatGptResetTime(resetsAt: number | undefined, locale: string): string {
  if (!resetsAt || !Number.isFinite(resetsAt) || resetsAt <= 0) return ''
  const date = new Date(resetsAt * 1_000)
  if (!Number.isFinite(date.getTime())) return ''
  try {
    return date.toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return date.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
  }
}
