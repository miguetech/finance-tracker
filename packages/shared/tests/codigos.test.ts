import { describe, it, expect, vi, afterEach } from 'vitest'
import { prefijoDesdeNombre, generarCodigo, esCodigoValido, usosInfinitos, usosRestantes, expirado, vigente, CODIGO_ALFABETO, CODIGO_REGEX } from '../src/lib/codigos'
import type { CodigoAcceso } from '../src/types/entities'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const c = (over: Partial<CodigoAcceso> = {}): CodigoAcceso => ({
  codigo: 'ABC-2026-XXXX', rol: 'solo_lectura', modulos_ver: '', modulos_editar: '',
  expira_en: '', usos_max: '', usos: '', responsable: '', email: '', creado: '2026-01-01', activo: 'true', ...over
})

describe('prefijoDesdeNombre', () => {
  it('toma las primeras 3 letras mayúsculas', () => {
    expect(prefijoDesdeNombre('Mi Empresa S.A.')).toBe('MIE')
    expect(prefijoDesdeNombre('la tienda del pueblo')).toBe('LAT')
  })
  it('quita acentos', () => {
    expect(prefijoDesdeNombre('Ángeles y Más')).toBe('ANG')
    expect(prefijoDesdeNombre('Música')).toBe('MUS')
  })
  it('rellena con X si tiene menos de 3 letras', () => {
    expect(prefijoDesdeNombre('A')).toBe('AXX')
    expect(prefijoDesdeNombre('12 AB')).toBe('ABX')
  })
  it('devuelve FT si no hay letras', () => {
    expect(prefijoDesdeNombre('')).toBe('FT')
    expect(prefijoDesdeNombre('123 456')).toBe('FT')
  })
})

describe('generarCodigo', () => {
  it('formato PREFIJO-AAAA-SSSS y charset sin ambigüedad', () => {
    const code = generarCodigo('MIE', 2026, [])
    expect(code).toMatch(/^MIE-2026-[A-Z0-9]{4}$/)
    expect(CODIGO_REGEX.test(code)).toBe(true)
    expect(code.slice(-4)).not.toMatch(/[IO01]/)
    for (const ch of code.slice(-4)) expect(CODIGO_ALFABETO).toContain(ch)
  })
  it('genera códigos únicos (sin colisiones entre sí ni contra existentes)', () => {
    const existentes = ['MIE-2026-AAAA', 'MIE-2026-BBBB']
    const codes = new Set<string>(existentes)
    for (let i = 0; i < 100; i++) {
      const code = generarCodigo('MIE', 2026, [...codes])
      expect(codes.has(code)).toBe(false)
      codes.add(code)
    }
    expect(codes.size).toBe(102)
  })
  it('lanza error tras 20 intentos fallidos', () => {
    const spy = vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(arr => { arr[0] = 0; return arr })
    expect(() => generarCodigo('PREF', 2026, ['PREF-2026-AAAA'])).toThrow('No se pudo generar un código único')
    expect(spy).toHaveBeenCalledTimes(80) // 4 chars de sufijo × 20 intentos
  })
})

describe('esCodigoValido', () => {
  it('acepta formatos válidos', () => {
    expect(esCodigoValido('ANA-2026-XK3Q')).toBe(true)
    expect(esCodigoValido('FTX-2026-2B7D')).toBe(true)
  })
  it('rechaza formatos inválidos', () => {
    expect(esCodigoValido('ANA-2026')).toBe(false)
    expect(esCodigoValido('ana-2026-XK3Q')).toBe(false)
    expect(esCodigoValido('ANA-26-XK3Q')).toBe(false)
    expect(esCodigoValido('ANA-2026-XK3')).toBe(false)
    expect(esCodigoValido('ANA-2026-XK3Q5')).toBe(false)
  })
})

describe('usos', () => {
  it('usosInfinitos con usos_max vacío', () => {
    expect(usosInfinitos(c({ usos_max: '' }))).toBe(true)
    expect(usosInfinitos(c({ usos_max: '5' }))).toBe(false)
  })
  it('usosRestantes devuelve Infinity con usos vacío y número si no', () => {
    expect(usosRestantes(c({ usos: '' }))).toBe(Infinity)
    expect(usosRestantes(c({ usos: '3' }))).toBe(3)
  })
})

describe('expirado / vigente', () => {
  it('expirado con expira_en vacío nunca expira', () => {
    expect(expirado(c({ expira_en: '' }), '2026-08-17')).toBe(false)
  })
  it('expirado compara contra hoy', () => {
    expect(expirado(c({ expira_en: '2026-08-16' }), '2026-08-17')).toBe(true)
    expect(expirado(c({ expira_en: '2026-08-17' }), '2026-08-17')).toBe(false)
    expect(expirado(c({ expira_en: '2026-08-18' }), '2026-08-17')).toBe(false)
  })
  it('vigente requiere activo y no expirado', () => {
    expect(vigente(c({ activo: 'true', expira_en: '' }), '2026-08-17')).toBe(true)
    expect(vigente(c({ activo: 'false', expira_en: '' }), '2026-08-17')).toBe(false)
    expect(vigente(c({ activo: 'true', expira_en: '2026-08-10' }), '2026-08-17')).toBe(false)
  })
})