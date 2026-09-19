import type { AuthProvider } from './types'

export function chromeIdentityAuth(_clientId: string): AuthProvider {
  const ext = chrome as unknown as {
    identity?: {
      getAuthToken: (opts: { interactive: boolean }, cb: (token: string) => void) => void
      getProfileUserInfo: ((cb: (info: { email?: string }) => void) => void) & ((opts: { email: boolean }, cb: (info: { email?: string }) => void) => void)
      clearAllCachedAuthTokens: (cb: () => void) => void
    }
  }
  const identity = ext.identity
  if (!identity) throw new Error('chrome.identity no disponible')

  return {
    getToken(interactive: boolean): Promise<string> {
      return new Promise((resolve, reject) => {
        identity!.getAuthToken({ interactive }, (token) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
          else resolve(token)
        })
      })
    },
    async getSignedInUser(): Promise<{ email: string } | null> {
      try {
        await this.getToken(false)
        // getProfileUserInfo da el email sin permiso extra en cuentas del perfil.
        const info = await new Promise<{ email?: string }>(resolve => {
          try { identity!.getProfileUserInfo({ email: true }, resolve) } catch { identity!.getProfileUserInfo(resolve) }
        })
        const email = typeof info?.email === 'string' && info.email ? info.email : 'user'
        return { email }
      } catch {
        return null
      }
    },
    signOut(): Promise<void> {
      return new Promise((resolve) => {
        identity!.clearAllCachedAuthTokens(() => resolve())
      })
    }
  }
}
