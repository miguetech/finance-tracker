// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { crearSqliteStore } from '../src/sync/stores/sqlite'
import { ddlDesdeTables } from '../src/sync/ddl'
import { suiteContratoStore } from './sync-store-contract'

let moduloDisponible = true
try {
  const { crearSqliteStore: _x } = await import('../src/sync/stores/sqlite')
  void _x
} catch {
  moduloDisponible = false
}

describe.skipIf(!moduloDisponible)('store sqlite-wasm', () => {
  suiteContratoStore('sqlite (node: memoria, sin OPFS)', () => crearSqliteStore())

  it('reporta vfs memory en Node y opfs/memoria en navegador', async () => {
    const s = crearSqliteStore()
    expect(['memory', 'opfs']).toContain(s.vfs())
    await s.init(ddlDesdeTables().flatMap(d => [d.create, ...d.indexes])).catch(() => {})
    await s.close()
  })

  it('sobrevive a filas con tipos mixtos y valores vacíos', async () => {
    const s = crearSqliteStore()
    await s.init(ddlDesdeTables().flatMap(d => [d.create, ...d.indexes]))
    await s.replaceTable('Facturas', [
      { invoice_id: 'f1', total: 100.5, moneda: 'VES', saldo: '' },
      { invoice_id: 'f2', total: 0, notas: 'texto con "comillas" y ,coma' }
    ])
    const filas = await s.getAllRows('Facturas')
    expect(filas).toHaveLength(2)
    const f1 = filas.find(f => f.invoice_id === 'f1')
    expect(Number(f1?.total)).toBe(100.5)
    expect(f1?.moneda).toBe('VES')
    await s.close()
  })
})
