import type { FacturaItem, InvoiceTotals, EstadoFactura } from '../types/entities'

export function roundTo(n: number, decimals: number): number {
  const f = Math.pow(10, decimals)
  return Math.round((n + Number.EPSILON) * f) / f
}

export function round2(n: number): number {
  return roundTo(n, 2)
}

export function calcImporte(cantidad: number, precio: number, decimals = 2): number {
  return roundTo(cantidad * precio, decimals)
}

export function calcInvoiceTotals(items: { cantidad: number; unit_price: number }[], ivaPct: number, decimals = 2): InvoiceTotals {
  const subtotal = roundTo(items.reduce((s, i) => s + calcImporte(i.cantidad, i.unit_price, decimals), 0), decimals)
  const iva = roundTo((subtotal * ivaPct) / 100, decimals)
  return { subtotal, iva, total: roundTo(subtotal + iva, decimals) }
}

export function buildFactura(items: { descripcion: string; cantidad: number; unit_price: number }[], ivaPct: number, decimals = 2): { items: FacturaItem[]; totals: InvoiceTotals } {
  const withImporte = items.map(i => ({ ...i, importe: calcImporte(i.cantidad, i.unit_price, decimals) }))
  const totals = calcInvoiceTotals(withImporte, ivaPct, decimals)
  return { items: withImporte, totals }
}

export function estadoDesdeSaldo(saldo: number, total: number, tienePagos: boolean): EstadoFactura {
  if (saldo <= 0) return 'pagada'
  if (tienePagos) return 'parcial'
  return total === saldo ? 'pendiente' : 'parcial'
}
