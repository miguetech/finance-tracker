const KEY = 'ft_share_params'

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
