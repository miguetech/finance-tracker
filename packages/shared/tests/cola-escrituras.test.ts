import { describe, expect, it } from 'vitest'
import {
  cargarCola,
  vaciarCola,
  reencolarErrores,
  descartarErrores,
  conColaEscrituras,
  resumirCola,
  esErrorRed
} from '../src/sync/colaEscrituras'
import type { OperacionEnCola } from '../src/sync/colaEscrituras'
import type { Repository } from '../src/data/repository'
import type { StorageAdapter } from '../src/data/storage'
import type { Config } from '../src/types/entities'

function kvFalso(): StorageAdapter & { mapa: Map<string, string> } {
  const mapa = new Map<string, string>()
  return {
    mapa,
    get: async k => mapa.get(k) ?? null,
    set: async (k, v) => { mapa.set(k, v) },
    remove: async k => { mapa.delete(k) }
  }
}

function repoFalso(sobre?: Partial<Record<string, (...a: unknown[]) => unknown>>): Repository & { llamadas: string[] } {
  const llamadas: string[] = []
  const base = {
    saveCliente: async (c: unknown) => { llamadas.push('saveCliente'); return c },
    deleteGasto: async () => { llamadas.push('deleteGasto') },
    createFactura: async (i: unknown) => { llamadas.push('createFactura'); return i },
    registerPago: async (p: unknown) => { llamadas.push('registerPago'); return p },
    ...sobre
  }
  return Object.assign(base as unknown as Repository, { llamadas })
}

const configFake = { moneda: 'USD', iva_porcentaje: 16 } as Config

describe('cola de escrituras — vaciado', () => {
  it('reproduce en orden FIFO y deja la cola vacía', async () => {
    const s = kvFalso()
    const repo = repoFalso()
    await s.set('ft_cola_escrituras', JSON.stringify([
      { id_op: '1', metodo: 'saveCliente', args: [{ id_cliente: 'c1' }], creado_en: 1, estado: 'pendiente' },
      { id_op: '2', metodo: 'deleteGasto', args: ['g1'], creado_en: 2, estado: 'pendiente' },
      { id_op: '3', metodo: 'createFactura', args: [{ id_cliente: 'c1' }], creado_en: 3, estado: 'pendiente' }
    ] satisfies OperacionEnCola[]))
    const res = await vaciarCola(s, repo)
    expect(res).toEqual({ ejecutadas: 3, fallidas: 0, restantes: 0 })
    expect(repo.llamadas).toEqual(['saveCliente', 'deleteGasto', 'createFactura'])
    expect(await cargarCola(s)).toEqual([])
  })

  it('error de red detiene el vaciado y conserva el resto en orden', async () => {
    const s = kvFalso()
    const repo = repoFalso({
      saveCliente: async () => { throw new Error('Failed to fetch') },
      deleteGasto: async () => {}
    })
    await s.set('ft_cola_escrituras', JSON.stringify([
      { id_op: '1', metodo: 'saveCliente', args: [], creado_en: 1, estado: 'pendiente' },
      { id_op: '2', metodo: 'deleteGasto', args: [], creado_en: 2, estado: 'pendiente' }
    ]))
    const res = await vaciarCola(s, repo)
    expect(res.ejecutadas).toBe(0)
    expect(res.restantes).toBe(2)
    const ops = await cargarCola(s)
    expect(ops.map(o => o.id_op)).toEqual(['1', '2'])
    expect(ops.every(o => o.estado === 'pendiente')).toBe(true)
  })

  it('error de negocio marca la operación y continúa con las siguientes', async () => {
    const s = kvFalso()
    const repo = repoFalso({
      saveCliente: async () => { throw new Error('Cliente no existe') },
      deleteGasto: async () => {}
    })
    await s.set('ft_cola_escrituras', JSON.stringify([
      { id_op: '1', metodo: 'saveCliente', args: [], creado_en: 1, estado: 'pendiente' },
      { id_op: '2', metodo: 'deleteGasto', args: [], creado_en: 2, estado: 'pendiente' }
    ]))
    const res = await vaciarCola(s, repo)
    expect(res).toEqual({ ejecutadas: 1, fallidas: 1, restantes: 0 })
    const ops = await cargarCola(s)
    expect(ops[0].estado).toBe('error')
    expect(ops[0].error).toContain('Cliente no existe')
  })

  it('reintentar reactiva errores; descartar los elimina solo a ellos', async () => {
    const s = kvFalso()
    await s.set('ft_cola_escrituras', JSON.stringify([
      { id_op: '1', metodo: 'saveCliente', args: [], creado_en: 1, estado: 'error', error: 'x' },
      { id_op: '2', metodo: 'deleteGasto', args: [], creado_en: 2, estado: 'pendiente' }
    ]))
    await reencolarErrores(s)
    expect((await cargarCola(s)).every(o => o.estado === 'pendiente')).toBe(true)
    await vaciarCola(s, repoFalso({ saveCliente: async () => { throw new Error('Cliente no existe') }, deleteGasto: async () => {} }))
    // deleteGasto se ejecutó y salió de la cola; el error vuelve a quedar marcado.
    await descartarErrores(s)
    const ops = await cargarCola(s)
    expect(ops).toEqual([])
  })

  it('sin conexión no intenta nada', async () => {
    const s = kvFalso()
    const repo = repoFalso()
    await s.set('ft_cola_escrituras', JSON.stringify([
      { id_op: '1', metodo: 'deleteGasto', args: [], creado_en: 1, estado: 'pendiente' }
    ]))
    const res = await vaciarCola(s, repo, { sigueEnLinea: () => false })
    expect(res.ejecutadas).toBe(0)
    expect(repo.llamadas).toEqual([])
  })
})

describe('conColaEscrituras — envoltorio del repositorio', () => {
  it('activo: no toca el repositorio, encola y devuelve eco con id local', async () => {
    const s = kvFalso()
    const repo = repoFalso()
    const envuelto = conColaEscrituras(repo, { storage: s, activo: () => true, configActual: () => configFake })
    const cliente = await envuelto.saveCliente({ nombre: 'Ana' } as never)
    expect((cliente as { id_cliente?: string }).id_cliente).toMatch(/^cli_/)
    expect(repo.llamadas).toEqual([])
    const cola = await cargarCola(s)
    expect(cola).toHaveLength(1)
    expect(cola[0].metodo).toBe('saveCliente')
    expect((cola[0].args[0] as { id_cliente: string }).id_cliente).toMatch(/^cli_/)
  })

  it('eco de createFactura calcula totales con la config cacheada (encadena pago offline)', async () => {
    const s = kvFalso()
    const repo = repoFalso()
    const envuelto = conColaEscrituras(repo, { storage: s, activo: () => true, configActual: () => configFake })
    const factura = await envuelto.createFactura({
      id_cliente: 'c1',
      items: [{ descripcion: 'A', cantidad: 2, precio_unitario: 100 }],
      fecha_emision: '2026-08-23',
      fecha_vencimiento: '2026-09-23',
      notas: ''
    })
    expect(factura.total).toBe(232) // 200 + IVA 16%
    expect(factura.saldo).toBe(232)
    const pago = await envuelto.registerPago({ tipo: 'cobro', id_origen: factura.id_factura, fecha: '', monto: factura.total, metodo_pago: 'Efectivo', notas: '' })
    expect(pago.monto).toBe(232)
    // Encadenado coherente: el pago encolado referencia el mismo id de factura.
    const cola = await cargarCola(s)
    expect(cola[1].metodo).toBe('registerPago')
    expect((cola[1].args[0] as { id_origen: string }).id_origen).toBe(factura.id_factura)
  })

  it('inactivo: delega directo al repositorio sin encolar', async () => {
    const s = kvFalso()
    const repo = repoFalso()
    const envuelto = conColaEscrituras(repo, { storage: s, activo: () => false })
    await envuelto.deleteGasto('g1')
    expect(repo.llamadas).toEqual(['deleteGasto'])
    expect(await resumirCola(s)).toEqual({ pendientes: 0, errores: 0 })
  })

  it('inactivo con red muerta a mitad: fallo de transporte encola en vez de romper', async () => {
    const s = kvFalso()
    const repo = repoFalso({
      saveCliente: async () => { throw new Error('Failed to fetch') }
    })
    const envuelto = conColaEscrituras(repo, { storage: s, activo: () => false, configActual: () => configFake })
    // No lanza: devuelve eco y la operación queda pendiente para vaciar.
    const eco = await envuelto.saveCliente({ nombre: 'Offline' } as never)
    expect((eco as { id_cliente?: string }).id_cliente).toMatch(/^cli_/)
    expect(repo.llamadas).toEqual([])
    expect(await resumirCola(s)).toEqual({ pendientes: 1, errores: 0 })
  })

  it('inactivo: error de negocio sigue propagando sin encolar', async () => {
    const s = kvFalso()
    const repo = repoFalso({
      saveCliente: async () => { throw new Error('Cliente no existe') }
    })
    const envuelto = conColaEscrituras(repo, { storage: s, activo: () => false })
    await expect(envuelto.saveCliente({} as never)).rejects.toThrow('Cliente no existe')
    expect(await resumirCola(s)).toEqual({ pendientes: 0, errores: 0 })
  })

  it('abort (timeout de red) cuenta como error de transporte', () => {
    const e = new Error('The operation was aborted')
    e.name = 'AbortError'
    expect(esErrorRed(e)).toBe(true)
  })

  it('vaciar tras encolar reproduce contra el repositorio real', async () => {
    const s = kvFalso()
    const repo = repoFalso()
    const envuelto = conColaEscrituras(repo, { storage: s, activo: () => true })
    await envuelto.saveCliente({ nombre: 'B' } as never)
    await envuelto.deleteGasto('g9')
    const res = await vaciarCola(s, repo)
    expect(res.ejecutadas).toBe(2)
    expect(repo.llamadas).toEqual(['saveCliente', 'deleteGasto'])
  })
})

describe('esErrorRed', () => {
  it('distingue transporte de negocio', () => {
    expect(esErrorRed(new Error('Failed to fetch'))).toBe(true)
    expect(esErrorRed(new Error('Sheets API 429: quota'))).toBe(true)
    expect(esErrorRed(new Error('Pago excede saldo disponible'))).toBe(false)
  })
})

describe('escritura encolada dispara eco local en el bus', () => {
  it('onEscrituraLocal recibe metodo y args normalizados (id asignado)', async () => {
    const { espejoBus } = await import('../src/sync/espejoBus')
    const vistas: Array<{ metodo: string; args: unknown[] }> = []
    espejoBus.onEscrituraLocal = (metodo, args) => { vistas.push({ metodo, args }) }
    const s = kvFalso()
    const envuelto = conColaEscrituras(repoFalso(), { storage: s, activo: () => true, configActual: () => configFake })
    await envuelto.saveCliente({ nombre: 'Ana' } as never)
    espejoBus.onEscrituraLocal = undefined
    expect(vistas).toHaveLength(1)
    expect(vistas[0].metodo).toBe('saveCliente')
    expect((vistas[0].args[0] as { id_cliente?: string }).id_cliente).toMatch(/^cli_/)
  })

  it('fuera de modo offline no toca el bus', async () => {
    const { espejoBus } = await import('../src/sync/espejoBus')
    let llamadas = 0
    espejoBus.onEscrituraLocal = () => { llamadas++ }
    const s = kvFalso()
    const envuelto = conColaEscrituras(repoFalso(), { storage: s, activo: () => false })
    await envuelto.deleteGasto('g1')
    espejoBus.onEscrituraLocal = undefined
    expect(llamadas).toBe(0)
  })
})
