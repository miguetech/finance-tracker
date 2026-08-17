import { describe, it, expect, vi, afterEach } from 'vitest'
import { popupOAuth } from '../src/auth/popupOAuth'

describe('popupOAuth id_token', () => {
  afterEach(() => { localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks() })
  function idToken(nonce: string): string {
    const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))
    const payload = btoa(JSON.stringify({ nonce, email: 'a@b.c', exp: Math.floor(Date.now() / 1000) + 3600 }))
    return `${header}.${payload}.sig`
  }
  it('devuelve id_token desde el hash sin persistirlo en localStorage', async () => {
    const nonce = 'NONCE123'
    sessionStorage.setItem('ft_web_oauth_nonce', nonce)
    const hash = `#access_token=ACC&id_token=${encodeURIComponent(idToken(nonce))}&expires_in=3600`
    Object.defineProperty(window, 'location', { value: { hash, pathname: '/', href: 'http://x/', search: '', replaceState: () => {} }, configurable: true, writable: true })
    const auth = popupOAuth({ clientId: 'C', redirectUri: 'http://x/' })
    const t = await auth.getIdToken(false)
    expect(t).toBe(idToken(nonce))
    expect(localStorage.getItem('ft_web_id_token')).toBeNull()
    expect(localStorage.getItem('ft_web_access_token')).toBeNull()
  })
  it('descarta id_token cuyo nonce no coincide', async () => {
    const realSetTimeout = window.setTimeout
    vi.stubGlobal('setTimeout', (fn: (...a: unknown[]) => void, ms: number, ...args: unknown[]) => {
      if (ms >= 15000) { queueMicrotask(() => fn(...args)); return 0 }
      return realSetTimeout(fn, ms, ...args)
    })
    sessionStorage.setItem('ft_web_oauth_nonce', 'NONCE123')
    const hash = `#access_token=ACC&id_token=${idToken('OTRO')}&expires_in=3600`
    Object.defineProperty(window, 'location', { value: { hash, pathname: '/', href: 'http://x/', search: '', replaceState: () => {} }, configurable: true, writable: true })
    const auth = popupOAuth({ clientId: 'C', redirectUri: 'http://x/' })
    await expect(auth.getIdToken(false)).rejects.toThrow('No token')
    expect(localStorage.getItem('ft_web_id_token')).toBeNull()
  })
})
