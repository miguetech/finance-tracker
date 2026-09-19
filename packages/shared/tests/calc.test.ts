import { describe, expect, it } from 'vitest'
import { calcInvoiceTotals, buildFactura, estadoDesdeSaldo } from '../src/calc/invoice'
import { kpisForMonth, topClientes, gastosPorCategoria } from '../src/calc/kpis'
import type { Factura, Gasto, CuentaPagar, Pago } from '../src/types/entities'

describe('invoice', () => {
  it('calcula subtotal, iva y total con redondeo', () => {
    const t = calcInvoiceTotals([{ cantidad: 2, unit_price: 100.5 }, { cantidad: 1, unit_price: 3.33 }], 16)
    expect(t.subtotal).toBe(204.33)
    expect(t.iva).toBe(32.69)
    expect(t.total).toBe(237.02)
  })
  it('buildFactura produce items con importe', () => {
    const b = buildFactura([{ descripcion: 'a', cantidad: 3, unit_price: 10 }], 16)
    expect(b.items[0].importe).toBe(30)
    expect(b.totals.total).toBe(34.8)
  })
  it('buildFactura redondea a enteros para monedas sin decimales (CLP/COP)', () => {
    const b = buildFactura([{ descripcion: 'a', cantidad: 1, unit_price: 1.5 }], 0, 0)
    expect(b.items[0].importe).toBe(2)
    expect(b.totals.total).toBe(2)
  })
  it('estadoDesdeSaldo', () => {
    expect(estadoDesdeSaldo(0, 100, false)).toBe('pagada')
    expect(estadoDesdeSaldo(100, 100, false)).toBe('pendiente')
    expect(estadoDesdeSaldo(40, 100, true)).toBe('parcial')
  })
})

describe('kpis', () => {
  const fac: Factura[] = [
    { invoice_id: 'f1', folio: 'FAC-001', customer_id: 'c1', customer_name: 'A', issue_date: '2026-08-05', due_date: '', subtotal: 100, iva: 0, total: 100, saldo: 0, paid_at: '2026-08-06', notas: '', moneda: '', exchange_rate: 1, editada: '', edited_at: '' },
    { invoice_id: 'f2', folio: 'FAC-002', customer_id: 'c2', customer_name: 'B', issue_date: '2026-08-10', due_date: '', subtotal: 200, iva: 0, total: 200, saldo: 200, paid_at: '', notas: '', moneda: '', exchange_rate: 1, editada: '', edited_at: '' },
    { invoice_id: 'f3', folio: 'FAC-003', customer_id: 'c3', customer_name: 'C', issue_date: '2026-07-20', due_date: '', subtotal: 50, iva: 0, total: 50, saldo: 50, paid_at: '', notas: '', moneda: '', exchange_rate: 1, editada: '', edited_at: '' }
  ]
  const gas: Gasto[] = [
    { expense_id: 'g1', fecha: '2026-08-03', categoria: 'Renta', descripcion: '', monto: 30, payment_method: 'Efectivo', proveedor: '', moneda: '', exchange_rate: 1 }
  ]
  const cxp: CuentaPagar[] = [
    { ap_id: 'x1', supplier_id: 'p1', supplier_name: 'P', document_serial: '', categoria: '', descripcion: '', issue_date: '2026-08-01', due_date: '2020-01-01', total_amount: 500, saldo: 500, estado: 'pendiente', notas: '', moneda: '', exchange_rate: 1 },
    { ap_id: 'x2', supplier_id: 'p1', supplier_name: 'P', document_serial: '', categoria: '', descripcion: '', issue_date: '2026-08-01', due_date: '2099-01-01', total_amount: 100, saldo: 100, estado: 'pendiente', notas: '', moneda: '', exchange_rate: 1 }
  ]
  const pag: Pago[] = [
    { payment_id: 'p1', tipo: 'cobro', origin_id: 'f1', fecha: '2026-08-06', monto: 100, payment_method: 'Efectivo', notas: '', moneda: '', exchange_rate: 1 }
  ]

  it('kpis del mes', () => {
    const k = kpisForMonth(fac, gas, cxp, pag, '2026-08')
    expect(k.facturado).toBe(300)
    expect(k.cobrado).toBe(100)
    expect(k.pendiente).toBe(200)
    expect(k.gastos).toBe(30)
    expect(k.utilidad).toBe(70)
    expect(k.porPagar).toBe(600)
    expect(k.vencidas).toBe(500)
    expect(k.porVencer).toBe(100)
  })
  it('cobrado cuenta por fecha de pago, no por emisión', () => {
    const facJun = [{ ...fac[0], invoice_id: 'fJ', issue_date: '2026-06-20', saldo: 0, paid_at: '2026-07-02' }]
    const pagJul: Pago[] = [{ payment_id: 'pJ', tipo: 'cobro', origin_id: 'fJ', fecha: '2026-07-02', monto: 100, payment_method: 'Efectivo', notas: '', moneda: '', exchange_rate: 1 }]
    const kJun = kpisForMonth(facJun, [], [], [], '2026-06')
    expect(kJun.facturado).toBe(100)
    expect(kJun.cobrado).toBe(0)
    const kJul = kpisForMonth(facJun, [], [], pagJul, '2026-07')
    expect(kJul.facturado).toBe(0)
    expect(kJul.cobrado).toBe(100)
  })
  it('topClientes ordena desc', () => {
    const top = topClientes(fac)
    expect(top[0]).toEqual({ nombre: 'B', total: 200 })
  })
  it('gastosPorCategoria agrupa', () => {
    expect(gastosPorCategoria(gas)).toEqual([{ categoria: 'Renta', total: 30 }])
  })
})
