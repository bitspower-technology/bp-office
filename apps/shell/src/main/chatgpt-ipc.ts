const TRUSTED_CHATGPT_AUTH_HOSTS = ['chatgpt.com', 'openai.com'] as const

/** Only the Electron main process may open a ChatGPT app-server login URL. */
export function isTrustedChatGptAuthUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return false
    if (url.port && url.port !== '443') return false
    const host = url.hostname.toLowerCase()
    return TRUSTED_CHATGPT_AUTH_HOSTS.some(
      (trustedHost) => host === trustedHost || host.endsWith(`.${trustedHost}`),
    )
  } catch {
    return false
  }
}

/** Treat the login id as an opaque, bounded value before returning it to app-server. */
export function parseChatGptLoginId(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 512) {
    throw new Error('Invalid ChatGPT login session.')
  }
  return value
}
