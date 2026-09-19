// @vitest-environment node
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { crearSqliteStore } from '../src/sync/stores/sqlite'
import { ddlDesdeTables } from '../src/sync/ddl'

let moduloDisponible = true
try {
  const { crearSqliteStore: _x } = await import('../src/sync/stores/sqlite')
  void _x
} catch {
  moduloDisponible = false
}

describe.skipIf(!moduloDisponible)('Factura_Items UPSERT', () => {
  let store: ReturnType<typeof crearSqliteStore>

  beforeEach(async () => {
    store = crearSqliteStore(':memory:')
    const ddl = ddlDesdeTables().flatMap(d => [d.create, ...d.indexes])
    await store.init(ddl)
  })

  afterEach(async () => {
    await store.close()
  })

  it('Factura_Items UPSERT updates existing line and inserts new', async () => {
    // Insert initial line
    await store.replaceTable('Factura_Items', [{
      invoice_id: 'F-001',
      linea: 1,
      descripcion: 'Original',
      cantidad: 1,
      unit_price: 100,
      importe: 100,
      product_id: ''
    }])

    // UPSERT same line (should update)
    await store.replaceTable('Factura_Items', [{
      invoice_id: 'F-001',
      linea: 1,
      descripcion: 'Actualizado',
      cantidad: 2,
      unit_price: 150,
      importe: 300,
      product_id: 'P-1'
    }])

    const rows = await store.getAllRows('Factura_Items')
    expect(rows).toHaveLength(1)
    expect(rows[0].descripcion).toBe('Actualizado')
    expect(rows[0].cantidad).toBe(2)
    expect(rows[0].importe).toBe(300)

    // Insert new line (should not affect line 1)
    await store.replaceTable('Factura_Items', [
      { invoice_id: 'F-001', linea: 1, descripcion: 'Actualizado', cantidad: 2, unit_price: 150, importe: 300, product_id: 'P-1' },
      { invoice_id: 'F-001', linea: 2, descripcion: 'Nueva linea', cantidad: 1, unit_price: 50, importe: 50, product_id: '' }
    ])

    const rows2 = await store.getAllRows('Factura_Items')
    expect(rows2).toHaveLength(2)
    const line1 = rows2.find(r => r.linea === 1)
    const line2 = rows2.find(r => r.linea === 2)
    expect(line1!.descripcion).toBe('Actualizado')
    expect(line2!.descripcion).toBe('Nueva linea')
  })

  it('composite PK constraint rejects duplicate (invoice_id, linea)', async () => {
    await store.replaceTable('Factura_Items', [{
      invoice_id: 'F-001', linea: 1, descripcion: 'A', cantidad: 1, unit_price: 100, importe: 100, product_id: ''
    }])

    const db = store.getDb() as { exec(sql: string): void } | null
    expect(db).not.toBeNull()
    expect(() => {
      db!.exec(`INSERT INTO "Factura_Items" ("invoice_id","linea","descripcion","cantidad","unit_price","importe","product_id")
               VALUES ('F-001', 1, 'B', 1, 100, 100, '')`)
    }).toThrow(/UNIQUE constraint failed|PRIMARY KEY/)
  })
})