import { describe, expect, it } from 'vitest'
import { TABLES } from '../src/sheets/tables'

describe('TABLES.Factura_Items', () => {
  it('includes linea column at position 1 with type number', () => {
    const cols = TABLES.Factura_Items
    expect(cols[0].key).toBe('invoice_id')
    expect(cols[1].key).toBe('linea')
    expect(cols[1].type).toBe('number')
    expect(cols[1].header).toBe('linea')
  })
})