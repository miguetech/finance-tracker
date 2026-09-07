import { test, expect } from 'vitest'
import { ddlDesdeTables } from '../src/sync/ddl'
import { TABLES } from '../src/sheets/tables'

test('Factura_Items DDL has composite PK and not in SIN_PK', () => {
  const result = ddlDesdeTables()
  const facturaItems = result.find(t => t.tabla === 'Factura_Items')
  
  expect(facturaItems).toBeDefined()
  expect(facturaItems!.create).toContain('PRIMARY KEY ("id_factura", "linea")')
  expect(facturaItems!.create).not.toContain('"id_factura" TEXT PRIMARY KEY')
})