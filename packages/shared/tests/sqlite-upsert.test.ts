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
      id_factura: 'F-001',
      linea: 1,
      descripcion: 'Original',
      cantidad: 1,
      precio_unitario: 100,
      importe: 100,
      id_producto: ''
    }])

    // UPSERT same line (should update)
    await store.replaceTable('Factura_Items', [{
      id_factura: 'F-001',
      linea: 1,
      descripcion: 'Actualizado',
      cantidad: 2,
      precio_unitario: 150,
      importe: 300,
      id_producto: 'P-1'
    }])

    const rows = await store.getAllRows('Factura_Items')
    expect(rows).toHaveLength(1)
    expect(rows[0].descripcion).toBe('Actualizado')
    expect(rows[0].cantidad).toBe(2)
    expect(rows[0].importe).toBe(300)

    // Insert new line (should not affect line 1)
    await store.replaceTable('Factura_Items', [
      { id_factura: 'F-001', linea: 1, descripcion: 'Actualizado', cantidad: 2, precio_unitario: 150, importe: 300, id_producto: 'P-1' },
      { id_factura: 'F-001', linea: 2, descripcion: 'Nueva linea', cantidad: 1, precio_unitario: 50, importe: 50, id_producto: '' }
    ])

    const rows2 = await store.getAllRows('Factura_Items')
    expect(rows2).toHaveLength(2)
    const line1 = rows2.find(r => r.linea === 1)
    const line2 = rows2.find(r => r.linea === 2)
    expect(line1!.descripcion).toBe('Actualizado')
    expect(line2!.descripcion).toBe('Nueva linea')
  })

  it('composite PK constraint rejects duplicate (id_factura, linea)', async () => {
    await store.replaceTable('Factura_Items', [{
      id_factura: 'F-001', linea: 1, descripcion: 'A', cantidad: 1, precio_unitario: 100, importe: 100, id_producto: ''
    }])

    const db = store.getDb()
    expect(db).not.toBeNull()
    expect(() => {
      db!.exec(`INSERT INTO "Factura_Items" ("id_factura","linea","descripcion","cantidad","precio_unitario","importe","id_producto")
               VALUES ('F-001', 1, 'B', 1, 100, 100, '')`)
    }).toThrow(/UNIQUE constraint failed|PRIMARY KEY/)
  })
})