import { describe, expect, it } from 'vitest'
import { getDocLabel, TIPO_DOC_OPTIONS } from '../src/taxid'
import { ConfigSchema } from '../src/types/schemas'
import { configFromRows } from '../src/sheets/createSpreadsheet'

describe('taxid', () => {
  it('TIPO_DOC_OPTIONS expone los 4 tipos', () => {
    expect(TIPO_DOC_OPTIONS.map(o => o.value)).toEqual(['RFC', 'NIF', 'Cedula', 'Otro'])
    expect(TIPO_DOC_OPTIONS.find(o => o.value === 'Cedula')?.label).toBe('Cédula')
  })
  it('getDocLabel devuelve el label del tipo fijo', () => {
    expect(getDocLabel('RFC', '')).toBe('RFC')
    expect(getDocLabel('NIF', '')).toBe('NIF')
    expect(getDocLabel('Cedula', '')).toBe('Cédula')
  })
  it('Otro usa la etiqueta personalizada', () => {
    expect(getDocLabel('Otro', 'RUT')).toBe('RUT')
    expect(getDocLabel('Otro', '  DNI  ')).toBe('DNI')
  })
  it('Otro sin etiqueta cae a Documento fiscal', () => {
    expect(getDocLabel('Otro', '')).toBe('Documento fiscal')
    expect(getDocLabel('Otro', '   ')).toBe('Documento fiscal')
  })
})

describe('config tipo_doc', () => {
  it('ConfigSchema default tipo_doc RFC', () => {
    const c = ConfigSchema.parse({ empresa_nombre: 'X', prefijo_folio: 'FAC-' })
    expect(c.tipo_doc).toBe('RFC')
    expect(c.tipo_doc_etiqueta).toBe('')
  })
  it('configFromRows lee tipo_doc de la hoja', () => {
    const c = configFromRows([['tipo_doc', 'NIF'], ['tipo_doc_etiqueta', '']])
    expect(c.tipo_doc).toBe('NIF')
  })
  it('configFromRows sin claves cae a default RFC', () => {
    const c = configFromRows([['empresa_nombre', 'A']])
    expect(c.tipo_doc).toBe('RFC')
    expect(c.tipo_doc_etiqueta).toBe('')
  })
})
