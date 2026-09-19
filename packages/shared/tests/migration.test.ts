import { test, expect } from 'vitest'
import { crearSqliteStore } from '../src/sync/stores/sqlite'
import { migrarFacturaItemsLinea } from '../src/sync/migrate-factura-items-linea'

test('migration adds linea column numbered per factura', async () => {
  const store = crearSqliteStore(':memory:')
  // Create new schema with linea column (DDL from ddlDesdeTables creates it)
  await store.init([
    `CREATE TABLE "Factura_Items" ("invoice_id" TEXT, "linea" INTEGER, "descripcion" TEXT, "cantidad" REAL, "unit_price" REAL, "importe" REAL, "product_id" TEXT, PRIMARY KEY ("invoice_id", "linea"))`
  ])
  
  // Insert old data with unique linea values (negative = unmigrated)
  // This avoids PK conflicts while simulating unmigrated rows
  await store.replaceTable('Factura_Items', [
    { invoice_id: 'F-001', linea: -1, descripcion: 'A', cantidad: 1, unit_price: 100, importe: 100, product_id: '' },
    { invoice_id: 'F-001', linea: -2, descripcion: 'B', cantidad: 2, unit_price: 50, importe: 100, product_id: '' },
    { invoice_id: 'F-002', linea: -1, descripcion: 'C', cantidad: 1, unit_price: 200, importe: 200, product_id: '' }
  ])
  
  await migrarFacturaItemsLinea(store)
  
  const rows = await store.getAllRows('Factura_Items')
  expect(rows).toHaveLength(3)
  const f001 = rows.filter(r => r.invoice_id === 'F-001').sort((a,b) => a.linea - b.linea)
  expect(f001[0].linea).toBe(1)
  expect(f001[1].linea).toBe(2)
  expect(f001[0].descripcion).toBe('A') // ordered by rowid (insertion order)
  expect(f001[1].descripcion).toBe('B')
  const f002 = rows.find(r => r.invoice_id === 'F-002')
  expect(f002!.linea).toBe(1)
  expect(f002!.descripcion).toBe('C')
  
  await store.close()
})

test('migration is idempotent - skips if linea already populated', async () => {
  const store = crearSqliteStore(':memory:')
  await store.init([
    `CREATE TABLE "Factura_Items" ("invoice_id" TEXT, "linea" INTEGER, "descripcion" TEXT, "cantidad" REAL, "unit_price" REAL, "importe" REAL, "product_id" TEXT, PRIMARY KEY ("invoice_id", "linea"))`
  ])
  
  await store.replaceTable('Factura_Items', [
    { invoice_id: 'F-001', linea: 1, descripcion: 'A', cantidad: 1, unit_price: 100, importe: 100, product_id: '' },
    { invoice_id: 'F-001', linea: 2, descripcion: 'B', cantidad: 2, unit_price: 50, importe: 100, product_id: '' }
  ])
  
  await migrarFacturaItemsLinea(store)
  
  const rows = await store.getAllRows('Factura_Items')
  expect(rows).toHaveLength(2)
  expect(rows[0].linea).toBe(1)
  expect(rows[1].linea).toBe(2)
  
  await store.close()
})

test('migration handles empty table', async () => {
  const store = crearSqliteStore(':memory:')
  await store.init([
    `CREATE TABLE "Factura_Items" ("invoice_id" TEXT, "linea" INTEGER, "descripcion" TEXT, "cantidad" REAL, "unit_price" REAL, "importe" REAL, "product_id" TEXT, PRIMARY KEY ("invoice_id", "linea"))`
  ])
  
  await migrarFacturaItemsLinea(store)
  
  const rows = await store.getAllRows('Factura_Items')
  expect(rows).toHaveLength(0)
  
  await store.close()
})

test('migration orders by rowid within each factura', async () => {
  const store = crearSqliteStore(':memory:')
  await store.init([
    `CREATE TABLE "Factura_Items" ("invoice_id" TEXT, "linea" INTEGER, "descripcion" TEXT, "cantidad" REAL, "unit_price" REAL, "importe" REAL, "product_id" TEXT, PRIMARY KEY ("invoice_id", "linea"))`
  ])
  
  // Insert in specific order to test rowid ordering (rowid follows insertion order)
  await store.replaceTable('Factura_Items', [
    { invoice_id: 'F-001', linea: -1, descripcion: 'FIRST', cantidad: 1, unit_price: 100, importe: 100, product_id: '' },
    { invoice_id: 'F-001', linea: -2, descripcion: 'SECOND', cantidad: 1, unit_price: 100, importe: 100, product_id: '' },
    { invoice_id: 'F-001', linea: -3, descripcion: 'THIRD', cantidad: 1, unit_price: 100, importe: 100, product_id: '' },
  ])
  
  await migrarFacturaItemsLinea(store)
  
  const rows = await store.getAllRows('Factura_Items')
  const f001 = rows.filter(r => r.invoice_id === 'F-001').sort((a,b) => a.linea - b.linea)
  expect(f001).toHaveLength(3)
  expect(f001[0].descripcion).toBe('FIRST')
  expect(f001[1].descripcion).toBe('SECOND')
  expect(f001[2].descripcion).toBe('THIRD')
  expect(f001[0].linea).toBe(1)
  expect(f001[1].linea).toBe(2)
  expect(f001[2].linea).toBe(3)
  
  await store.close()
})