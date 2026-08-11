import { describe, expect, it } from 'vitest'
import { calcInvoiceTotals, buildFactura, estadoDesdeSaldo } from '../src/calc/invoice'
import { kpisForMonth, topClientes, gastosPorCategoria } from '../src/calc/kpis'
import type { Factura, Gasto, CuentaPagar } from '../src/types/entities'

describe('invoice', () => {
  it('calcula subtotal, iva y total con redondeo', () => {
    const t = calcInvoiceTotals([{ cantidad: 2, precio_unitario: 100.5 }, { cantidad: 1, precio_unitario: 3.33 }], 16)
    expect(t.subtotal).toBe(204.33)
    expect(t.iva).toBe(32.69)
    expect(t.total).toBe(237.02)
  })
  it('buildFactura produce items con importe', () => {
    const b = buildFactura([{ descripcion: 'a', cantidad: 3, precio_unitario: 10 }], 16)
    expect(b.items[0].importe).toBe(30)
    expect(b.totals.total).toBe(34.8)
  })
  it('estadoDesdeSaldo', () => {
    expect(estadoDesdeSaldo(0, 100, false)).toBe('pagada')
    expect(estadoDesdeSaldo(100, 100, false)).toBe('pendiente')
    expect(estadoDesdeSaldo(40, 100, true)).toBe('parcial')
  })
})

describe('kpis', () => {
  const fac: Factura[] = [
    { id_factura: 'f1', folio: 'FAC-001', id_cliente: 'c1', nombre_cliente: 'A', fecha_emision: '2026-08-05', fecha_vencimiento: '', subtotal: 100, iva: 0, total: 100, saldo: 0, fecha_pago: '2026-08-06', notas: '' },
    { id_factura: 'f2', folio: 'FAC-002', id_cliente: 'c2', nombre_cliente: 'B', fecha_emision: '2026-08-10', fecha_vencimiento: '', subtotal: 200, iva: 0, total: 200, saldo: 200, fecha_pago: '', notas: '' },
    { id_factura: 'f3', folio: 'FAC-003', id_cliente: 'c3', nombre_cliente: 'C', fecha_emision: '2026-07-20', fecha_vencimiento: '', subtotal: 50, iva: 0, total: 50, saldo: 50, fecha_pago: '', notas: '' }
  ]
  const gas: Gasto[] = [
    { id_gasto: 'g1', fecha: '2026-08-03', categoria: 'Renta', descripcion: '', monto: 30, metodo_pago: 'Efectivo', proveedor: '' }
  ]
  const cxp: CuentaPagar[] = [
    { id_cxp: 'x1', id_proveedor: 'p1', nombre_proveedor: 'P', folio_documento: '', categoria: '', descripcion: '', fecha_emision: '2026-08-01', fecha_vencimiento: '2026-08-01', monto_total: 500, saldo: 500, estado: 'pendiente', notas: '' },
    { id_cxp: 'x2', id_proveedor: 'p1', nombre_proveedor: 'P', folio_documento: '', categoria: '', descripcion: '', fecha_emision: '2026-08-01', fecha_vencimiento: '2026-09-01', monto_total: 100, saldo: 100, estado: 'pendiente', notas: '' }
  ]

  it('kpis del mes', () => {
    const k = kpisForMonth(fac, gas, cxp, '2026-08')
    expect(k.facturado).toBe(300)
    expect(k.cobrado).toBe(100)
    expect(k.pendiente).toBe(200)
    expect(k.gastos).toBe(30)
    expect(k.utilidad).toBe(70)
    expect(k.porPagar).toBe(600)
    expect(k.vencidas).toBe(500)
    expect(k.porVencer).toBe(100)
  })
  it('topClientes ordena desc', () => {
    const top = topClientes(fac)
    expect(top[0]).toEqual({ nombre: 'B', total: 200 })
  })
  it('gastosPorCategoria agrupa', () => {
    expect(gastosPorCategoria(gas)).toEqual([{ categoria: 'Renta', total: 30 }])
  })
})
