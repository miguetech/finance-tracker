export interface RateLimitStore {
  get(key: string): { count: number; blockedUntil: number } | undefined
  set(key: string, v: { count: number; blockedUntil: number }): void
}

export interface RateLimiter {
  check(key: string): { allowed: boolean; retryAfterSec: number }
  recordFailure(key: string): { retryAfterSec: number }
  reset(key: string): void
}

export function createRateLimiter(store: RateLimitStore = new Map()): RateLimiter {
  function retryForCount(count: number): number {
    if (count <= 4) return Math.min(Math.pow(2, count - 1), 30)
    if (count <= 9) return 30
    if (count <= 19) return 900
    return 3600
  }

  return {
    check(key) {
      const cur = store.get(key)
      if (cur && cur.blockedUntil > Date.now()) {
        return { allowed: false, retryAfterSec: Math.ceil((cur.blockedUntil - Date.now()) / 1000) }
      }
      return { allowed: true, retryAfterSec: 0 }
    },
    recordFailure(key) {
      const cur = store.get(key) ?? { count: 0, blockedUntil: 0 }
      const count = cur.count + 1
      const retryAfterSec = retryForCount(count)
      store.set(key, { count, blockedUntil: Date.now() + retryAfterSec * 1000 })
      return { retryAfterSec }
    },
    reset(key) {
      store.set(key, { count: 0, blockedUntil: 0 })
    }
  }
}