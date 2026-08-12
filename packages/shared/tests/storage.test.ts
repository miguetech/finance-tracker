import { describe, expect, it, beforeEach } from 'vitest'
import { localStorageAdapter } from '../src/data/storage'

describe('localStorageAdapter', () => {
  beforeEach(() => window.localStorage.clear())
  it('set/get/remove round-trip', async () => {
    const s = localStorageAdapter
    await s.set('k', 'v')
    expect(await s.get('k')).toBe('v')
    await s.remove('k')
    expect(await s.get('k')).toBe(null)
  })
})
