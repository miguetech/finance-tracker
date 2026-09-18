import { describe, expect, it, vi } from 'vitest'
import { crearEspejo, TABLAS_CALIENTES, type EspejoStore } from '../src/sync/espejo'
import type { TableName } from '../src/sheets/tables'

function storeMemoria(): EspejoStore & { datos: Map<string, unknown[]> } {
  const datos = new Map<string, unknown[]>()
  return {
    datos,
    init: vi.fn(async () => {}),
    getAllRows: async (t) => (datos.get(t) ?? []) as never,
    getAllRowsWithRowid: async (t) => ((datos.get(t) ?? []) as never).map((r, i) => ({ ...r, rowid: i + 1 })),
    replaceTable: vi.fn(async (t, filas) => { datos.set(t, filas) }),
    clearTable: vi.fn(async (t) => { datos.set(t, []) }),
    close: vi.fn(async () => {})
  }
}

describe('pipeline del espejo', () => {
  it('TABLAS_CALIENTES contiene las 6 esperadas', () => {
    expect([...TABLAS_CALIENTES].sort()).toEqual(['Cuentas_Pagar', 'Factura_Items', 'Facturas', 'Gastos', 'Pagos', 'Productos'].sort())
  })

  it('primer pull inserta; segundo idéntico no reemplaza; cambio sí', async () => {
    const store = storeMemoria()
    let filas: Record<string, string | number>[] = [{ invoice_id: 'f1', total: 10 }]
    const fetchTablas = vi.fn(async (ts: TableName[]) => Object.fromEntries(ts.map(t => [t, filas])))
    const espejo = crearEspejo({ store, fetchTablas })
    await espejo.init()
    await espejo.pull(['Facturas'])
    expect(store.replaceTable).toHaveBeenCalledTimes(1)
    await espejo.pull(['Facturas'])
    expect(store.replaceTable).toHaveBeenCalledTimes(1)
    filas = [{ invoice_id: 'f1', total: 12 }]
    const cambiadas = await espejo.pull(['Facturas'])
    expect(store.replaceTable).toHaveBeenCalledTimes(2)
    expect(cambiadas).toEqual(['Facturas'])
  })

  it('getAllRows lee del store, no de la red', async () => {
    const store = storeMemoria()
    const fetchTablas = vi.fn(async (ts: TableName[]) => Object.fromEntries(ts.map(t => [t, []])))
    const espejo = crearEspejo({ store, fetchTablas })
    await espejo.init()
    await espejo.pull(['Clientes'])
    fetchTablas.mockClear()
    await espejo.getAllRows('Clientes')
    expect(fetchTablas).not.toHaveBeenCalled()
  })

  it('pulls simultáneos se serializan (cola única)', async () => {
    const store = storeMemoria()
    let resolver!: () => void
    const puerta = new Promise<void>(r => { resolver = r })
    const fetchTablas = vi.fn(async (ts: TableName[]) => { await puerta; return Object.fromEntries(ts.map(t => [t, []])) })
    const espejo = crearEspejo({ store, fetchTablas })
    await espejo.init()
    const p1 = espejo.pull(['Facturas'])
    const p2 = espejo.pull(['Clientes'])
    await new Promise(r => setTimeout(r))
    expect(fetchTablas).toHaveBeenCalledTimes(1)
    resolver()
    await Promise.all([p1, p2])
    expect(fetchTablas).toHaveBeenCalledTimes(2)
  })

  it('onCambio reporta solo tablas modificadas', async () => {
    const store = storeMemoria()
    const onCambio = vi.fn()
    let filas: Record<string, string | number>[] = []
    const espejo = crearEspejo({ store, fetchTablas: async ts => Object.fromEntries(ts.map(t => [t, filas])), onCambio })
    await espejo.init()
    filas = [{ customer_id: 'c1' }]
    // Carga inicial: ambas pasan de desconocidas a cargadas.
    await espejo.pull(['Clientes', 'Proveedores'])
    expect(onCambio).toHaveBeenCalledWith(['Clientes', 'Proveedores'])
    // Segundo pull idéntico: sin cambios ⇒ sin notificación.
    await espejo.pull(['Clientes', 'Proveedores'])
    expect(onCambio).toHaveBeenCalledTimes(1)
  })

  it('estado expone ultimoPull y hashes', async () => {
    const store = storeMemoria()
    let ahora = 1000
    const espejo = crearEspejo({ store, fetchTablas: async ts => Object.fromEntries(ts.map(t => [t, []])), ahora: () => ahora })
    await espejo.init()
    await espejo.pull(['Gastos'])
    ahora = 2000
    await espejo.pull(['Gastos'])
    expect(espejo.estado().ultimoPull).toBe(2000)
    expect(Object.keys(espejo.estado().hashes)).toContain('Gastos')
  })

  it('pull sin tablas: primera vez todas en UNA descarga, luego calientes', async () => {
    const store = storeMemoria()
    const fetchTablas = vi.fn(async (ts: TableName[]) => Object.fromEntries(ts.map(t => [t, []])))
    const espejo = crearEspejo({ store, fetchTablas })
    await espejo.init()
    await espejo.pull()
    expect(fetchTablas.mock.calls[0][0].length).toBeGreaterThan(15) // todas las tablas, 1 llamada
    fetchTablas.mockClear()
    await espejo.pull()
    expect(new Set(fetchTablas.mock.calls.at(-1)![0])).toEqual(new Set(TABLAS_CALIENTES))
  })
})

describe('tablas sin origen (fetchTablas → null)', () => {
  it('se omiten: no se guardan, no cuentan como cambio ni envenenan hash', async () => {
    const store = storeMemoria()
    const onCambio = vi.fn()
    const soportadas = new Set(['Facturas'])
    const fetchTablas = vi.fn(async (ts: TableName[]) =>
      Object.fromEntries(ts.map(t => [t, soportadas.has(t) ? [{ invoice_id: 'x' }] : null]))
    )
    const espejo = crearEspejo({ store, fetchTablas, onCambio })
    await espejo.init()
    const cambiadas = await espejo.pull()
    expect(cambiadas).toEqual(['Facturas'])
    expect(onCambio).toHaveBeenCalledWith(['Facturas'])
    // Segundo pull calientes: solo calientes vuelven a descargarse
    fetchTablas.mockClear()
    await espejo.pull()
    expect(new Set(fetchTablas.mock.calls.at(-1)![0])).toEqual(new Set(TABLAS_CALIENTES))
  })
})

describe('Factura_Items composite PK integration', () => {
  it('full pull cycle with Factura_Items composite PK works', async () => {
    const { crearSqliteStore } = await import('../src/sync/stores/sqlite')
    const { ddlDesdeTables } = await import('../src/sync/ddl')
    const { TABLES } = await import('../src/sheets/tables')
    const { crearEspejo } = await import('../src/sync/espejo')

    const store = await crearSqliteStore(':memory:')
    const ddl = (await ddlDesdeTables()).flatMap(d => [d.create, ...d.indexes])
    await store.init(ddl)

    const espejo = crearEspejo({
      store,
      fetchTablas: async (tablas) => {
        if (tablas.includes('Factura_Items')) {
          return {
            Factura_Items: [
              { invoice_id: 'F-001', linea: 1, descripcion: 'Item 1', cantidad: 1, unit_price: 100, importe: 100, product_id: '' },
              { invoice_id: 'F-001', linea: 2, descripcion: 'Item 2', cantidad: 2, unit_price: 50, importe: 100, product_id: '' }
            ]
          }
        }
        return {}
      }
    })

    const changed = await espejo.pull(['Factura_Items'], { soloVivo: true })
    expect(changed).toContain('Factura_Items')

    const rows = await store.getAllRows('Factura_Items')
    expect(rows).toHaveLength(2)
    expect(rows.find(r => r.linea === 1)!.descripcion).toBe('Item 1')
    expect(rows.find(r => r.linea === 2)!.descripcion).toBe('Item 2')

    const espejo2 = crearEspejo({
      store,
      fetchTablas: async () => ({
        Factura_Items: [
          { invoice_id: 'F-001', linea: 1, descripcion: 'Item 1 MODIFICADO', cantidad: 3, unit_price: 100, importe: 300, product_id: '' },
          { invoice_id: 'F-001', linea: 2, descripcion: 'Item 2', cantidad: 2, unit_price: 50, importe: 100, product_id: '' }
        ]
      })
    })

    const changed2 = await espejo2.pull(['Factura_Items'], { soloVivo: true })
    expect(changed2).toContain('Factura_Items')

    const rows2 = await store.getAllRows('Factura_Items')
    expect(rows2).toHaveLength(2)
    expect(rows2.find(r => r.linea === 1)!.descripcion).toBe('Item 1 MODIFICADO')
    expect(rows2.find(r => r.linea === 1)!.cantidad).toBe(3)

    await store.close()
  })
})
