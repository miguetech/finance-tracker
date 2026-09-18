import { describe, expect, it } from 'vitest'
import { ddlDesdeTables } from '../src/sync/ddl'
import { TABLES } from '../src/sheets/tables'

describe('DDL del espejo', () => {
  it('genera una definición por cada tabla de TABLES', () => {
    expect(ddlDesdeTables().length).toBe(Object.keys(TABLES).length)
  })

  it('mapea tipos: S→TEXT, N→REAL', () => {
    const facturas = ddlDesdeTables().find(d => d.tabla === 'Facturas')!
    expect(facturas.create).toContain('"moneda" TEXT')
    expect(facturas.create).toContain('"total" REAL')
    expect(facturas.create).toContain('"fecha_emision" TEXT')
  })

  it('primera columna es PRIMARY KEY (salvo tablas hijas)', () => {
    const clientes = ddlDesdeTables().find(t => t.tabla === 'Clientes')!
    expect(clientes.create).toMatch(/"id_cliente" TEXT PRIMARY KEY/)
  })

  it('crea índices sobre claves foráneas lógicas', () => {
    const defs = ddlDesdeTables()
    const items = defs.find(d => d.tabla === 'Factura_Items')!
    expect(items.indexes.some(i => i.includes('idx_Factura_Items_id_factura'))).toBe(true)
    const pagos = defs.find(d => d.tabla === 'Pagos')!
    expect(pagos.indexes.some(i => i.includes('idx_Pagos_id_origen'))).toBe(true)
  })
})

describe('DDL de tablas hijas (N filas por clave padre)', () => {
  it('Factura_Items tiene composite PK (id_factura, linea)', () => {
    const items = ddlDesdeTables().find(t => t.tabla === 'Factura_Items')!
    expect(items.create).toContain('PRIMARY KEY ("id_factura", "linea")')
    expect(items.create).not.toContain('"id_factura" TEXT PRIMARY KEY')
    expect(items.indexes.some(i => i.includes('idx_Factura_Items_id_factura'))).toBe(true)
  })
})
