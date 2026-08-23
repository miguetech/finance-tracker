import { describe, expect, it } from 'vitest'
import { parseComisionesMetodos, comisionTransaccion, parseComisiones } from '../src/reports/comisiones'
import { flujoCaja } from '../src/reports/financieros'
import type { Pago, Gasto } from '../src/types/entities'

const pago = (over: Partial<Pago>): Pago => ({
  id_pago: 'pag_1', tipo: 'cobro', id_origen: 'f1', fecha: '2026-08-15',
  monto: 100, metodo_pago: 'Zelle', notas: '', moneda: 'USD', tipo_cambio: 1,
  ...over
} as Pago)

const _gasto = (over: Partial<Gasto>): Gasto => ({
  id_gasto: 'gas_1', fecha: '2026-08-15', categoria: 'Servicios', descripcion: 'd',
  monto: 50, metodo_pago: 'Efectivo', proveedor: '', moneda: 'USD', tipo_cambio: 1,
  ...over
} as Gasto)

describe('comisiones por método de pago (avanzadas)', () => {
  it('parseComisionesMetodos lee JSON y descarta entradas inválidas', () => {
    const m = parseComisionesMetodos('{"Zelle":{"pct":3,"minimo_fijo":1},"Efectivo":{},"Mal":"x"}')
    expect(m.Zelle).toEqual({ pct: 3, minimo_fijo: 1 })
    expect(m.Efectivo).toBeUndefined()
    expect(m.Mal).toBeUndefined()
  })

  it('parseComisionesMetodos tolera vacío y JSON roto', () => {
    expect(parseComisionesMetodos(undefined)).toEqual({})
    expect(parseComisionesMetodos('{')).toEqual({})
  })

  it('comisionTransaccion cobra el mayor entre % y fijo mínimo', () => {
    expect(comisionTransaccion(100, { pct: 3 })).toBe(3)
    // 3% de 10 = 0.30 < mínimo 1 ⇒ cobra el mínimo
    expect(comisionTransaccion(10, { pct: 3, minimo_fijo: 1 })).toBe(1)
    // 3% de 40 = 1.20 > mínimo 1 ⇒ cobra el %
    expect(comisionTransaccion(40, { pct: 3, minimo_fijo: 1 })).toBe(1.2)
    expect(comisionTransaccion(50, { minimo_fijo: 2 })).toBe(2)
    expect(comisionTransaccion(100)).toBe(0)
  })

  it('flujoCaja suma comisión por transacción (no sobre el agregado)', () => {
    const pagos = [pago({ id_pago: 'a', monto: 10 }), pago({ id_pago: 'b', monto: 10 }), pago({ id_pago: 'c', monto: 200, metodo_pago: 'Efectivo' })]
    const r = flujoCaja(pagos, [], { Zelle: { pct: 3, minimo_fijo: 1 }, Efectivo: {} }, { desde: '', hasta: '' })
    const zelle = r.porMetodo.find(m => m.metodo_pago === 'Zelle')!
    // Dos transacciones de 10 con mínimo 1 ⇒ comisión 2 (no 3% de 20 = 0.6)
    expect(zelle.comisiones).toBe(2)
    const efectivo = r.porMetodo.find(m => m.metodo_pago === 'Efectivo')!
    expect(efectivo.comisiones).toBe(0)
  })

  it('flujoCaja mantiene compatibilidad: pct legacy vía metodos del config global', () => {
    const legacy = parseComisiones('{"metodos":{"Zelle":5}}')
    const convertido = Object.fromEntries(Object.entries(legacy.metodos).map(([k, pct]) => [k, { pct }]))
    const r = flujoCaja([pago({ monto: 100 })], [], convertido, { desde: '', hasta: '' })
    expect(r.porMetodo[0].comisiones).toBe(5)
  })
})
