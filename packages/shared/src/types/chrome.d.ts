declare const chrome: {
  runtime: {
    lastError?: { message: string }
  }
  identity: {
    getAuthToken(options: { interactive: boolean }, callback: (token: string) => void): void
    clearAllCachedAuthTokens(callback: () => void): void
  }
  storage: {
    local: {
      get(key: string, callback: (items: Record<string, string>) => void): void
      set(items: Record<string, string>, callback?: () => void): void
      remove(key: string, callback?: () => void): void
    }
  }
}
