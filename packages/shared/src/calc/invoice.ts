import type { FacturaItem, InvoiceTotals, EstadoFactura } from '../types/entities'

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function calcImporte(cantidad: number, precio: number): number {
  return round2(cantidad * precio)
}

export function calcInvoiceTotals(items: { cantidad: number; precio_unitario: number }[], ivaPct: number): InvoiceTotals {
  const subtotal = round2(items.reduce((s, i) => s + calcImporte(i.cantidad, i.precio_unitario), 0))
  const iva = round2((subtotal * ivaPct) / 100)
  return { subtotal, iva, total: round2(subtotal + iva) }
}

export function buildFactura(items: { descripcion: string; cantidad: number; precio_unitario: number }[], ivaPct: number): { items: FacturaItem[]; totals: InvoiceTotals } {
  const withImporte = items.map(i => ({ ...i, importe: calcImporte(i.cantidad, i.precio_unitario) }))
  const totals = calcInvoiceTotals(withImporte, ivaPct)
  return { items: withImporte, totals }
}

export function estadoDesdeSaldo(saldo: number, total: number, tienePagos: boolean): EstadoFactura {
  if (saldo <= 0) return 'pagada'
  if (tienePagos) return 'parcial'
  return total === saldo ? 'pendiente' : 'parcial'
}
