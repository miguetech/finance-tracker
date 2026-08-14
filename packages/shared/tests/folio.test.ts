import { describe, expect, it } from 'vitest'
import { expandFolioTemplate, invalidFolioTokens, FOLIO_TOKENS } from '../src/calc/folio'
import { ConfigSchema } from '../src/types/schemas'
import { configFromRows } from '../src/sheets/createSpreadsheet'

describe('folio template', () => {
  it('FOLIO_TOKENS expone los 4 tokens', () => {
    expect(FOLIO_TOKENS.map(t => t.token)).toEqual(['{YYYY}', '{YY}', '{MM}', '{DD}'])
  })
  it('expande sin tokens = template literal', () => {
    expect(expandFolioTemplate('FAC-', '2026-08-13')).toBe('FAC-')
  })
  it('expande año completo y corto', () => {
    expect(expandFolioTemplate('FAC-{YYYY}-', '2026-08-13')).toBe('FAC-2026-')
    expect(expandFolioTemplate('INV{YY}{MM}-', '2026-08-13')).toBe('INV2608-')
  })
  it('expande mes y día con pad 2', () => {
    expect(expandFolioTemplate('{YYYY}/{MM}/FAC-', '2026-08-05')).toBe('2026/08/FAC-')
    expect(expandFolioTemplate('{YYYY}-{MM}-{DD}-', '2026-08-13')).toBe('2026-08-13-')
  })
  it('fecha inválida devuelve template sin expandir', () => {
    expect(expandFolioTemplate('FAC-{YYYY}-', '')).toBe('FAC-{YYYY}-')
    expect(expandFolioTemplate('FAC-{YYYY}-', 'no-es-fecha')).toBe('FAC-{YYYY}-')
  })
  it('invalidFolioTokens detecta tokens no reconocidos', () => {
    expect(invalidFolioTokens('FAC-{HOLA}-')).toEqual(['{HOLA}'])
    expect(invalidFolioTokens('FAC-{YYYY}-{MM}-')).toEqual([])
    expect(invalidFolioTokens('FAC-{YY}-{BANANA}')).toEqual(['{BANANA}'])
  })
})

describe('config emisor', () => {
  it('ConfigSchema defaults de campos emisor vacíos', () => {
    const c = ConfigSchema.parse({ empresa_nombre: 'X', prefijo_folio: 'FAC-' })
    expect(c.empresa_cp).toBe('')
    expect(c.empresa_ciudad).toBe('')
    expect(c.empresa_pais).toBe('')
  })
  it('configFromRows lee CP, ciudad y país', () => {
    const c = configFromRows([['empresa_cp', '45010'], ['empresa_ciudad', 'Guadalajara'], ['empresa_pais', 'México']])
    expect(c.empresa_cp).toBe('45010')
    expect(c.empresa_ciudad).toBe('Guadalajara')
    expect(c.empresa_pais).toBe('México')
  })
})
