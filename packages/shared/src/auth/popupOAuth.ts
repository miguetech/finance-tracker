import type { AuthProvider } from './types'

export function popupOAuth(options: { clientId: string; redirectUri: string; prompt?: 'consent' | 'none' }): AuthProvider {
  const { clientId, redirectUri, prompt: defaultPrompt = 'consent' } = options
  const SCOPE = encodeURIComponent('https://www.googleapis.com/auth/drive.file')
  const TOKEN_KEY = 'ft_web_access_token'
  const EXPIRES_KEY = 'ft_web_token_expires_at'

  function authUrl(prompt: 'consent' | 'none'): string {
    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${SCOPE}&prompt=${prompt}`
  }

  function persistToken(token: string, expiresIn: number): void {
    try {
      window.localStorage.setItem(TOKEN_KEY, token)
      window.localStorage.setItem(EXPIRES_KEY, String(Date.now() + expiresIn * 1000 - 60000))
    } catch { /* storage no disponible */ }
  }

  function storedToken(): string | null {
    try {
      const t = window.localStorage.getItem(TOKEN_KEY)
      const exp = Number(window.localStorage.getItem(EXPIRES_KEY) ?? 0)
      if (t && exp > Date.now()) return t
    } catch { /* storage no disponible */ }
    return null
  }

  function silentRefresh(): Promise<string | null> {
    return new Promise(resolve => {
      const iframe = document.createElement('iframe')
      iframe.style.display = 'none'
      iframe.src = authUrl('none')
      const cleanup = () => { iframe.remove() }
      const timer = window.setTimeout(() => { cleanup(); resolve(null) }, 15000)
      iframe.onload = () => {
        try {
          const hash = iframe.contentWindow?.location.hash ?? ''
          const params = new URLSearchParams(hash.replace(/^#/, ''))
          const token = params.get('access_token')
          if (token) {
            persistToken(token, Number(params.get('expires_in') ?? '3600'))
            cleanup(); clearTimeout(timer)
            resolve(token)
            return
          }
        } catch { /* cross-origin o página sin hash */ }
        cleanup(); clearTimeout(timer)
        resolve(null)
      }
      document.body.appendChild(iframe)
    })
  }

  return {
    async getToken(interactive: boolean): Promise<string> {
      if (window.self !== window.top) throw new Error('Nested OAuth')
      const hash = new URLSearchParams(window.location.hash.slice(1))
      const at = hash.get('access_token')
      if (at) {
        persistToken(at, Number(hash.get('expires_in') ?? '3600'))
        window.history.replaceState({}, document.title, window.location.pathname)
        return at
      }
      const cached = storedToken()
      if (cached) return cached
      const refreshed = await silentRefresh()
      if (refreshed) return refreshed
      if (!interactive) throw new Error('No token')
      window.location.href = authUrl(defaultPrompt)
      throw new Error('Redirecting a OAuth…')
    },
    async getSignedInUser(): Promise<{ email: string } | null> {
      return storedToken() ? { email: 'user' } : null
    },
    async signOut(): Promise<void> {
      try {
        window.localStorage.removeItem(TOKEN_KEY)
        window.localStorage.removeItem(EXPIRES_KEY)
      } catch { /* storage no disponible */ }
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }
}
