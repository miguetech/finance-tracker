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
    const fetchTable = vi.fn(async (_t: TableName) => filas)
    const espejo = crearEspejo({ store, fetchTable })
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
    const fetchTable = vi.fn(async () => [])
    const espejo = crearEspejo({ store, fetchTable })
    await espejo.init()
    await espejo.pull(['Clientes'])
    fetchTable.mockClear()
    await espejo.getAllRows('Clientes')
    expect(fetchTable).not.toHaveBeenCalled()
  })

  it('pulls simultáneos se serializan (cola única)', async () => {
    const store = storeMemoria()
    let resolver!: () => void
    const puerta = new Promise<void>(r => { resolver = r })
    const fetchTable = vi.fn(async () => { await puerta; return [] })
    const espejo = crearEspejo({ store, fetchTable })
    await espejo.init()
    const p1 = espejo.pull(['Facturas'])
    const p2 = espejo.pull(['Clientes'])
    await new Promise(r => setTimeout(r))
    expect(fetchTable).toHaveBeenCalledTimes(1)
    resolver()
    await Promise.all([p1, p2])
    expect(fetchTable).toHaveBeenCalledTimes(2)
  })

  it('onCambio reporta solo tablas modificadas', async () => {
    const store = storeMemoria()
    const onCambio = vi.fn()
    let filas: Record<string, string | number>[] = []
    const espejo = crearEspejo({ store, fetchTable: async () => filas, onCambio })
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
    const espejo = crearEspejo({ store, fetchTable: async () => [], ahora: () => ahora })
    await espejo.init()
    await espejo.pull(['Gastos'])
    ahora = 2000
    await espejo.pull(['Gastos'])
    expect(espejo.estado().ultimoPull).toBe(2000)
    expect(Object.keys(espejo.estado().hashes)).toContain('Gastos')
  })

  it('pull sin tablas: primera vez todas, luego calientes', async () => {
    const store = storeMemoria()
    const fetchTable = vi.fn(async (_t: TableName) => [])
    const espejo = crearEspejo({ store, fetchTable })
    await espejo.init()
    await espejo.pull()
    expect(fetchTable.mock.calls.length).toBeGreaterThan(15) // todas las tablas
    fetchTable.mockClear()
    await espejo.pull()
    expect(new Set(fetchTable.mock.calls.map(c => c[0]))).toEqual(new Set(TABLAS_CALIENTES))
  })
})
