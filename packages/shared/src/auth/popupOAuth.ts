import type { AuthProvider } from './types'

interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

export function popupOAuth(options: { clientId: string; redirectUri: string }): AuthProvider {
  const { clientId, redirectUri } = options
  const SCOPE = encodeURIComponent('https://www.googleapis.com/auth/spreadsheets')

  function extractAccessToken(): string | null {
    const hash = new URLSearchParams(window.location.hash.slice(1))
    return hash.get('access_token')
  }

  return {
    async getToken(interactive: boolean): Promise<string> {
      const existing = extractAccessToken()
      if (existing) return existing
      if (!interactive) throw new Error('No token')
      const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${SCOPE}&prompt=consent`
      window.location.href = url
      throw new Error('Redirecting a OAuth…')
    },
    async getSignedInUser(): Promise<{ email: string } | null> {
      return extractAccessToken() ? { email: 'user' } : null
    },
    async signOut(): Promise<void> {
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }
}
