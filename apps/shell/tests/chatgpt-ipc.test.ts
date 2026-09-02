import { describe, expect, it } from 'vitest'
import { isTrustedChatGptAuthUrl, parseChatGptLoginId } from '../src/main/chatgpt-ipc'

describe('ChatGPT sign-in IPC validation', () => {
  it.each([
    'https://chatgpt.com/auth/login',
    'https://auth.openai.com/oauth/authorize?client_id=niuoffice',
    'https://login.chatgpt.com/codex',
    'https://openai.com:443/',
  ])('accepts trusted HTTPS login URL %s', (url) => {
    expect(isTrustedChatGptAuthUrl(url)).toBe(true)
  })

  it.each([
    'http://chatgpt.com/auth/login',
    'https://chatgpt.com:8443/auth/login',
    'https://user:pass@chatgpt.com/auth/login',
    'https://chatgpt.com.evil.example/auth/login',
    'https://evilchatgpt.com/auth/login',
    'https://openai.com.evil.example/auth/login',
    'javascript:alert(1)',
    'not-a-url',
  ])('rejects untrusted login URL %s', (url) => {
    expect(isTrustedChatGptAuthUrl(url)).toBe(false)
  })

  it('accepts an opaque bounded login id', () => {
    expect(parseChatGptLoginId('login-123')).toBe('login-123')
    expect(parseChatGptLoginId('x'.repeat(512))).toHaveLength(512)
  })

  it.each([undefined, null, '', 123, {}, 'x'.repeat(513)])(
    'rejects an invalid login id %#',
    (value) => {
      expect(() => parseChatGptLoginId(value)).toThrow('Invalid ChatGPT login session')
    },
  )
})
