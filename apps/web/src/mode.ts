const KEY = 'ft_share_params'

export function saveShareParams(apiUrl: string): void {
  sessionStorage.setItem(KEY, JSON.stringify({ apiUrl }))
}

export function loadShareParams(): { apiUrl: string } | null {
  const q = new URLSearchParams(window.location.search)
  if (q.get('vista') === '1' && q.get('api')) {
    const p = { apiUrl: String(q.get('api')) }
    sessionStorage.setItem(KEY, JSON.stringify(p))
    window.history.replaceState({}, document.title, window.location.pathname)
    return p
  }
  const raw = sessionStorage.getItem(KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as { apiUrl: string } } catch { return null }
}

export function clearShareParams(): void {
  sessionStorage.removeItem(KEY)
}
