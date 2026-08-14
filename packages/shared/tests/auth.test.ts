import { describe, it, expect, vi, afterEach } from 'vitest'
import { popupOAuth } from '../src/auth/popupOAuth'

describe('popupOAuth id_token', () => {
  afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })
  it('persiste id_token desde el hash y lo devuelve', async () => {
    const hash = '#access_token=ACC&id_token=IDT&expires_in=3600'
    Object.defineProperty(window, 'location', { value: { hash, pathname: '/', href: 'http://x/', search: '', replaceState: () => {} }, configurable: true, writable: true })
    const auth = popupOAuth({ clientId: 'C', redirectUri: 'http://x/' })
    const t = await auth.getIdToken(false)
    expect(t).toBe('IDT')
    expect(localStorage.getItem('ft_web_id_token')).toBe('IDT')
  })
})
