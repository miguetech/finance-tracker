import type { AuthProvider } from './types'

export function popupOAuth(options: { clientId: string; redirectUri: string; prompt?: 'consent' | 'none' }): AuthProvider & { getIdToken: (interactive: boolean) => Promise<string> } {
  const { clientId, redirectUri, prompt: defaultPrompt = 'consent' } = options
  const SCOPE = encodeURIComponent(['openid', 'email', 'https://www.googleapis.com/auth/drive.file'].join(' '))
  const TOKEN_KEY = 'ft_web_access_token'
  const ID_TOKEN_KEY = 'ft_web_id_token'
  const EXPIRES_KEY = 'ft_web_token_expires_at'

  function authUrl(prompt: 'consent' | 'none'): string {
    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=id_token%20token&scope=${SCOPE}&prompt=${prompt}`
  }

  function persistFromHash(hash: string): { access: string | null; idToken: string | null } {
    try {
      const params = new URLSearchParams(hash.replace(/^#/, ''))
      const access = params.get('access_token')
      const idToken = params.get('id_token')
      const expiresIn = Number(params.get('expires_in') ?? '3600')
      const exp = String(Date.now() + expiresIn * 1000 - 60000)
      if (access) window.localStorage.setItem(TOKEN_KEY, access)
      if (idToken) window.localStorage.setItem(ID_TOKEN_KEY, idToken)
      window.localStorage.setItem(EXPIRES_KEY, exp)
      return { access, idToken }
    } catch { return { access: null, idToken: null } }
  }

  function storedIdToken(): string | null {
    try {
      const t = window.localStorage.getItem(ID_TOKEN_KEY)
      const exp = Number(window.localStorage.getItem(EXPIRES_KEY) ?? 0)
      if (t && exp > Date.now()) return t
    } catch { /* storage no disponible */ }
    return null
  }

  function silentRefresh(): Promise<{ access: string | null; idToken: string | null }> {
    return new Promise(resolve => {
      const iframe = document.createElement('iframe')
      iframe.style.display = 'none'
      iframe.src = authUrl('none')
      const cleanup = () => { iframe.remove() }
      const timer = window.setTimeout(() => { cleanup(); resolve({ access: null, idToken: null }) }, 15000)
      iframe.onload = () => {
        try {
          const hash = iframe.contentWindow?.location.hash ?? ''
          const got = persistFromHash(hash)
          if (got.access || got.idToken) { cleanup(); clearTimeout(timer); resolve(got); return }
        } catch { /* cross-origin o página sin hash */ }
        cleanup(); clearTimeout(timer)
        resolve({ access: null, idToken: null })
      }
      document.body.appendChild(iframe)
    })
  }

  function fullRedirect(): never {
    window.location.href = authUrl(defaultPrompt)
    throw new Error('Redirecting a OAuth…')
  }

  return {
    async getToken(interactive: boolean): Promise<string> {
      if (window.self !== window.top) throw new Error('Nested OAuth')
      const hash = window.location.hash
      const got = persistFromHash(hash)
      if (got.access) {
        window.history.replaceState({}, document.title, window.location.pathname)
        return got.access
      }
      const cached = (() => { try { return window.localStorage.getItem(TOKEN_KEY) } catch { return null } })()
      if (cached) return cached
      const refreshed = await silentRefresh()
      if (refreshed.access) return refreshed.access
      if (!interactive) throw new Error('No token')
      return fullRedirect()
    },
    async getIdToken(interactive: boolean): Promise<string> {
      if (window.self !== window.top) throw new Error('Nested OAuth')
      const hash = window.location.hash
      const got = persistFromHash(hash)
      if (got.idToken) {
        window.history.replaceState({}, document.title, window.location.pathname)
        return got.idToken
      }
      const cached = storedIdToken()
      if (cached) return cached
      const refreshed = await silentRefresh()
      if (refreshed.idToken) return refreshed.idToken
      if (!interactive) throw new Error('No token')
      return fullRedirect()
    },
    async getSignedInUser(): Promise<{ email: string } | null> {
      return storedIdToken() ? { email: 'user' } : null
    },
    async signOut(): Promise<void> {
      try {
        window.localStorage.removeItem(TOKEN_KEY)
        window.localStorage.removeItem(ID_TOKEN_KEY)
        window.localStorage.removeItem(EXPIRES_KEY)
      } catch { /* storage no disponible */ }
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }
}
