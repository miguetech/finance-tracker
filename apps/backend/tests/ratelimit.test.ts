import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createRateLimiter } from '../src/ratelimit'

describe('createRateLimiter', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('backoff exponencial para counts 1-4 (1,2,4,8s)', () => {
    const rl = createRateLimiter()
    expect(rl.recordFailure('k').retryAfterSec).toBe(1)
    expect(rl.recordFailure('k').retryAfterSec).toBe(2)
    expect(rl.recordFailure('k').retryAfterSec).toBe(4)
    expect(rl.recordFailure('k').retryAfterSec).toBe(8)
  })

  it('nivel 5-9 → 30s', () => {
    const rl = createRateLimiter()
    for (let i = 0; i < 5; i++) rl.recordFailure('k')
    expect(rl.recordFailure('k').retryAfterSec).toBe(30)
  })

  it('nivel 10-19 → 900s (15 min)', () => {
    const rl = createRateLimiter()
    for (let i = 0; i < 10; i++) rl.recordFailure('k')
    expect(rl.recordFailure('k').retryAfterSec).toBe(900)
  })

  it('nivel 20+ → 3600s (1 hora)', () => {
    const rl = createRateLimiter()
    for (let i = 0; i < 20; i++) rl.recordFailure('k')
    expect(rl.recordFailure('k').retryAfterSec).toBe(3600)
  })

  it('check bloquea mientras blockedUntil vigente y permite tras expirar', () => {
    const rl = createRateLimiter()
    rl.recordFailure('k') // blockedUntil = now + 1s
    expect(rl.check('k').allowed).toBe(false)
    expect(rl.check('k').retryAfterSec).toBeGreaterThan(0)
    vi.advanceTimersByTime(2000)
    expect(rl.check('k').allowed).toBe(true)
  })

  it('reset limpia el contador', () => {
    const rl = createRateLimiter()
    for (let i = 0; i < 5; i++) rl.recordFailure('k')
    rl.reset('k')
    expect(rl.check('k').allowed).toBe(true)
    expect(rl.recordFailure('k').retryAfterSec).toBe(1)
  })

  it('claves independientes', () => {
    const rl = createRateLimiter()
    rl.recordFailure('a')
    expect(rl.check('b').allowed).toBe(true)
  })
})