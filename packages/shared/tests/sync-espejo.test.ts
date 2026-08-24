import { describe, expect, it, vi } from 'vitest'
import { crearEspejo, TABLAS_CALIENTES, type EspejoStore } from '../src/sync/espejo'
import type { TableName } from '../src/sheets/tables'

function storeMemoria(): EspejoStore & { datos: Map<string, unknown[]> } {
  const datos = new Map<string, unknown[]>()
  return {
    datos,
    init: vi.fn(async () => {}),
    getAllRows: async (t) => (datos.get(t) ?? []) as never,
    replaceTable: vi.fn(async (t, filas) => { datos.set(t, filas) }),
    close: vi.fn(async () => {})
  }
}

describe('pipeline del espejo', () => {
  it('TABLAS_CALIENTES contiene las 6 esperadas', () => {
    expect([...TABLAS_CALIENTES].sort()).toEqual(['Cuentas_Pagar', 'Factura_Items', 'Facturas', 'Gastos', 'Pagos', 'Productos'].sort())
  })

  it('primer pull inserta; segundo idéntico no reemplaza; cambio sí', async () => {
    const store = storeMemoria()
    let filas: Record<string, string | number>[] = [{ id_factura: 'f1', total: 10 }]
    const fetchTablas = vi.fn(async (ts: TableName[]) => Object.fromEntries(ts.map(t => [t, filas])))
    const espejo = crearEspejo({ store, fetchTablas })
    await espejo.init()
    await espejo.pull(['Facturas'])
    expect(store.replaceTable).toHaveBeenCalledTimes(1)
    await espejo.pull(['Facturas'])
    expect(store.replaceTable).toHaveBeenCalledTimes(1)
    filas = [{ id_factura: 'f1', total: 12 }]
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
    filas = [{ id_cliente: 'c1' }]
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
      Object.fromEntries(ts.map(t => [t, soportadas.has(t) ? [{ id_factura: 'x' }] : null]))
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
