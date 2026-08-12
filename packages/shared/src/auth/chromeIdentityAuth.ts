import type { AuthProvider } from './types'

export function chromeIdentityAuth(clientId: string): AuthProvider {
  const ext = chrome as unknown as {
    identity?: {
      getAuthToken: (opts: { interactive: boolean }, cb: (token: string) => void) => void
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
        return { email: 'user' }
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
