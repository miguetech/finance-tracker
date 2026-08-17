import { describe, expect, it } from 'vitest'
import { todayLocal, monthLocal } from '../src/lib/date'

describe('todayLocal', () => {
  it('respeta la fecha local en huso negativo (UTC-5)', () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz === 'America/Bogota') {
      const d = new Date('2026-08-16T05:00:00Z')
      expect(todayLocal(d)).toBe('2026-08-16')
      const d2 = new Date('2026-08-16T04:59:00Z')
      expect(todayLocal(d2)).toBe('2026-08-15')
    }
  })

  it('devuelve formato YYYY-MM-DD', () => {
    expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(monthLocal()).toMatch(/^\d{4}-\d{2}$/)
  })
})
