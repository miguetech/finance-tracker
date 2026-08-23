import { describe, expect, it } from 'vitest'
import { hashTabla } from '../src/sync/hash'

describe('hashTabla', () => {
  it('determinista para las mismas filas', () => {
    const filas = [{ id: 'a', total: 1 }, { id: 'b', total: 2 }]
    expect(hashTabla(filas)).toBe(hashTabla([{ id: 'a', total: 1 }, { id: 'b', total: 2 }]))
  })

  it('cambia si cambia una fila o el orden', () => {
    const base = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }]
    expect(hashTabla(base)).not.toBe(hashTabla([{ id: 'a', v: 1 }, { id: 'b', v: 3 }]))
    expect(hashTabla(base)).not.toBe(hashTabla([...base].reverse()))
  })

  it('vacío es un valor fijo distinto de cadena vacía', () => {
    expect(hashTabla([])).toBe(hashTabla([]))
    expect(hashTabla([])).not.toBe('')
  })
})
