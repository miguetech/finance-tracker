const KEY = 'ft_share_params'
const SESSION_KEY = 'ft_code_session'
const DEVICE_KEY = 'ft_device_token'

export function saveSessionToken(token: string): void {
  localStorage.setItem(SESSION_KEY, token)
}

export function loadSessionToken(): string | null {
  return localStorage.getItem(SESSION_KEY)
}

export function clearSessionToken(): void {
  localStorage.removeItem(SESSION_KEY)
}

export function saveDeviceToken(dev: string): void {
  localStorage.setItem(DEVICE_KEY, dev)
}

export function loadDeviceToken(): string | null {
  return localStorage.getItem(DEVICE_KEY)
}

export function saveShareParams(apiUrl: string): void {
  sessionStorage.setItem(KEY, JSON.stringify({ apiUrl }))
}

export function loadShareParams(): { apiUrl: string } | null {
  const q = new URLSearchParams(window.location.search)
  const api = q.get('api')
  if (q.get('vista') === '1' && api) {
    let valid = false
    try {
      const url = new URL(api)
      valid = url.protocol === 'https:' && url.hostname === 'script.google.com'
    } catch { valid = false }
    if (valid) {
      const p = { apiUrl: api }
      sessionStorage.setItem(KEY, JSON.stringify(p))
      window.history.replaceState({}, document.title, window.location.pathname)
      return p
    }
    return null
  }
  const raw = sessionStorage.getItem(KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as { apiUrl: string } } catch { return null }
}

export function clearShareParams(): void {
  sessionStorage.removeItem(KEY)
}
