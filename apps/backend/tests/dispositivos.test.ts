import { describe, expect, it } from 'vitest'
import { generarTokenDispositivo, nuevoDispositivo } from '../src/auth/dispositivos'

describe('generarTokenDispositivo', () => {
  it('formato dev_ + 16 chars del alfabeto seguro', () => {
    const t = generarTokenDispositivo()
    expect(t).toMatch(/^dev_[A-Z0-9]{16}$/)
  })
  it('único entre llamadas', () => {
    const set = new Set(Array.from({ length: 50 }, () => generarTokenDispositivo()))
    expect(set.size).toBe(50)
  })
})

describe('nuevoDispositivo', () => {
  it('asigna codigo, ip_info y registered_at (YYYY-MM-DD)', () => {
    const d = nuevoDispositivo('ANA-2026-ABCD', '190.10.20.30')
    expect(d.codigo).toBe('ANA-2026-ABCD')
    expect(d.ip_info).toBe('190.10.20.30')
    expect(d.registered_at).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(d.dispositivo).toMatch(/^dev_/)
  })
  it('usa el dispositivo provisto si se pasa', () => {
    const d = nuevoDispositivo('ANA-2026-ABCD', 'ip', 'dev_yaexistente')
    expect(d.dispositivo).toBe('dev_yaexistente')
  })
})