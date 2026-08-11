import type { Factura, Gasto, CuentaPagar } from '../types/entities'
import { round2 } from './invoice'

export interface Kpis {
  facturado: number
  cobrado: number
  pendiente: number
  gastos: number
  utilidad: number
  porPagar: number
  vencidas: number
  porVencer: number
}

function inMonth(dateISO: string, mes: string): boolean {
  return dateISO.slice(0, 7) === mes
}

export function kpisForMonth(facturas: Factura[], gastos: Gasto[], cxps: CuentaPagar[], mes: string): Kpis {
  const f = facturas.filter(x => inMonth(x.fecha_emision, mes))
  const facturado = round2(f.reduce((s, x) => s + x.total, 0))
  const cobrado = round2(f.filter(x => x.saldo <= 0).reduce((s, x) => s + x.total, 0))
  const pendiente = round2(f.filter(x => x.saldo > 0).reduce((s, x) => s + x.saldo, 0))
  const gastosMes = round2(gastos.filter(g => inMonth(g.fecha, mes)).reduce((s, g) => s + g.monto, 0))
  const today = new Date().toISOString().slice(0, 10)
  const porPagar = round2(cxps.filter(x => x.saldo > 0).reduce((s, x) => s + x.saldo, 0))
  const vencidas = round2(cxps.filter(x => x.saldo > 0 && x.fecha_vencimiento < today).reduce((s, x) => s + x.saldo, 0))
  const porVencer = round2(cxps.filter(x => x.saldo > 0 && x.fecha_vencimiento >= today).reduce((s, x) => s + x.saldo, 0))
  return { facturado, cobrado, pendiente, gastos: gastosMes, utilidad: round2(cobrado - gastosMes), porPagar, vencidas, porVencer }
}

export function topClientes(facturas: Factura[]): { nombre: string; total: number }[] {
  const map = new Map<string, number>()
  for (const f of facturas) map.set(f.nombre_cliente, round2((map.get(f.nombre_cliente) ?? 0) + f.total))
  return [...map.entries()].map(([nombre, total]) => ({ nombre, total })).sort((a, b) => b.total - a.total).slice(0, 5)
}

export function gastosPorCategoria(gastos: Gasto[]): { categoria: string; total: number }[] {
  const map = new Map<string, number>()
  for (const g of gastos) map.set(g.categoria, round2((map.get(g.categoria) ?? 0) + g.monto))
  return [...map.entries()].map(([categoria, total]) => ({ categoria, total })).sort((a, b) => b.total - a.total)
}
